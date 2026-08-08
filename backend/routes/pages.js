const express = require('express');
const db = require('../db');
const legal = require('../lib/legal');
const invoices = require('../lib/invoices');
const reviews = require('../lib/reviews');
const userSecurity = require('../lib/userSecurity');
const { requireAuthPage } = require('../lib/auth');

const router = express.Router();

async function getActiveServices() {
    if (!db.isDbConfigured()) {
        return [];
    }
    try {
        const docs = await db.getDb().collection('services')
            .find({ is_active: true })
            .sort({ sort_order: 1, created_at: 1 })
            .toArray();
        return docs.map(db.withId);
    } catch (error) {
        return [];
    }
}

router.get('/uploads/:id', async (req, res) => {
    if (!db.isDbConfigured()) {
        res.status(404).end();
        return;
    }

    try {
        const fileId = db.toId(req.params.id);
        const files = await db.getDb().collection('uploads.files').findOne({ _id: fileId });
        if (!files) {
            res.status(404).end();
            return;
        }

        res.set('Content-Type', files.contentType || 'application/octet-stream');
        res.set('Cache-Control', 'public, max-age=31536000, immutable');
        db.getBucket().openDownloadStream(fileId).pipe(res);
    } catch (error) {
        res.status(404).end();
    }
});

router.get('/', async (req, res) => {
    const site = res.locals.site;
    let upcomingFeatures = [];
    if (db.isDbConfigured()) {
        try {
            const docs = await db.getDb().collection('upcoming_features')
                .find({ is_active: true })
                .sort({ sort_order: 1, created_at: -1 })
                .toArray();
            upcomingFeatures = docs.map(db.withId);
        } catch (error) {
            upcomingFeatures = [];
        }
    }

    const services = await getActiveServices();

    res.render('home', {
        pageTitle: site.company_name,
        pageDescription: site.default_description,
        activePage: 'home',
        upcomingFeatures,
        services,
        dbConfigured: db.isDbConfigured(),
    });
});

router.get('/about', (req, res) => {
    const site = res.locals.site;
    res.render('about', {
        pageTitle: `${site.short_name} - About Us`,
        pageDescription: `About ${site.legal_name} in ${site.location}.`,
        activePage: 'about',
    });
});

router.get('/terms', async (req, res) => {
    const site = res.locals.site;
    const terms = await legal.getTermsContent();

    res.render('terms', {
        pageTitle: `${site.short_name} - Terms & Conditions`,
        pageDescription: `Terms and conditions, including payment terms, for ${site.legal_name}.`,
        activePage: 'terms',
        terms,
    });
});

router.get('/privacy', async (req, res) => {
    const site = res.locals.site;
    const privacy = await legal.getPrivacyContent();

    res.render('privacy', {
        pageTitle: `${site.short_name} - Privacy Policy`,
        pageDescription: `How ${site.legal_name} collects, uses, and protects your personal information.`,
        activePage: 'privacy',
        privacy,
    });
});

router.get('/services', async (req, res) => {
    const site = res.locals.site;
    const services = await getActiveServices();

    res.render('services', {
        pageTitle: `${site.short_name} - Our Services`,
        pageDescription: `Explore the services offered by ${site.legal_name}.`,
        activePage: 'services',
        services,
        dbConfigured: db.isDbConfigured(),
    });
});

router.get('/contact', async (req, res) => {
    const site = res.locals.site;
    const services = await getActiveServices();
    const serviceSlugs = services.map(s => s.slug);
    const selectedService = serviceSlugs.includes(req.query.service) ? req.query.service : '';

    res.render('contact', {
        pageTitle: `${site.short_name} - Contact Us`,
        pageDescription: `Contact ${site.legal_name} in ${site.location}.`,
        activePage: 'contact',
        services,
        selectedService,
    });
});

router.get('/services/:slug', async (req, res, next) => {
    const site = res.locals.site;

    if (!db.isDbConfigured()) {
        return next();
    }

    try {
        const doc = await db.getDb().collection('services').findOne({ slug: req.params.slug, is_active: true });
        if (!doc) {
            return next();
        }

        const service = db.withId(doc);

        res.render('service-detail', {
            pageTitle: `${site.short_name} - ${service.title}`,
            pageDescription: service.summary,
            activePage: 'services',
            heroIcon: service.icon,
            heroTitle: service.title,
            heroSubtitle: service.hero_subtitle || service.summary,
            features: service.features || [],
            portfolio: service.slug === 'software-development' ? site.software_portfolio : null,
            serviceKey: service.slug,
        });
    } catch (error) {
        next();
    }
});

// Legacy URLs from before services moved into the admin-managed database.
router.get(['/software-development', '/business-analytics', '/cybersecurity', '/product-strategy'], (req, res) => {
    res.redirect(301, `/services${req.path}`);
});

