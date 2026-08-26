const express = require('express');
const multer = require('multer');
const db = require('../db');
const site = require('../config/site');
const { verifyPassword, createStaffSession, destroyStaffSession, requireStaff } = require('../lib/auth');
const { staffLoginLimiter } = require('../lib/rateLimiters');
const csrf = require('../lib/csrf');
const auditLog = require('../lib/auditLog');
const mailer = require('../lib/mailer');
const security = require('../lib/security');

const router = express.Router();
// Same size limit as the admin deliverable upload - project files can be large.
const uploadDeliverable = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });

function logStaffAction(req, action, details) {
    return auditLog.log(req, action, details);
}

function safeStaffRedirect(value) {
    if (typeof value === 'string' && value.startsWith('/staff')) {
        return value;
    }
    return '/staff/tickets';
}

// A staff account with service_id === null is scoped to ALL stores, so its
// ticket filter must omit service_id entirely rather than matching { service_id: null }
// (which would only match tickets with no store assigned - the opposite of "all").
function ticketFilter(req, ticketId) {
    const filter = { _id: db.toId(ticketId) };
    if (req.staffUser.service_id) {
        filter.service_id = req.staffUser.service_id;
    }
    return filter;
}

router.get('/staff/login', (req, res) => {
    res.render('staff-login', { site, redirect: safeStaffRedirect(req.query.redirect), error: '' });
});

router.post('/staff/login', staffLoginLimiter, async (req, res) => {
    const redirect = safeStaffRedirect(req.body.redirect);

    if (!db.isDbConfigured()) {
        res.render('staff-login', { site, redirect, error: 'Staff login is not available right now.' });
        return;
    }

    const email = String(req.body.email || '').trim().toLowerCase();
    const staff = await db.getDb().collection('staff_accounts').findOne({ email });
    const valid = staff && staff.is_active && await verifyPassword(req.body.password || '', staff.password_hash);

    if (!valid) {
        security.logSecurityEvent(req, 'login_failed_staff', { email }).catch(() => {});
        res.render('staff-login', { site, redirect, error: 'Invalid email or password.' });
        return;
    }

    await createStaffSession(res, staff._id);
    await db.getDb().collection('staff_accounts').updateOne({ _id: staff._id }, { $set: { last_login_at: new Date() } });
    res.redirect(redirect);
});

router.get('/staff/logout', async (req, res) => {
    await destroyStaffSession(req, res);
    res.redirect('/staff/login');
});

router.use('/staff', requireStaff);

