const crypto = require('node:crypto');
const { promisify } = require('node:util');
const db = require('../db');

const scrypt = promisify(crypto.scrypt);
const SESSION_COOKIE = 'sid';
const SESSION_DAYS = 30;
const ADMIN_SESSION_COOKIE = 'admin_sid';
const ADMIN_SESSION_HOURS = 12;

async function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const derived = await scrypt(password, salt, 64);
    return `${salt}:${derived.toString('hex')}`;
}

async function verifyPassword(password, stored) {
    if (!stored || !stored.includes(':')) {
        return false;
    }
    const [salt, hashHex] = stored.split(':');
    const derived = await scrypt(password, salt, 64);
    const storedBuf = Buffer.from(hashHex, 'hex');
    if (storedBuf.length !== derived.length) {
        return false;
    }
    return crypto.timingSafeEqual(derived, storedBuf);
}

async function createSession(res, userId) {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
    await db.getDb().collection('sessions').insertOne({
        _id: token,
        user_id: db.toId(userId),
        created_at: new Date(),
        expires_at: expiresAt,
    });
    res.cookie(SESSION_COOKIE, token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
        path: '/',
    });
    return token;
}

async function destroySession(req, res) {
    const token = req.cookies ? req.cookies[SESSION_COOKIE] : null;
    if (token && db.isDbConfigured()) {
        await db.getDb().collection('sessions').deleteOne({ _id: token });
    }
    res.clearCookie(SESSION_COOKIE, { path: '/' });
}

async function attachUser(req, res, next) {
    req.user = null;

    if (!db.isDbConfigured()) {
        res.locals.user = null;
        next();
        return;
    }

    const token = req.cookies ? req.cookies[SESSION_COOKIE] : null;
    if (!token) {
        res.locals.user = null;
        next();
        return;
    }

    try {
        const session = await db.getDb().collection('sessions').findOne({ _id: token, expires_at: { $gt: new Date() } });

        if (session) {
            const user = await db.getDb().collection('users').findOne(
                { _id: session.user_id },
                { projection: { name: 1, email: 1 } }
            );
            req.user = user ? db.withId(user) : null;
        }
    } catch (error) {
        req.user = null;
    }

    res.locals.user = req.user;
    next();
}

function requireAuthPage() {
    return (req, res, next) => {
        if (!req.user) {
            const redirectTo = encodeURIComponent(req.originalUrl);
            res.redirect(`/?openLogin=1&redirect=${redirectTo}`);
            return;
        }
        next();
    };
}

function requireAuthApi(req, res, next) {
    if (!req.user) {
        res.status(401).json({ error: 'You must be logged in.' });
        return;
    }
    next();
}

function checkAdminCredentials(username, password) {
    const adminUser = process.env.ADMIN_USER || 'admin';
    const adminPassword = process.env.ADMIN_PASSWORD || '';

    if (!adminPassword) {
        return false;
    }

    const userBuf = Buffer.from(String(username || ''));
    const adminUserBuf = Buffer.from(adminUser);
    const passBuf = Buffer.from(String(password || ''));
    const adminPassBuf = Buffer.from(adminPassword);

    const userMatches = userBuf.length === adminUserBuf.length && crypto.timingSafeEqual(userBuf, adminUserBuf);
    const passMatches = passBuf.length === adminPassBuf.length && crypto.timingSafeEqual(passBuf, adminPassBuf);

    return userMatches && passMatches;
}

async function createAdminSession(res, req) {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + ADMIN_SESSION_HOURS * 60 * 60 * 1000);

    if (db.isDbConfigured()) {
        await db.getDb().collection('admin_sessions').insertOne({ _id: token, created_at: new Date(), expires_at: expiresAt });
    }

    res.cookie(ADMIN_SESSION_COOKIE, token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: ADMIN_SESSION_HOURS * 60 * 60 * 1000,
        path: '/',
    });
}

async function destroyAdminSession(req, res) {
    const token = req.cookies ? req.cookies[ADMIN_SESSION_COOKIE] : null;
    if (token && db.isDbConfigured()) {
        await db.getDb().collection('admin_sessions').deleteOne({ _id: token });
    }
    res.clearCookie(ADMIN_SESSION_COOKIE, { path: '/' });
}

async function requireAdmin(req, res, next) {
    const adminPassword = process.env.ADMIN_PASSWORD || '';

    if (!adminPassword) {
        res.status(500).send('Admin panel is not configured. Set the ADMIN_PASSWORD environment variable.');
        return;
    }

    // If the database is unavailable, admin_sessions can't be checked or created,
    // so fall back to HTTP Basic Auth to keep the admin panel reachable.
    if (!db.isDbConfigured()) {
        const header = req.headers.authorization || '';
        const match = /^Basic\s+(.+)$/i.exec(header);
        if (match) {
            const decoded = Buffer.from(match[1], 'base64').toString('utf8');
            const separatorIndex = decoded.indexOf(':');
            const providedUser = separatorIndex === -1 ? decoded : decoded.slice(0, separatorIndex);
            const providedPassword = separatorIndex === -1 ? '' : decoded.slice(separatorIndex + 1);
            if (checkAdminCredentials(providedUser, providedPassword)) {
                next();
                return;
            }
        }
        res.set('WWW-Authenticate', 'Basic realm="Admin Panel"');
        res.status(401).send('Authentication required.');
        return;
    }

    const token = req.cookies ? req.cookies[ADMIN_SESSION_COOKIE] : null;
    if (token) {
        try {
            const session = await db.getDb().collection('admin_sessions').findOne({ _id: token, expires_at: { $gt: new Date() } });
            if (session) {
                next();
                return;
            }
        } catch (error) {
            // fall through to login redirect
        }
    }

    res.redirect(`/admin/login?redirect=${encodeURIComponent(req.originalUrl)}`);
}

module.exports = {
    hashPassword,
    verifyPassword,
    createSession,
    destroySession,
    attachUser,
    requireAuthPage,
    requireAuthApi,
    requireAdmin,
    checkAdminCredentials,
    createAdminSession,
    destroyAdminSession,
};
