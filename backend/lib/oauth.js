const crypto = require('node:crypto');

function baseUrl() {
    return process.env.SITE_URL || 'http://localhost:3000';
}

const google = {
    isConfigured: () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),

    authorizeUrl(state) {
        const params = new URLSearchParams({
            client_id: process.env.GOOGLE_CLIENT_ID,
            redirect_uri: `${baseUrl()}/auth/google/callback`,
            response_type: 'code',
            scope: 'openid email profile',
            state,
            access_type: 'online',
            prompt: 'select_account',
        });
        return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    },

    async exchangeCodeForProfile(code) {
        const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                code,
                client_id: process.env.GOOGLE_CLIENT_ID,
                client_secret: process.env.GOOGLE_CLIENT_SECRET,
                redirect_uri: `${baseUrl()}/auth/google/callback`,
                grant_type: 'authorization_code',
            }),
        });

        const tokenData = await tokenResponse.json();
        if (!tokenResponse.ok || !tokenData.access_token) {
            throw new Error(tokenData.error_description || 'Google token exchange failed.');
        }

        const profileResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: `Bearer ${tokenData.access_token}` },
        });
        const profile = await profileResponse.json();

        if (!profile.sub) {
            throw new Error('Unable to read Google profile.');
        }

        return {
            providerId: profile.sub,
            email: profile.email,
            name: profile.name || profile.email,
        };
    },
};

const github = {
    isConfigured: () => Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET),

    authorizeUrl(state) {
        const params = new URLSearchParams({
            client_id: process.env.GITHUB_CLIENT_ID,
            redirect_uri: `${baseUrl()}/auth/github/callback`,
            scope: 'read:user user:email',
            state,
        });
        return `https://github.com/login/oauth/authorize?${params.toString()}`;
    },

    async exchangeCodeForProfile(code) {
        const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                Accept: 'application/json',
            },
            body: new URLSearchParams({
                code,
                client_id: process.env.GITHUB_CLIENT_ID,
                client_secret: process.env.GITHUB_CLIENT_SECRET,
                redirect_uri: `${baseUrl()}/auth/github/callback`,
            }),
        });

        const tokenData = await tokenResponse.json();
        if (!tokenResponse.ok || !tokenData.access_token) {
            throw new Error(tokenData.error_description || 'GitHub token exchange failed.');
        }

        const headers = {
            Authorization: `Bearer ${tokenData.access_token}`,
            Accept: 'application/vnd.github+json',
            'User-Agent': 'trsp-group-website',
        };

        const profileResponse = await fetch('https://api.github.com/user', { headers });
        const profile = await profileResponse.json();

        if (!profile.id) {
            throw new Error('Unable to read GitHub profile.');
        }

        let email = profile.email;
        if (!email) {
            const emailsResponse = await fetch('https://api.github.com/user/emails', { headers });
            const emails = await emailsResponse.json();
            const primary = Array.isArray(emails) ? emails.find(e => e.primary && e.verified) || emails[0] : null;
            email = primary ? primary.email : `${profile.login}@users.noreply.github.com`;
        }

        return {
            providerId: String(profile.id),
            email,
            name: profile.name || profile.login,
        };
    },
};

function randomState() {
    return crypto.randomBytes(16).toString('hex');
}

module.exports = { google, github, randomState };