router.get('/store', async (req, res) => {
    const site = res.locals.site;
    let products = [];
    let categories = [];
    const search = String(req.query.q || '').trim();
    const category = String(req.query.category || '').trim();

    if (db.isDbConfigured()) {
        try {
            const allActive = await db.getDb().collection('products').find({ is_active: true }).toArray();
            categories = [...new Set(allActive.map(p => p.category).filter(Boolean))].sort();

            const filter = { is_active: true };
            if (search) {
                filter.$or = [
                    { title: { $regex: search, $options: 'i' } },
                    { description: { $regex: search, $options: 'i' } },
                ];
            }
            if (category) {
                filter.category = category;
            }

            const docs = await db.getDb().collection('products').find(filter).sort({ created_at: -1 }).toArray();
            products = docs.map(db.withId);

            const summaries = await reviews.getSummaryForProducts(products.map(p => db.toId(p.id)));
            products = products.map(p => ({ ...p, reviewSummary: summaries.get(p.id) || { avg: 0, count: 0 } }));
        } catch (error) {
            products = [];
        }
    }

    res.render('store', {
        pageTitle: `${site.short_name} - Store`,
        pageDescription: `Products and packages from ${site.legal_name}.`,
        activePage: 'store',
        dbConfigured: db.isDbConfigured(),
        products,
        categories,
        search,
        category,
    });
});

router.get('/api/products/by-ids', async (req, res) => {
    if (!db.isDbConfigured()) {
        res.json({ products: [] });
        return;
    }
    const ids = String(req.query.ids || '').split(',').map(s => s.trim()).filter(Boolean).slice(0, 50);
    if (ids.length === 0) {
        res.json({ products: [] });
        return;
    }
    try {
        const docs = await db.getDb().collection('products').find({
            _id: { $in: ids.map(id => db.toId(id)) },
            is_active: true,
        }).toArray();
        res.json({ products: docs.map(db.withId) });
    } catch (error) {
        res.json({ products: [] });
    }
});

router.get('/cart', (req, res) => {
    const site = res.locals.site;
    res.render('cart', {
        pageTitle: `${site.short_name} - Cart`,
        pageDescription: 'Review the items in your cart.',
        activePage: 'cart',
        dbConfigured: db.isDbConfigured(),
        razorpayConfigured: Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET),
    });
});

router.get('/checkout', async (req, res) => {
    const site = res.locals.site;
    let product = null;
    let approvalOrder = null;

    if (db.isDbConfigured() && req.query.product) {
        try {
            const doc = await db.getDb().collection('products').findOne({
                _id: db.toId(req.query.product),
                is_active: true,
            });
            product = doc ? db.withId(doc) : null;

            if (product && product.requires_approval && req.user) {
                const existing = await db.getDb().collection('orders').findOne({
                    user_id: db.toId(req.user.id),
                    product_id: db.toId(product.id),
                    status: { $in: ['pending_approval', 'approved_awaiting_payment'] },
                }, { sort: { created_at: -1 } });
                approvalOrder = existing ? db.withId(existing) : null;
            }
        } catch (error) {
            product = null;
        }
    }

    res.render('checkout', {
        pageTitle: `${site.short_name} - Checkout`,
        pageDescription: 'Complete your purchase.',
        activePage: 'store',
        dbConfigured: db.isDbConfigured(),
        approvalOrder,
        product,
        razorpayConfigured: Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET),
        autoShowLogin: !req.user,
    });
});

async function getAccountOrders(userId) {
    if (!db.isDbConfigured()) {
        return [];
    }
    try {
        const docs = await db.getDb().collection('orders').aggregate([
            { $match: { user_id: db.toId(userId) } },
            { $sort: { created_at: -1 } },
            {
                $lookup: {
                    from: 'products',
                    localField: 'product_id',
                    foreignField: '_id',
                    as: 'product',
                },
            },
            { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
            {
                $addFields: {
                    product_title: '$product.title',
                    product_deliverable_file_id: '$product.deliverable_file_id',
                    product_deliverable_filename: '$product.deliverable_filename',
                },
            },
        ]).toArray();
        return docs.map(db.withId).map(order => {
            const files = [...(order.deliverable_files || [])];
            if (order.product_deliverable_file_id) {
                files.push({ id: order.product_deliverable_file_id, filename: order.product_deliverable_filename || 'download' });
            }
            return {
                ...order,
                display_title: order.items && order.items.length > 0
                    ? order.items.map(i => `${i.title}${i.quantity > 1 ? ' x' + i.quantity : ''}`).join(', ')
                    : order.product_title,
                downloadableFiles: order.status === 'paid' ? files : [],
            };
        });
    } catch (error) {
        return [];
    }
}

async function renderAccountPage(req, res, extra = {}) {
    const site = res.locals.site;
    const orders = await getAccountOrders(req.user.id);

    res.render('account', {
        pageTitle: `${site.short_name} - My Account`,
        pageDescription: 'Your account and order history.',
        activePage: 'account',
        orders,
        verified: req.query.verified === '1',
        resent: req.query.resent === '1',
        profileUpdated: req.query.profileUpdated === '1',
        pwSuccess: req.query.pwSuccess === '1',
        pwError: req.query.pwError || '',
        ordersCleared: req.query.ordersCleared || '',
        totpEnabled: false,
        enrollment: null,
        totpError: '',
        totpMessage: '',
        razorpayConfigured: Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET),
        ...extra,
    });
}

