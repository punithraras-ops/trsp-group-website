const express = require('express');
const db = require('../db');
const { hashPassword, verifyPassword, createSession, destroySession } = require('../lib/auth');
const { google, github, randomState } = require('../lib/oauth');

const router = express.Router();

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
    const redirect = req.body.redirect;

    if (!name || !email || password.length < 8) {
        return back(res, redirect, 'Please enter a name, valid email, and a password of at least 8 characters.');
    }

    try {
        const existing = await db.query('SELECT id FROM users WHERE email = $1', [email]);
        if (existing.rows.length > 0) {
            return back(res, redirect, 'An account with that email already exists. Please log in instead.');
        }

        const passwordHash = await hashPassword(password);
        const result = await db.query(
            'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id',
            [name, email, passwordHash]
        );

        await createSession(res, result.rows[0].id);
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
        const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
        const user = result.rows[0];

        if (!user || !user.password_hash) {
            return back(res, redirect, 'Invalid email or password, or this account uses Google/GitHub sign-in.');
        }

        const valid = await verifyPassword(password, user.password_hash);
        if (!valid) {
            return back(res, redirect, 'Invalid email or password.');
        }

        await createSession(res, user.id);
        res.redirect(safeRedirect(redirect));
    } catch (error) {
        back(res, redirect, 'Something went wrong signing you in. Please try again.');
    }
});

router.get('/logout', async (req, res) => {
    await destroySession(req, res);
    res.redirect('/');
});

async function findOrCreateOAuthUser({ provider, providerId, email, name }) {
    const column = provider === 'google' ? 'google_id' : 'github_id';

    const byProvider = await db.query(`SELECT * FROM users WHERE ${column} = $1`, [providerId]);
    if (byProvider.rows.length > 0) {
        return byProvider.rows[0];
    }

    const byEmail = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    if (byEmail.rows.length > 0) {
        const updated = await db.query(
            `UPDATE users SET ${column} = $1 WHERE id = $2 RETURNING *`,
            [providerId, byEmail.rows[0].id]
        );
        return updated.rows[0];
    }

    const created = await db.query(
        `INSERT INTO users (name, email, ${column}) VALUES ($1, $2, $3) RETURNING *`,
        [name, email, providerId]
    );
    return created.rows[0];
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
        await createSession(res, user.id);
        res.clearCookie('oauth_state', { path: '/' });
        res.clearCookie('oauth_redirect', { path: '/' });
        res.redirect(safeRedirect(redirect));
    } catch (error) {
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
        await createSession(res, user.id);
        res.clearCookie('oauth_state', { path: '/' });
        res.clearCookie('oauth_redirect', { path: '/' });
        res.redirect(safeRedirect(redirect));
    } catch (error) {
        back(res, redirect, 'GitHub sign-in failed. Please try again.');
    }
});

module.exports = router;
