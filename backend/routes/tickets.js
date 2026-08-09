const express = require('express');
const multer = require('multer');
const QRCode = require('qrcode');
const db = require('../db');
const invoices = require('../lib/invoices');
const razorpay = require('../lib/razorpay');
const mailer = require('../lib/mailer');
const { requireAuthPage, requireAuthApi } = require('../lib/auth');
const csrf = require('../lib/csrf');
const { checkoutLimiter } = require('../lib/rateLimiters');
const { MANUAL_UPI_ID, buildUpiUri } = require('../lib/manualUpi');

const router = express.Router();
const uploadAttachment = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
router.use('/api/tickets', checkoutLimiter);

async function getUserTickets(userId) {
    const docs = await db.getDb().collection('tickets')
        .find({ user_id: db.toId(userId) })
        .sort({ created_at: -1 })
        .toArray();
    return docs.map(db.withId);
}

router.get('/tickets', requireAuthPage(), async (req, res) => {
    const tickets = db.isDbConfigured() ? await getUserTickets(req.user.id) : [];
    const unreadCount = tickets.filter(t => t.unread_by_customer).length;
    res.render('tickets', {
        pageTitle: `${res.locals.site.short_name} - My Tickets`,
        pageDescription: 'Submit and track your custom product requirements.',
        activePage: 'tickets',
        tickets,
        ticketCreated: req.query.created === '1',
        rated: req.query.rated === '1',
        razorpayConfigured: razorpay.isConfigured(),
        unreadCount,
    });
});

router.post('/tickets', requireAuthPage(), uploadAttachment.array('attachments', 5), csrf.verifyAfterUpload, async (req, res) => {
    if (!db.isDbConfigured()) {
        res.redirect('/tickets');
        return;
    }
    const title = String(req.body.title || '').trim();
    const description = String(req.body.description || '').trim();
    if (!title || !description) {
        res.redirect('/tickets');
        return;
    }

    const attachments = [];
    for (const file of req.files || []) {
        const fileId = await db.uploadBuffer(file.buffer, file.originalname, file.mimetype);
        attachments.push({ id: fileId.toString(), filename: file.originalname });
    }

    await db.getDb().collection('tickets').insertOne({
        user_id: db.toId(req.user.id),
        title,
        description,
        attachments,
        status: 'open',
        price_paise: null,
        currency: 'INR',
        payment_status: 'unpaid',
        razorpay_order_id: null,
        razorpay_payment_id: null,
        utr_reference: null,
        deliverable_files: [],
        delivery_status: 'not_delivered',
        admin_notes: '',
        messages: [],
        unread_by_customer: false,
        customer_rating: null,
        customer_rating_comment: '',
        created_at: new Date(),
        updated_at: new Date(),
    });

    mailer.sendMail({
        to: res.locals.site.email,
        subject: `New requirement ticket from ${req.user.name}`,
        html: `<p>${req.user.name} (${req.user.email}) raised a new ticket: <strong>${title}</strong></p><p>${description}</p>`,
    }).catch(() => {});

    res.redirect('/tickets?created=1');
});

router.post('/tickets/:id/rate', requireAuthPage(), async (req, res) => {
    if (!db.isDbConfigured()) {
        res.redirect('/tickets');
        return;
    }
    const rating = parseInt(req.body.rating, 10);
    if (!rating || rating < 1 || rating > 5) {
        res.redirect('/tickets');
        return;
    }

    await db.getDb().collection('tickets').updateOne(
        { _id: db.toId(req.params.id), user_id: db.toId(req.user.id), delivery_status: 'delivered' },
        { $set: { customer_rating: rating, customer_rating_comment: String(req.body.comment || '').trim(), updated_at: new Date() } }
    );

    res.redirect('/tickets?rated=1');
});

router.get('/api/tickets/:id/messages', requireAuthApi, async (req, res) => {
    if (!db.isDbConfigured()) {
        res.status(503).json({ error: 'Not available.' });
        return;
    }
    const ticket = await db.getDb().collection('tickets').findOne({
        _id: db.toId(req.params.id),
        user_id: db.toId(req.user.id),
    });
    if (!ticket) {
        res.status(404).json({ error: 'Ticket not found.' });
        return;
    }
    if (ticket.unread_by_customer) {
        await db.getDb().collection('tickets').updateOne({ _id: ticket._id }, { $set: { unread_by_customer: false } });
    }
    res.json({ messages: ticket.messages || [] });
});

