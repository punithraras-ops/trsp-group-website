const crypto = require('node:crypto');
const express = require('express');
const db = require('../db');
const { hashPassword, verifyPassword, createSession, destroySession, requireAuthPage } = require('../lib/auth');
const { google, github, randomState } = require('../lib/oauth');
const mailer = require('../lib/mailer');
const { authLimiter } = require('../lib/rateLimiters');
const userSecurity = require('../lib/userSecurity');

const router = express.Router();
router.use(['/signup', '/login', '/forgot-password', '/reset-password'], authLimiter);
const VERIFY_TOKEN_HOURS = 24;
const RESET_TOKEN_MINUTES = 30;

function makeToken() {
    return crypto.randomBytes(24).toString('hex');
}

function safeRedirect(value) {
    if (typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')) {
        return value;
    }
    return '/';
}

function back(res, redirect, message) {
    const target = safeRedirect(redirect);
    const separator = target.includes('?') ? '&' : '?';
    res.redirect(`${target}${separator}authError=${encodeURIComponent(message)}`);
}

router.post('/signup', async (req, res) => {
    if (!db.isDbConfigured()) {
        return back(res, req.body.redirect, 'Accounts are not available yet. Please try again later.');
    }

    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const phone = String(req.body.phone || '').trim();
    const address = String(req.body.address || '').trim();
    const redirect = req.body.redirect;

    if (!name || !email || password.length < 8 || !phone || !address) {
        return back(res, redirect, 'Please enter a name, valid email, phone number, address, and a password of at least 8 characters.');
    }

    try {
        const users = db.getDb().collection('users');
        const existing = await users.findOne({ email });
        if (existing) {
            return back(res, redirect, 'An account with that email already exists. Please log in instead.');
        }

        const passwordHash = await hashPassword(password);
        const verifyToken = makeToken();
        const result = await users.insertOne({
            name,
            email,
            password_hash: passwordHash,
            phone,
            address,
            email_verified: false,
            verify_token: verifyToken,
            verify_token_expires: new Date(Date.now() + VERIFY_TOKEN_HOURS * 60 * 60 * 1000),
            created_at: new Date(),
        });

        mailer.sendVerificationEmail({
            to: email,
            name,
            verifyUrl: `${res.locals.site.site_url}/verify-email/${verifyToken}`,
            site: res.locals.site,
        }).catch(() => {});

        await createSession(res, result.insertedId);
        res.redirect(safeRedirect(redirect));
    } catch (error) {
        back(res, redirect, 'Something went wrong creating your account. Please try again.');
    }
});

router.post('/login', async (req, res) => {
    if (!db.isDbConfigured()) {
        return back(res, req.body.redirect, 'Accounts are not available yet. Please try again later.');
    }

    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const redirect = req.body.redirect;

    try {
        const user = await db.getDb().collection('users').findOne({ email });

        if (!user || !user.password_hash) {
            return back(res, redirect, 'Invalid email or password, or this account uses Google/GitHub sign-in.');
        }

        const valid = await verifyPassword(password, user.password_hash);
        if (!valid) {
            return back(res, redirect, 'Invalid email or password.');
        }

        if (await userSecurity.isTotpEnabled(user._id)) {
            await userSecurity.createPendingLogin(res, user._id, safeRedirect(redirect));
            res.redirect('/verify-2fa');
            return;
        }

        await createSession(res, user._id);
        res.redirect(safeRedirect(redirect));
    } catch (error) {
        back(res, redirect, 'Something went wrong signing you in. Please try again.');
    }
});

router.get('/verify-2fa', async (req, res) => {
    const pending = await userSecurity.getPendingLogin(req);
    if (!pending) {
        res.redirect('/');
        return;
    }
    const site = res.locals.site;
    res.render('verify-2fa', {
        pageTitle: `${site.short_name} - Verify Code`,
        pageDescription: 'Two-factor verification.',
        activePage: '',
        error: '',
    });
});

