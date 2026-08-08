const express = require('express');
const db = require('../db');
const invoices = require('../lib/invoices');
const { requireAuthPage } = require('../lib/auth');

const router = express.Router();

async function getUserTickets(userId) {
    const docs = await db.getDb().collection('tickets')
        .find({ user_id: db.toId(userId) })
        .sort({ created_at: -1 })
        .toArray();
    return docs.map(db.withId);
}

router.get('/tickets', requireAuthPage(), async (req, res) => {
    const tickets = db.isDbConfigured() ? await getUserTickets(req.user.id) : [];
    res.render('tickets', {
        pageTitle: `${res.locals.site.short_name} - My Tickets`,
        pageDescription: 'Submit and track your custom product requirements.',
        activePage: 'tickets',
        tickets,
        ticketCreated: req.query.created === '1',
        rated: req.query.rated === '1',
    });
});

router.post('/tickets', requireAuthPage(), async (req, res) => {
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

    await db.getDb().collection('tickets').insertOne({
        user_id: db.toId(req.user.id),
        title,
        description,
        status: 'open',
        price_paise: null,
        currency: 'INR',
        deliverable_files: [],
        delivery_status: 'not_delivered',
        admin_notes: '',
        customer_rating: null,
        customer_rating_comment: '',
        created_at: new Date(),
        updated_at: new Date(),
    });

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
