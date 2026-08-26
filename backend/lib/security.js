const { execFile } = require('node:child_process');
const path = require('node:path');
const db = require('../db');
const adminSecurity = require('./adminSecurity');

const FAILED_LOGIN_TYPES = ['login_failed_admin', 'login_failed_staff', '2fa_failed_admin'];
const THRESHOLD_COUNT = 5;
const THRESHOLD_MINUTES = 15;

// In-memory cache so the block-check middleware never hits the DB on the request
// hot path. Fine for this single-dyno deployment; a multi-instance deployment
// would need a shared cache (e.g. Redis) instead.
let blockedIpCache = new Set();
let cacheLoaded = false;

function getAllowlist() {
    return String(process.env.SECURITY_IP_ALLOWLIST || '')
        .split(',')
        .map(ip => ip.trim())
        .filter(Boolean);
}

async function loadBlockedIpCache() {
    if (!db.isDbConfigured()) {
        return;
    }
    const docs = await db.getDb().collection('blocked_ips').find({}, { projection: { _id: 1 } }).toArray();
    blockedIpCache = new Set(docs.map(d => d._id));
    cacheLoaded = true;
}

function isIpBlocked(ip) {
    if (getAllowlist().includes(ip)) {
        return false;
    }
    return blockedIpCache.has(ip);
}

async function blockIp(ip, reason, req) {
    if (!ip || ip === req.ip) {
        throw new Error('Refusing to block the IP making this request.');
    }
    await db.getDb().collection('blocked_ips').updateOne(
        { _id: ip },
        { $set: { reason: reason || 'Manually blocked', blocked_at: new Date(), blocked_by: 'admin' } },
        { upsert: true }
    );
    blockedIpCache.add(ip);
}

async function unblockIp(ip) {
    await db.getDb().collection('blocked_ips').deleteOne({ _id: ip });
    blockedIpCache.delete(ip);
}

async function logSecurityEvent(req, type, detail) {
    if (!db.isDbConfigured()) {
        return;
    }
    await db.getDb().collection('security_events').insertOne({
        type,
        ip: req.ip || (req.headers && req.headers['x-forwarded-for']) || '',
        path: req.path,
        method: req.method,
        detail: detail || {},
        created_at: new Date(),
    });
}

async function recordAppError(err, req) {
    if (!db.isDbConfigured()) {
        return;
    }
    await db.getDb().collection('app_errors').insertOne({
        message: String((err && err.message) || err || 'Unknown error').slice(0, 2000),
        stack: String((err && err.stack) || '').slice(0, 2000),
        path: req ? req.path : '',
        method: req ? req.method : '',
        created_at: new Date(),
        resolved: false,
    });
}

async function getFailedLoginThresholdIps() {
    if (!db.isDbConfigured()) {
        return [];
    }
    const since = new Date(Date.now() - THRESHOLD_MINUTES * 60 * 1000);
    const results = await db.getDb().collection('security_events').aggregate([
        { $match: { type: { $in: FAILED_LOGIN_TYPES }, created_at: { $gte: since } } },
        { $group: { _id: '$ip', count: { $sum: 1 }, last_seen: { $max: '$created_at' } } },
        { $match: { count: { $gte: THRESHOLD_COUNT } } },
        { $sort: { count: -1 } },
    ]).toArray();
    return results
        .filter(r => !blockedIpCache.has(r._id))
        .map(r => ({ ip: r._id, count: r.count, last_seen: r.last_seen }));
}

async function getSecuritySummary() {
    if (!db.isDbConfigured()) {
        return {
            eventCount24h: 0,
            suggestedBlocks: [],
            blockedIps: [],
            recentEvents: [],
            appErrors: [],
            posture: [],
            dependencyScan: null,
        };
    }

    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [eventCount24h, suggestedBlocks, blockedIpDocs, recentEvents, appErrors, adminConfig, totpEnabled, dependencyScan] = await Promise.all([
        db.getDb().collection('security_events').countDocuments({ created_at: { $gte: since24h } }),
        getFailedLoginThresholdIps(),
        db.getDb().collection('blocked_ips').find().sort({ blocked_at: -1 }).toArray(),
        db.getDb().collection('security_events').find().sort({ created_at: -1 }).limit(50).toArray(),
        db.getDb().collection('app_errors').find({ resolved: false }).sort({ created_at: -1 }).limit(50).toArray(),
        db.getDb().collection('admin_config').findOne({ _id: 'main' }),
        adminSecurity.isTotpEnabled(),
        db.getDb().collection('dependency_scan').findOne({ _id: 'latest' }),
    ]);

    const posture = [
        {
            label: 'Two-factor authentication enabled for admin login',
            ok: totpEnabled,
            fixLink: totpEnabled ? null : '/admin/security',
        },
        {
            label: 'Admin password stored securely (not using the fallback environment variable)',
            ok: Boolean(adminConfig && adminConfig.password_hash),
            fixLink: (adminConfig && adminConfig.password_hash) ? null : '/admin/security',
        },
        {
            label: 'Production mode enabled (required for secure cookies)',
            ok: process.env.NODE_ENV === 'production',
            fixLink: null,
        },
    ];

    return {
        eventCount24h,
        suggestedBlocks,
        blockedIps: blockedIpDocs.map(d => ({ ip: d._id, reason: d.reason, blocked_at: d.blocked_at })),
        recentEvents: recentEvents.map(e => ({ ...e, id: e._id.toString() })),
        appErrors: appErrors.map(e => ({ ...e, id: e._id.toString() })),
        posture,
        dependencyScan,
    };
}

async function getAlertCount() {
    if (!db.isDbConfigured()) {
        return 0;
    }
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    return db.getDb().collection('security_events').countDocuments({ created_at: { $gte: since24h } });
}

function runDependencyScan() {
    return new Promise((resolve) => {
        const cwd = path.join(__dirname, '..', '..');
        execFile('npm', ['audit', '--json'], { cwd, timeout: 45000, maxBuffer: 5 * 1024 * 1024 }, async (error, stdout) => {
            // npm audit exits non-zero when it finds vulnerabilities - that's expected
            // behavior, not a failure. Only treat this as a real failure if stdout
            // isn't parseable JSON (e.g. npm missing, registry unreachable, timeout).
            let result;
            try {
                const parsed = JSON.parse(stdout);
                const vulnerabilities = (parsed.metadata && parsed.metadata.vulnerabilities) || { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 };
                const dependencies = (parsed.metadata && parsed.metadata.dependencies) || {};
                const dependencyCount = Object.values(dependencies).reduce((sum, n) => sum + (typeof n === 'number' ? n : 0), 0);
                result = { _id: 'latest', ran_at: new Date(), vulnerabilities, dependency_count: dependencyCount, error: null };
            } catch (parseError) {
                result = { _id: 'latest', ran_at: new Date(), vulnerabilities: null, dependency_count: null, error: (error && error.message) || 'Scan failed - npm audit did not return valid output.' };
            }

            if (db.isDbConfigured()) {
                await db.getDb().collection('dependency_scan').updateOne(
                    { _id: 'latest' },
                    { $set: result },
                    { upsert: true }
                ).catch(() => {});
            }
            resolve(result);
        });
    });
}

module.exports = {
    loadBlockedIpCache,
    isIpBlocked,
    blockIp,
    unblockIp,
    logSecurityEvent,
    recordAppError,
    getFailedLoginThresholdIps,
    getSecuritySummary,
    getAlertCount,
    runDependencyScan,
};