router.post('/verify-2fa', authLimiter, async (req, res) => {
    const pending = await userSecurity.getPendingLogin(req);
    if (!pending) {
        res.redirect('/');
        return;
    }

    const valid = await userSecurity.verifyLoginTotpCode(pending.user_id, req.body.code);
    if (!valid) {
        const site = res.locals.site;
        res.render('verify-2fa', {
            pageTitle: `${site.short_name} - Verify Code`,
            pageDescription: 'Two-factor verification.',
            activePage: '',
            error: 'Invalid or expired code. Please try again.',
        });
        return;
    }

    const redirect = safeRedirect(pending.redirect);
    await userSecurity.clearPendingLogin(req, res);
    await createSession(res, pending.user_id);
    res.redirect(redirect);
});

router.get('/logout', async (req, res) => {
    await destroySession(req, res);
    res.redirect('/');
});

router.post('/account/update-profile', requireAuthPage(), async (req, res) => {
    if (!db.isDbConfigured()) {
        res.redirect('/account');
        return;
    }
    const name = String(req.body.name || '').trim();
    const phone = String(req.body.phone || '').trim();
    const address = String(req.body.address || '').trim();

    const update = {};
    if (name) update.name = name;
    update.phone = phone;
    update.address = address;

    await db.getDb().collection('users').updateOne(
        { _id: db.toId(req.user.id) },
        { $set: update }
    );
    res.redirect('/account?profileUpdated=1');
});

router.post('/account/change-password', requireAuthPage(), async (req, res) => {
    if (!db.isDbConfigured()) {
        res.redirect('/account');
        return;
    }

    const currentPassword = String(req.body.current_password || '');
    const newPassword = String(req.body.new_password || '');
    const confirmPassword = String(req.body.confirm_password || '');

    const users = db.getDb().collection('users');
    const user = await users.findOne({ _id: db.toId(req.user.id) });

    if (!user || !user.password_hash) {
        res.redirect('/account?pwError=' + encodeURIComponent('Password change is not available for this account.'));
        return;
    }

    const valid = await verifyPassword(currentPassword, user.password_hash);
    if (!valid) {
        res.redirect('/account?pwError=' + encodeURIComponent('Current password is incorrect.'));
        return;
    }

    if (newPassword.length < 8 || newPassword !== confirmPassword) {
        res.redirect('/account?pwError=' + encodeURIComponent('New passwords must match and be at least 8 characters.'));
        return;
    }

    const passwordHash = await hashPassword(newPassword);
    await users.updateOne({ _id: user._id }, { $set: { password_hash: passwordHash } });

    res.redirect('/account?pwSuccess=1');
});

router.get('/verify-email/:token', async (req, res) => {
    if (!db.isDbConfigured()) {
        return back(res, '/account', 'Accounts are not available yet. Please try again later.');
    }
    try {
        const users = db.getDb().collection('users');
        const user = await users.findOne({ verify_token: req.params.token, verify_token_expires: { $gt: new Date() } });
        if (!user) {
            return back(res, '/account', 'That verification link is invalid or has expired. Please request a new one.');
        }
        await users.updateOne(
            { _id: user._id },
            { $set: { email_verified: true }, $unset: { verify_token: '', verify_token_expires: '' } }
        );
        res.redirect('/account?verified=1');
    } catch (error) {
        back(res, '/account', 'Something went wrong verifying your email.');
    }
});

router.get('/resend-verification', async (req, res) => {
    if (!req.user || !db.isDbConfigured()) {
        res.redirect('/');
        return;
    }
    try {
        const users = db.getDb().collection('users');
        const user = await users.findOne({ _id: db.toId(req.user.id) });
        if (user && !user.email_verified) {
            const verifyToken = makeToken();
            await users.updateOne(
                { _id: user._id },
                { $set: { verify_token: verifyToken, verify_token_expires: new Date(Date.now() + VERIFY_TOKEN_HOURS * 60 * 60 * 1000) } }
            );
            mailer.sendVerificationEmail({
                to: user.email,
                name: user.name,
                verifyUrl: `${res.locals.site.site_url}/verify-email/${verifyToken}`,
                site: res.locals.site,
            }).catch(() => {});
        }
    } catch (error) {
        // ignore
    }
    res.redirect('/account?resent=1');
});