router.post('/api/tickets/:id/clear-messages', requireAuthApi, async (req, res) => {
    if (!db.isDbConfigured()) {
        res.status(503).json({ error: 'Not available.' });
        return;
    }
    const result = await db.getDb().collection('tickets').updateOne(
        { _id: db.toId(req.params.id), user_id: db.toId(req.user.id) },
        { $set: { messages: [], updated_at: new Date() } }
    );
    if (result.matchedCount === 0) {
        res.status(404).json({ error: 'Ticket not found.' });
        return;
    }
    res.json({ message: 'Conversation cleared.' });
});

router.post('/api/tickets/:id/message', requireAuthApi, async (req, res) => {
    if (!db.isDbConfigured()) {
        res.status(503).json({ error: 'Not available.' });
        return;
    }
    const text = String(req.body.text || '').trim();
    if (!text) {
        res.status(422).json({ error: 'Message cannot be empty.' });
        return;
    }

    const existing = await db.getDb().collection('tickets').findOne({ _id: db.toId(req.params.id), user_id: db.toId(req.user.id) });
    if (!existing) {
        res.status(404).json({ error: 'Ticket not found.' });
        return;
    }
    if (existing.status === 'closed') {
        res.status(422).json({ error: 'This ticket is closed. Messaging is disabled.' });
        return;
    }

    const newMessage = { from: 'customer', text, created_at: new Date() };
    const ticket = await db.getDb().collection('tickets').findOneAndUpdate(
        { _id: db.toId(req.params.id), user_id: db.toId(req.user.id) },
        { $push: { messages: newMessage }, $set: { updated_at: new Date() } },
        { returnDocument: 'after' }
    );

    mailer.sendMail({
        to: res.locals.site.email,
        subject: `New message on ticket: ${ticket.title}`,
        html: `<p>${req.user.name} (${req.user.email}) replied on their ticket <strong>${ticket.title}</strong>:</p><p>${text}</p>`,
    }).catch(() => {});

    res.json({ message: newMessage });
});

router.post('/api/tickets/:id/create-payment-order', requireAuthApi, async (req, res) => {
    if (!db.isDbConfigured() || !razorpay.isConfigured()) {
        res.status(503).json({ error: 'Payments are not enabled yet.' });
        return;
    }
    try {
        const ticket = await db.getDb().collection('tickets').findOne({
            _id: db.toId(req.params.id),
            user_id: db.toId(req.user.id),
        });
        if (!ticket || !ticket.price_paise) {
            res.status(404).json({ error: 'This ticket does not have a price set yet.' });
            return;
        }
        if (ticket.payment_status === 'paid') {
            res.status(422).json({ error: 'This ticket has already been paid.' });
            return;
        }

        const razorpayOrder = await razorpay.createOrder({
            amountPaise: ticket.price_paise,
            currency: ticket.currency,
            receipt: `ticket_${ticket._id.toString()}`,
        });

        await db.getDb().collection('tickets').updateOne(
            { _id: ticket._id },
            { $set: { razorpay_order_id: razorpayOrder.id, updated_at: new Date() } }
        );

        res.json({
            razorpayOrderId: razorpayOrder.id,
            amount: ticket.price_paise,
            currency: ticket.currency,
            key: process.env.RAZORPAY_KEY_ID,
            companyName: res.locals.site.company_name,
            productTitle: ticket.title,
        });
    } catch (error) {
        console.error('create-payment-order (ticket) failed:', error.message);
        res.status(500).json({ error: 'Unable to start payment right now.' });
    }
});

router.post('/api/tickets/:id/verify-payment', requireAuthApi, async (req, res) => {
    if (!db.isDbConfigured() || !razorpay.isConfigured()) {
        res.status(503).json({ error: 'Payments are not enabled yet.' });
        return;
    }
    const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = req.body || {};
    if (!orderId || !paymentId || !signature) {
        res.status(422).json({ error: 'Missing payment details.' });
        return;
    }

    const valid = razorpay.verifySignature({ orderId, paymentId, signature });
    if (!valid) {
        res.status(400).json({ error: 'Payment verification failed.' });
        return;
    }

    try {
        const result = await db.getDb().collection('tickets').updateOne(
            { _id: db.toId(req.params.id), user_id: db.toId(req.user.id), razorpay_order_id: orderId },
            { $set: { payment_status: 'paid', razorpay_payment_id: paymentId, updated_at: new Date() } }
        );
        if (result.matchedCount === 0) {
            res.status(404).json({ error: 'Ticket not found.' });
            return;
        }
        res.json({ message: 'Payment verified.' });
    } catch (error) {
        console.error('verify-payment (ticket) failed:', error.message);
        res.status(500).json({ error: 'Unable to verify payment right now.' });
    }
});

