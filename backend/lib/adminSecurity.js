const crypto = require('node:crypto');
const { promisify } = require('node:util');
const db = require('../db');
const totp = require('./totp');

const scrypt = promisify(crypto.scrypt);
const CONFIG_ID = 'main';
const PENDING_COOKIE = 'admin_pending';
const RESET_TOKEN_MINUTES = 10;

async function hashValue(value) {
    const salt = crypto.randomBytes(16).toString('hex');
    const derived = await scrypt(value, salt, 64);
    return `${salt}:${derived.toString('hex')}`;
}

async function verifyHash(value, stored) {
    if (!stored || !stored.includes(':')) {
        return false;
    }
    const [salt, hashHex] = stored.split(':');
    const derived = await scrypt(value, salt, 64);
    const storedBuf = Buffer.from(hashHex, 'hex');
    if (storedBuf.length !== derived.length) {
        return false;
    }
    return crypto.timingSafeEqual(derived, storedBuf);
}

async function getConfig() {
    if (!db.isDbConfigured()) {
        return null;
    }
    const existing = await db.getDb().collection('admin_config').findOne({ _id: CONFIG_ID });
    return existing || { _id: CONFIG_ID };
}

function timingSafeStringEqual(a, b) {
    const bufA = Buffer.from(String(a || ''));
    const bufB = Buffer.from(String(b || ''));
    return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

async function checkAdminPassword(username, password) {
    const adminUser = process.env.ADMIN_USER || 'admin';
    if (!timingSafeStringEqual(username, adminUser)) {
        return false;
    }

    const config = await getConfig();

    if (config && config.password_hash) {
        return verifyHash(password, config.password_hash);
    }

    const envPassword = process.env.ADMIN_PASSWORD || '';
    if (!envPassword) {
        return false;
    }
    return timingSafeStringEqual(password, envPassword);
}

async function setAdminPassword(newPassword) {
    const hash = await hashValue(newPassword);
    await db.getDb().collection('admin_config').updateOne(
        { _id: CONFIG_ID },
        { $set: { password_hash: hash, updated_at: new Date() } },
        { upsert: true }
    );
}

async function isTotpEnabled() {
    const config = await getConfig();
    return Boolean(config && config.totp_enabled && config.totp_secret);
}

async function startTotpEnrollment() {
    const secret = totp.generateSecret();
    await db.getDb().collection('admin_config').updateOne(
        { _id: CONFIG_ID },
        { $set: { pending_totp_secret: secret, updated_at: new Date() } },
        { upsert: true }
    );
    const adminUser = process.env.ADMIN_USER || 'admin';
    return { secret, url: totp.otpauthUrl(secret, adminUser, 'Technical of RSP Groups') };
}

async function confirmTotpEnrollment(code) {
    const config = await getConfig();
    if (!config || !config.pending_totp_secret) {
        return false;
    }
    if (!totp.verifyToken(config.pending_totp_secret, code)) {
        return false;
    }
    await db.getDb().collection('admin_config').updateOne(
        { _id: CONFIG_ID },
        {
            $set: { totp_secret: config.pending_totp_secret, totp_enabled: true, updated_at: new Date() },
            $unset: { pending_totp_secret: '' },
        }
    );
    return true;
}

async function disableTotp(code) {
    const config = await getConfig();
    if (!config || !config.totp_enabled || !config.totp_secret) {
        return false;
    }
    if (!totp.verifyToken(config.totp_secret, code)) {
        return false;
    }
    await db.getDb().collection('admin_config').updateOne(
        { _id: CONFIG_ID },
        { $set: { totp_enabled: false, updated_at: new Date() }, $unset: { totp_secret: '' } }
    );
    return true;
}

async function verifyLoginTotpCode(code) {
    const config = await getConfig();
    if (!config || !config.totp_enabled || !config.totp_secret) {
        return false;
    }
    return totp.verifyToken(config.totp_secret, code);
}

async function createPendingLogin(res, redirect) {
    const token = crypto.randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
    await db.getDb().collection('admin_pending_logins').insertOne({ _id: token, redirect, created_at: new Date(), expires_at: expiresAt });
    res.cookie(PENDING_COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 5 * 60 * 1000, path: '/' });
}

async function getPendingLogin(req) {
    const token = req.cookies ? req.cookies[PENDING_COOKIE] : null;
    if (!token || !db.isDbConfigured()) {
        return null;
    }
    return db.getDb().collection('admin_pending_logins').findOne({ _id: token, expires_at: { $gt: new Date() } });
}

async function clearPendingLogin(req, res) {
    const token = req.cookies ? req.cookies[PENDING_COOKIE] : null;
    if (token && db.isDbConfigured()) {
        await db.getDb().collection('admin_pending_logins').deleteOne({ _id: token });
    }
    res.clearCookie(PENDING_COOKIE, { path: '/' });
}

async function createPasswordResetToken() {
    const token = crypto.randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + RESET_TOKEN_MINUTES * 60 * 1000);
    await db.getDb().collection('admin_config').updateOne(
        { _id: CONFIG_ID },
        { $set: { reset_token: token, reset_token_expires: expiresAt, updated_at: new Date() } },
        { upsert: true }
    );
    return token;
}

async function consumePasswordResetToken(token) {
    const config = await getConfig();
    if (!config || !config.reset_token || !config.reset_token_expires) {
        return false;
    }
    if (config.reset_token_expires < new Date()) {
        return false;
    }
    if (!timingSafeStringEqual(token, config.reset_token)) {
        return false;
    }
    await db.getDb().collection('admin_config').updateOne(
        { _id: CONFIG_ID },
        { $unset: { reset_token: '', reset_token_expires: '' }, $set: { updated_at: new Date() } }
    );
    return true;
}

module.exports = {
    checkAdminPassword,
    setAdminPassword,
    isTotpEnabled,
    startTotpEnrollment,
    confirmTotpEnrollment,
    disableTotp,
    verifyLoginTotpCode,
    createPendingLogin,
    getPendingLogin,
    clearPendingLogin,
    createPasswordResetToken,
    consumePasswordResetToken,
};