router.get('/forgot-password', (req, res) => {
    const site = res.locals.site;
    res.render('forgot-password', {
        pageTitle: `${site.short_name} - Forgot Password`,
        pageDescription: 'Reset your account password.',
        activePage: '',
        message: '',
        error: '',
    });
});

router.post('/forgot-password', async (req, res) => {
    const site = res.locals.site;
    const email = String(req.body.email || '').trim().toLowerCase();
    const genericMessage = 'If an account exists for that email, a password reset link has been sent.';

    if (db.isDbConfigured() && email) {
        try {
            const users = db.getDb().collection('users');
            const user = await users.findOne({ email, password_hash: { $exists: true } });
            if (user) {
                const resetToken = makeToken();
                await users.updateOne(
                    { _id: user._id },
                    { $set: { reset_token: resetToken, reset_token_expires: new Date(Date.now() + RESET_TOKEN_MINUTES * 60 * 1000) } }
                );
                mailer.sendPasswordResetEmail({
                    to: user.email,
                    name: user.name,
                    resetUrl: `${site.site_url}/reset-password/${resetToken}`,
                    site,
                }).catch(() => {});
            }
        } catch (error) {
            // fall through to generic message regardless
        }
    }

    res.render('forgot-password', {
        pageTitle: `${site.short_name} - Forgot Password`,
        pageDescription: 'Reset your account password.',
        activePage: '',
        message: genericMessage,
        error: '',
    });
});

router.get('/reset-password/:token', async (req, res) => {
    const site = res.locals.site;
    let valid = false;
    if (db.isDbConfigured()) {
        const user = await db.getDb().collection('users').findOne({
            reset_token: req.params.token,
            reset_token_expires: { $gt: new Date() },
        });
        valid = Boolean(user);
    }
    res.render('reset-password', {
        pageTitle: `${site.short_name} - Reset Password`,
        pageDescription: 'Choose a new password.',
        activePage: '',
        token: req.params.token,
        valid,
        error: '',
    });
});

router.post('/reset-password/:token', async (req, res) => {
    const site = res.locals.site;
    const password = String(req.body.password || '');
    const confirmPassword = String(req.body.confirm_password || '');

    if (!db.isDbConfigured()) {
        return res.render('reset-password', { pageTitle: `${site.short_name} - Reset Password`, pageDescription: 'Choose a new password.', activePage: '', token: req.params.token, valid: false, error: 'Accounts are not available yet.' });
    }

    const users = db.getDb().collection('users');
    const user = await users.findOne({ reset_token: req.params.token, reset_token_expires: { $gt: new Date() } });

    if (!user) {
        return res.render('reset-password', { pageTitle: `${site.short_name} - Reset Password`, pageDescription: 'Choose a new password.', activePage: '', token: req.params.token, valid: false, error: 'This reset link is invalid or has expired. Please request a new one.' });
    }

    if (password.length < 8 || password !== confirmPassword) {
        return res.render('reset-password', { pageTitle: `${site.short_name} - Reset Password`, pageDescription: 'Choose a new password.', activePage: '', token: req.params.token, valid: true, error: 'Passwords must match and be at least 8 characters.' });
    }

    const passwordHash = await hashPassword(password);
    await users.updateOne(
        { _id: user._id },
        { $set: { password_hash: passwordHash }, $unset: { reset_token: '', reset_token_expires: '' } }
    );

    res.redirect('/?openLogin=1&authError=' + encodeURIComponent('Password updated. Please log in.'));
});