router.post('/api/tickets/:id/create-manual-upi-order', requireAuthApi, async (req, res) => {
    if (!db.isDbConfigured()) {
        res.status(503).json({ error: 'Not available.' });
        return;
    }
    try {
        const ticket = await db.getDb().collection('tickets').findOne({
            _id: db.toId(req.params.id),
            user_id: db.toId(req.user.id),
        });
        if (!ticket || !ticket.price_paise) {
            res.status(404).json({ error: 'This ticket does not have a price set yet.' });
            return;
        }
        if (ticket.payment_status === 'paid') {
            res.status(422).json({ error: 'This ticket has already been paid.' });
            return;
        }

        await db.getDb().collection('tickets').updateOne(
            { _id: ticket._id },
            { $set: { payment_status: 'awaiting_confirmation', updated_at: new Date() } }
        );

        const upiUri = buildUpiUri({ amountPaise: ticket.price_paise, referenceId: ticket._id.toString(), companyName: res.locals.site.company_name });
        const qrDataUrl = await QRCode.toDataURL(upiUri);

        res.json({
            ticketId: ticket._id.toString(),
            amount: ticket.price_paise,
            currency: ticket.currency,
            upiId: MANUAL_UPI_ID,
            qrDataUrl,
        });
    } catch (error) {
        console.error('create-manual-upi-order (ticket) failed:', error.message);
        res.status(500).json({ error: 'Unable to start UPI checkout. Please try again.' });
    }
});

router.post('/api/tickets/:id/submit-utr', requireAuthApi, async (req, res) => {
    if (!db.isDbConfigured()) {
        res.status(503).json({ error: 'Not available.' });
        return;
    }
    const utr = String(req.body.utr || '').trim();
    if (!utr || utr.length < 4 || utr.length > 40) {
        res.status(422).json({ error: 'Enter a valid UPI transaction / UTR reference number.' });
        return;
    }
    try {
        const ticket = await db.getDb().collection('tickets').findOneAndUpdate(
            { _id: db.toId(req.params.id), user_id: db.toId(req.user.id) },
            { $set: { utr_reference: utr, updated_at: new Date() } },
            { returnDocument: 'after' }
        );
        if (!ticket) {
            res.status(404).json({ error: 'Ticket not found.' });
            return;
        }

        mailer.sendUtrReceivedEmail({
            to: req.user.email,
            name: req.user.name,
            orderId: ticket._id.toString(),
            utr,
            amountPaise: ticket.price_paise,
            currency: ticket.currency,
            site: res.locals.site,
        }).catch(() => {});

        mailer.sendUpiUtrAlert({
            orderId: ticket._id.toString(),
            utr,
            amountPaise: ticket.price_paise,
            currency: ticket.currency,
            customerName: req.user.name,
            customerEmail: req.user.email,
            site: res.locals.site,
        }).catch(() => {});

        res.json({ message: "Reference submitted. We'll confirm your payment shortly." });
    } catch (error) {
        console.error('submit-utr (ticket) failed:', error.message);
        res.status(500).json({ error: 'Unable to submit reference right now.' });
    }
});

router.get('/tickets/:id/download/:fileId', requireAuthPage(), async (req, res) => {
    if (!db.isDbConfigured()) {
        res.status(404).send('Not available.');
        return;
    }
    try {
        const ticket = await db.getDb().collection('tickets').findOne({
            _id: db.toId(req.params.id),
            user_id: db.toId(req.user.id),
        });
        const file = ticket && (ticket.deliverable_files || []).find(f => f.id === req.params.fileId);
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

router.get('/tickets/:id/invoice', requireAuthPage(), async (req, res) => {
    if (!db.isDbConfigured()) {
        res.status(404).send('Not available.');
        return;
    }
    try {
        const ticket = await db.getDb().collection('tickets').findOne({
            _id: db.toId(req.params.id),
            user_id: db.toId(req.user.id),
        });
        if (!ticket || !ticket.price_paise) {
            res.status(404).send('Invoice not available for this ticket yet.');
            return;
        }

        invoices.streamInvoice(res, {
            order: {
                id: ticket._id.toString(),
                created_at: ticket.created_at,
                razorpay_payment_id: 'Custom ticket (offline/manual billing)',
                amount_paise: ticket.price_paise,
                currency: ticket.currency,
            },
            items: [{ title: ticket.title, quantity: 1, amount_paise: ticket.price_paise }],
            customerName: req.user.name,
            customerEmail: req.user.email,
            site: res.locals.site,
        });
    } catch (error) {
        res.status(500).send('Unable to generate invoice.');
    }
});

module.exports = router;