router.get('/staff/tickets', async (req, res) => {
    let tickets = [];
    if (db.isDbConfigured()) {
        const pipeline = [];
        if (req.staffUser.service_id) {
            pipeline.push({ $match: { service_id: req.staffUser.service_id } });
        }
        pipeline.push(
            { $sort: { created_at: -1 } },
            { $lookup: { from: 'users', localField: 'user_id', foreignField: '_id', as: 'user' } },
            { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
            { $lookup: { from: 'services', localField: 'service_id', foreignField: '_id', as: 'service' } },
            { $unwind: { path: '$service', preserveNullAndEmptyArrays: true } },
            { $addFields: { user_name: '$user.name', user_email: '$user.email', service_title: '$service.title' } }
        );
        const docs = await db.getDb().collection('tickets').aggregate(pipeline).toArray();
        tickets = docs.map(db.withId);
    }
    res.render('staff-tickets', { site, tickets, staffUser: req.staffUser, error: '', message: '' });
});

router.post('/staff/tickets/:id/update', async (req, res) => {
    if (db.isDbConfigured()) {
        const allowedStatus = ['open', 'in_progress', 'fulfilled', 'closed'];
        const allowedDelivery = ['not_delivered', 'delivered'];
        const update = { updated_at: new Date() };

        if (allowedStatus.includes(req.body.status)) update.status = req.body.status;
        if (allowedDelivery.includes(req.body.delivery_status)) update.delivery_status = req.body.delivery_status;
        update.admin_notes = String(req.body.admin_notes || '').trim();

        const result = await db.getDb().collection('tickets').updateOne(
            ticketFilter(req, req.params.id),
            { $set: update }
        );
        if (result.matchedCount > 0) {
            await logStaffAction(req, 'staff.ticket_update', `${req.staffUser.email}: ${req.params.id}`);
        }
    }
    res.redirect('/staff/tickets');
});

router.get('/staff/tickets/:id/messages', async (req, res) => {
    if (!db.isDbConfigured()) {
        res.status(503).json({ error: 'Not available.' });
        return;
    }
    const ticket = await db.getDb().collection('tickets').findOne(ticketFilter(req, req.params.id));
    if (!ticket) {
        res.status(404).json({ error: 'Ticket not found.' });
        return;
    }
    res.json({ messages: ticket.messages || [] });
});

router.post('/staff/tickets/:id/message', async (req, res) => {
    if (!db.isDbConfigured()) {
        res.status(503).json({ error: 'Not available.' });
        return;
    }
    const text = String(req.body.text || '').trim();
    if (!text) {
        res.status(422).json({ error: 'Message cannot be empty.' });
        return;
    }

    const existing = await db.getDb().collection('tickets').findOne(ticketFilter(req, req.params.id));
    if (!existing) {
        res.status(404).json({ error: 'Ticket not found.' });
        return;
    }
    if (existing.status === 'closed') {
        res.status(422).json({ error: 'This ticket is closed. Reopen it to send a message.' });
        return;
    }

    const newMessage = { from: 'staff', text, created_at: new Date() };
    const ticket = await db.getDb().collection('tickets').findOneAndUpdate(
        ticketFilter(req, req.params.id),
        { $push: { messages: newMessage }, $set: { updated_at: new Date(), unread_by_customer: true } },
        { returnDocument: 'after' }
    );
    if (!ticket) {
        res.status(404).json({ error: 'Ticket not found.' });
        return;
    }

    const user = await db.getDb().collection('users').findOne({ _id: ticket.user_id });
    if (user) {
        mailer.sendMail({
            to: user.email,
            subject: `New reply on your ticket: ${ticket.title}`,
            html: `<p>Hi ${user.name},</p><p>We replied on your ticket <strong>${ticket.title}</strong>:</p><p>${text}</p><p>View it at <a href="${res.locals.site.site_url}/tickets">your tickets page</a>.</p>`,
        }).catch(() => {});
    }
    await logStaffAction(req, 'staff.ticket_message', `${req.staffUser.email}: ${req.params.id}`);

    res.json({ message: newMessage });
});

router.post('/staff/tickets/:id/deliverable', uploadDeliverable.array('files', 5), csrf.verifyAfterUpload, async (req, res) => {
    if (db.isDbConfigured() && req.files && req.files.length > 0) {
        const ticket = await db.getDb().collection('tickets').findOne(ticketFilter(req, req.params.id));
        if (ticket) {
            const newFiles = [];
            for (const file of req.files) {
                const fileId = await db.uploadBuffer(file.buffer, file.originalname, file.mimetype);
                newFiles.push({ id: fileId.toString(), filename: file.originalname, uploaded_at: new Date() });
            }
            await db.getDb().collection('tickets').updateOne(
                ticketFilter(req, req.params.id),
                { $push: { deliverable_files: { $each: newFiles } }, $set: { updated_at: new Date() } }
            );
            await logStaffAction(req, 'staff.deliverable_upload', `${req.staffUser.email}: ${req.params.id}: ${newFiles.map(f => f.filename).join(', ')}`);
        }
    }
    res.redirect('/staff/tickets');
});

router.get('/staff/tickets/:id/attachment/:fileId', async (req, res) => {
    if (!db.isDbConfigured()) {
        res.status(404).send('Not available.');
        return;
    }
    try {
        const ticket = await db.getDb().collection('tickets').findOne(ticketFilter(req, req.params.id));
        const file = ticket && (ticket.attachments || []).find(f => f.id === req.params.fileId);
        if (!file) {
            res.status(404).send('File not available.');
            return;
        }
        const fileDoc = await db.getDb().collection('uploads.files').findOne({ _id: db.toId(req.params.fileId) });
        if (!fileDoc) {
            res.status(404).send('File not found.');
            return;
        }
        res.set('Content-Type', fileDoc.contentType || 'application/octet-stream');
        res.set('Content-Disposition', `attachment; filename="${file.filename.replace(/"/g, '')}"`);
        db.getBucket().openDownloadStream(db.toId(req.params.fileId)).pipe(res);
    } catch (error) {
        res.status(404).send('File not available.');
    }
});

router.post('/staff/tickets/:id/deliverable/:fileId/remove', async (req, res) => {
    if (db.isDbConfigured()) {
        const ticket = await db.getDb().collection('tickets').findOne(ticketFilter(req, req.params.id));
        if (ticket) {
            await db.getDb().collection('tickets').updateOne(
                ticketFilter(req, req.params.id),
                { $pull: { deliverable_files: { id: req.params.fileId } } }
            );
            await db.deleteFile(req.params.fileId);
            await logStaffAction(req, 'staff.deliverable_remove', `${req.staffUser.email}: ${req.params.id}`);
        }
    }
    res.redirect('/staff/tickets');
});

module.exports = router;