router.get('/account', requireAuthPage(), async (req, res) => {
    const totpEnabled = await userSecurity.isTotpEnabled(req.user.id);
    await renderAccountPage(req, res, { totpEnabled });
});

router.post('/account/security/start-enrollment', requireAuthPage(), async (req, res) => {
    if (!db.isDbConfigured()) {
        return renderAccountPage(req, res, {});
    }
    const enrollment = await userSecurity.startTotpEnrollment(req.user.id, req.user.email);
    const QRCode = require('qrcode');
    const qrDataUrl = await QRCode.toDataURL(enrollment.url);
    await renderAccountPage(req, res, { totpEnabled: false, enrollment: { ...enrollment, qrDataUrl } });
});

router.post('/account/security/confirm-enrollment', requireAuthPage(), async (req, res) => {
    const ok = db.isDbConfigured() && (await userSecurity.confirmTotpEnrollment(req.user.id, req.body.code));
    if (!ok) {
        return renderAccountPage(req, res, { totpEnabled: false, totpError: 'Invalid code. Please scan the QR code again and try once more.' });
    }
    await renderAccountPage(req, res, { totpEnabled: true, totpMessage: 'Two-factor authentication is now enabled.' });
});

router.post('/account/security/disable', requireAuthPage(), async (req, res) => {
    const ok = db.isDbConfigured() && (await userSecurity.disableTotp(req.user.id, req.body.code));
    if (!ok) {
        return renderAccountPage(req, res, { totpEnabled: true, totpError: 'Invalid code. Two-factor authentication was not disabled.' });
    }
    await renderAccountPage(req, res, { totpEnabled: false, totpMessage: 'Two-factor authentication has been disabled.' });
});

router.post('/account/orders/clear', requireAuthPage(), async (req, res) => {
    if (db.isDbConfigured()) {
        await db.getDb().collection('orders').deleteMany({
            user_id: db.toId(req.user.id),
            status: { $in: ['created', 'failed', 'rejected'] },
        });
    }
    res.redirect('/account?ordersCleared=1');
});

router.get('/account/orders/:id/download/:fileId', requireAuthPage(), async (req, res) => {
    if (!db.isDbConfigured()) {
        res.status(404).send('Not available.');
        return;
    }
    try {
        const order = await db.getDb().collection('orders').findOne({
            _id: db.toId(req.params.id),
            user_id: db.toId(req.user.id),
            status: 'paid',
        });
        if (!order) {
            res.status(404).send('File not available.');
            return;
        }

        const orderFile = (order.deliverable_files || []).find(f => f.id === req.params.fileId);
        let filename = orderFile ? orderFile.filename : null;

        if (!filename) {
            const productIds = order.items && order.items.length > 0
                ? order.items.map(i => i.product_id)
                : (order.product_id ? [order.product_id] : []);
            const products = await db.getDb().collection('products').find({ _id: { $in: productIds } }).toArray();
            const match = products.find(p => p.deliverable_file_id === req.params.fileId);
            if (match) filename = match.deliverable_filename || 'download';
        }

        if (!filename) {
            res.status(404).send('File not available.');
            return;
        }

        const fileDoc = await db.getDb().collection('uploads.files').findOne({ _id: db.toId(req.params.fileId) });
        if (!fileDoc) {
            res.status(404).send('File not found.');
            return;
        }

        res.set('Content-Type', fileDoc.contentType || 'application/octet-stream');
        res.set('Content-Disposition', `attachment; filename="${filename.replace(/"/g, '')}"`);
        db.getBucket().openDownloadStream(db.toId(req.params.fileId)).pipe(res);
    } catch (error) {
        res.status(404).send('File not available.');
    }
});

router.get('/account/orders/:id/invoice', requireAuthPage(), async (req, res) => {
    if (!db.isDbConfigured()) {
        res.status(404).send('Not available.');
        return;
    }
    try {
        const order = await db.getDb().collection('orders').findOne({
            _id: db.toId(req.params.id),
            user_id: db.toId(req.user.id),
        });
        if (!order || order.status !== 'paid') {
            res.status(404).send('Invoice not available for this order.');
            return;
        }
        let items = order.items;
        if (!items && order.product_id) {
            const product = await db.getDb().collection('products').findOne({ _id: order.product_id });
            items = [{ title: product ? product.title : 'Product', quantity: order.quantity || 1, amount_paise: order.amount_paise }];
        }
        invoices.streamInvoice(res, {
            order: db.withId(order),
            items: items || [],
            customerName: req.user.name,
            customerEmail: req.user.email,
            site: res.locals.site,
        });
    } catch (error) {
        res.status(500).send('Unable to generate invoice.');
    }
});

module.exports = router;