async function findOrCreateOAuthUser({ provider, providerId, email, name }) {
    const field = provider === 'google' ? 'google_id' : 'github_id';
    const users = db.getDb().collection('users');

    const byProvider = await users.findOne({ [field]: providerId });
    if (byProvider) {
        return byProvider;
    }

    const byEmail = await users.findOne({ email });
    if (byEmail) {
        await users.updateOne({ _id: byEmail._id }, { $set: { [field]: providerId } });
        return { ...byEmail, [field]: providerId };
    }

    const result = await users.insertOne({
        name,
        email,
        [field]: providerId,
        email_verified: true,
        created_at: new Date(),
    });
    return { _id: result.insertedId, name, email, [field]: providerId };
}

router.get('/auth/google', (req, res) => {
    if (!google.isConfigured()) {
        return back(res, req.query.redirect, 'Google sign-in is not configured yet.');
    }

    const state = randomState();
    res.cookie('oauth_state', state, { httpOnly: true, sameSite: 'lax', maxAge: 10 * 60 * 1000, path: '/' });
    res.cookie('oauth_redirect', safeRedirect(req.query.redirect), { httpOnly: true, sameSite: 'lax', maxAge: 10 * 60 * 1000, path: '/' });
    res.redirect(google.authorizeUrl(state));
});

router.get('/auth/google/callback', async (req, res) => {
    const redirect = req.cookies.oauth_redirect || '/';

    if (!google.isConfigured() || !db.isDbConfigured()) {
        return back(res, redirect, 'Google sign-in is not available right now.');
    }

    if (!req.query.state || req.query.state !== req.cookies.oauth_state) {
        return back(res, redirect, 'Login session expired. Please try again.');
    }

    try {
        const profile = await google.exchangeCodeForProfile(req.query.code);
        const user = await findOrCreateOAuthUser({ provider: 'google', providerId: profile.providerId, email: profile.email, name: profile.name });
        res.clearCookie('oauth_state', { path: '/' });
        res.clearCookie('oauth_redirect', { path: '/' });

        if (await userSecurity.isTotpEnabled(user._id)) {
            await userSecurity.createPendingLogin(res, user._id, safeRedirect(redirect));
            res.redirect('/verify-2fa');
            return;
        }

        await createSession(res, user._id);
        res.redirect(safeRedirect(redirect));
    } catch (error) {
        console.error('Google OAuth callback failed:', error.message);
        back(res, redirect, 'Google sign-in failed. Please try again.');
    }
});

router.get('/auth/github', (req, res) => {
    if (!github.isConfigured()) {
        return back(res, req.query.redirect, 'GitHub sign-in is not configured yet.');
    }

    const state = randomState();
    res.cookie('oauth_state', state, { httpOnly: true, sameSite: 'lax', maxAge: 10 * 60 * 1000, path: '/' });
    res.cookie('oauth_redirect', safeRedirect(req.query.redirect), { httpOnly: true, sameSite: 'lax', maxAge: 10 * 60 * 1000, path: '/' });
    res.redirect(github.authorizeUrl(state));
});

router.get('/auth/github/callback', async (req, res) => {
    const redirect = req.cookies.oauth_redirect || '/';

    if (!github.isConfigured() || !db.isDbConfigured()) {
        return back(res, redirect, 'GitHub sign-in is not available right now.');
    }

    if (!req.query.state || req.query.state !== req.cookies.oauth_state) {
        return back(res, redirect, 'Login session expired. Please try again.');
    }

    try {
        const profile = await github.exchangeCodeForProfile(req.query.code);
        const user = await findOrCreateOAuthUser({ provider: 'github', providerId: profile.providerId, email: profile.email, name: profile.name });
        res.clearCookie('oauth_state', { path: '/' });
        res.clearCookie('oauth_redirect', { path: '/' });

        if (await userSecurity.isTotpEnabled(user._id)) {
            await userSecurity.createPendingLogin(res, user._id, safeRedirect(redirect));
            res.redirect('/verify-2fa');
            return;
        }

        await createSession(res, user._id);
        res.redirect(safeRedirect(redirect));
    } catch (error) {
        console.error('GitHub OAuth callback failed:', error.message);
        back(res, redirect, 'GitHub sign-in failed. Please try again.');
    }
});

module.exports = router;
