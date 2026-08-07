const express = require('express');
const db = require('../db');

const router = express.Router();

function validateSubmission(payload) {
    const name = String(payload.name || '').trim();
    const email = String(payload.email || '').trim();
    const phone = String(payload.phone || '').trim();
    const service = String(payload.service || '').trim();
    const message = String(payload.message || '').trim();

    if (!name || !email || !message) {
        return { ok: false, error: 'Name, email, and message are required.' };
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(email)) {
        return { ok: false, error: 'Please enter a valid email address.' };
    }

    return { ok: true, data: { name, email, phone, service, message } };
}

router.post('/api/contact', async (req, res) => {
    if (!db.isDbConfigured()) {
        res.status(503).json({ error: 'The contact form is temporarily unavailable. Please email us directly.' });
        return;
    }

    const validation = validateSubmission(req.body || {});
    if (!validation.ok) {
        res.status(422).json({ error: validation.error });
        return;
    }

    try {
        await db.getDb().collection('contact_submissions').insertOne({
            ...validation.data,
            created_at: new Date(),
        });
        res.status(201).json({ message: 'Message received successfully.' });
    } catch (error) {
        res.status(500).json({ error: 'Unable to save your message right now.' });
    }
});

module.exports = router;
