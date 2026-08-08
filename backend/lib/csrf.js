const crypto = require('node:crypto');

const CSRF_COOKIE = 'csrf_token';
const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function ensureToken(req, res, next) {
    let token = req.cookies ? req.cookies[CSRF_COOKIE] : null;
    if (!token) {
        token = crypto.randomBytes(32).toString('hex');
        res.cookie(CSRF_COOKIE, token, {
            httpOnly: false,
            sameSite: 'lax',
            secure: process.env.NODE_ENV === 'production',
            maxAge: 24 * 60 * 60 * 1000,
            path: '/',
        });
    }
    res.locals.csrfToken = token;
    req.csrfToken = token;
    next();
}

function verify(req, res, next) {
    if (!STATE_CHANGING_METHODS.has(req.method)) {
        next();
        return;
    }

    const cookieToken = req.cookies ? req.cookies[CSRF_COOKIE] : null;
    const submittedToken = (req.body && req.body._csrf) || req.headers['x-csrf-token'];

    const cookieBuf = Buffer.from(String(cookieToken || ''));
    const submittedBuf = Buffer.from(String(submittedToken || ''));
    const valid = cookieToken && submittedToken
        && cookieBuf.length === submittedBuf.length
        && crypto.timingSafeEqual(cookieBuf, submittedBuf);

    if (!valid) {
        const wantsJson = req.xhr || (req.headers.accept || '').includes('application/json') || (req.headers['content-type'] || '').includes('application/json');
        if (wantsJson) {
            res.status(403).json({ error: 'Your session security token expired or is invalid. Please refresh the page and try again.' });
        } else {
            res.status(403).send('Your session security token expired or is invalid. Please go back, refresh the page, and try again.');
        }
        return;
    }

    next();
}

module.exports = { ensureToken, verify, CSRF_COOKIE };
