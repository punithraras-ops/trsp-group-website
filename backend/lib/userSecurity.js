const crypto = require('node:crypto');
const db = require('../db');
const totp = require('./totp');

const PENDING_COOKIE = 'pending_2fa';

async function isTotpEnabled(userId) {
    if (!db.isDbConfigured()) {
        return false;
    }
    const user = await db.getDb().collection('users').findOne(
        { _id: db.toId(userId) },
        { projection: { totp_enabled: 1, totp_secret: 1 } }
    );
    return Boolean(user && user.totp_enabled && user.totp_secret);
}

async function startTotpEnrollment(userId, email) {
    const secret = totp.generateSecret();
    await db.getDb().collection('users').updateOne(
        { _id: db.toId(userId) },
        { $set: { pending_totp_secret: secret } }
    );
    return { secret, url: totp.otpauthUrl(secret, email, 'Technical of RSP Groups') };
}

async function confirmTotpEnrollment(userId, code) {
    const user = await db.getDb().collection('users').findOne({ _id: db.toId(userId) });
    if (!user || !user.pending_totp_secret) {
        return false;
    }
    if (!totp.verifyToken(user.pending_totp_secret, code)) {
        return false;
    }
    await db.getDb().collection('users').updateOne(
        { _id: db.toId(userId) },
        {
            $set: { totp_secret: user.pending_totp_secret, totp_enabled: true },
            $unset: { pending_totp_secret: '' },
        }
    );
    return true;
}

async function disableTotp(userId, code) {
    const user = await db.getDb().collection('users').findOne({ _id: db.toId(userId) });
    if (!user || !user.totp_enabled || !user.totp_secret) {
        return false;
    }
    if (!totp.verifyToken(user.totp_secret, code)) {
        return false;
    }
    await db.getDb().collection('users').updateOne(
        { _id: db.toId(userId) },
        { $set: { totp_enabled: false }, $unset: { totp_secret: '' } }
    );
    return true;
}

async function verifyLoginTotpCode(userId, code) {
    const user = await db.getDb().collection('users').findOne({ _id: db.toId(userId) });
    if (!user || !user.totp_enabled || !user.totp_secret) {
        return false;
    }
    return totp.verifyToken(user.totp_secret, code);
}

async function createPendingLogin(res, userId, redirect) {
    const token = crypto.randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
    await db.getDb().collection('pending_logins').insertOne({
        _id: token,
        user_id: db.toId(userId),
        redirect,
        created_at: new Date(),
        expires_at: expiresAt,
    });
    res.cookie(PENDING_COOKIE, token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 5 * 60 * 1000,
        path: '/',
    });
}

async function getPendingLogin(req) {
    const token = req.cookies ? req.cookies[PENDING_COOKIE] : null;
    if (!token || !db.isDbConfigured()) {
        return null;
    }
    return db.getDb().collection('pending_logins').findOne({ _id: token, expires_at: { $gt: new Date() } });
}

async function clearPendingLogin(req, res) {
    const token = req.cookies ? req.cookies[PENDING_COOKIE] : null;
    if (token && db.isDbConfigured()) {
        await db.getDb().collection('pending_logins').deleteOne({ _id: token });
    }
    res.clearCookie(PENDING_COOKIE, { path: '/' });
}

module.exports = {
    isTotpEnabled,
    startTotpEnrollment,
    confirmTotpEnrollment,
    disableTotp,
    verifyLoginTotpCode,
    createPendingLogin,
    getPendingLogin,
    clearPendingLogin,
};
