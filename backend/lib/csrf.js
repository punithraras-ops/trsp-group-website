const crypto = require('node:crypto');

const CSRF_COOKIE = 'csrf_token';
const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Multipart bodies (file uploads) aren't parsed at the point the global
// verify() middleware runs - only multer, applied per-route, can read them.
// These exact routes defer their check to verifyAfterUpload(), called
// explicitly right after their upload middleware once req.body is actually
// populated. Every other route is checked in verify() as normal, so a
// multipart request aimed at a route NOT on this list (e.g. one that needs
// no body data at all) is still correctly rejected rather than bypassing
// the check entirely.
function isKnownMultipartRoute(req) {
    return req.path === '/admin/products'
        || /^\/admin\/products\/[^/]+\/(images|deliverable)$/.test(req.path)
        || /^\/admin\/design\/upload\/[^/]+$/.test(req.path)
        || /^\/admin\/orders\/[^/]+\/deliverable$/.test(req.path)
        || /^\/admin\/services\/[^/]+\/background$/.test(req.path)
        || /^\/admin\/tickets\/[^/]+\/deliverable$/.test(req.path);
}

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

function reject(req, res) {
    const wantsJson = req.xhr || (req.headers.accept || '').includes('application/json') || (req.headers['content-type'] || '').includes('application/json');
    if (wantsJson) {
        res.status(403).json({ error: 'Your session security token expired or is invalid. Please refresh the page and try again.' });
    } else {
        res.status(403).send('Your session security token expired or is invalid. Please go back, refresh the page, and try again.');
    }
}

function checkToken(req) {
    const cookieToken = req.cookies ? req.cookies[CSRF_COOKIE] : null;
    const submittedToken = (req.body && req.body._csrf) || req.headers['x-csrf-token'];

    const cookieBuf = Buffer.from(String(cookieToken || ''));
    const submittedBuf = Buffer.from(String(submittedToken || ''));
    return Boolean(cookieToken) && Boolean(submittedToken)
        && cookieBuf.length === submittedBuf.length
        && crypto.timingSafeEqual(cookieBuf, submittedBuf);
}

function verify(req, res, next) {
    if (!STATE_CHANGING_METHODS.has(req.method)) {
        next();
        return;
    }

    // Defer to verifyAfterUpload(), called explicitly after multer on these routes.
    if ((req.headers['content-type'] || '').startsWith('multipart/form-data') && isKnownMultipartRoute(req)) {
        next();
        return;
    }

    if (!checkToken(req)) {
        reject(req, res);
        return;
    }

    next();
}

// Used explicitly (never wired globally) on routes that accept file uploads,
// placed after the multer middleware so req.body is actually populated.
function verifyAfterUpload(req, res, next) {
    if (!checkToken(req)) {
        reject(req, res);
        return;
    }
    next();
}

module.exports = { ensureToken, verify, verifyAfterUpload, CSRF_COOKIE };
