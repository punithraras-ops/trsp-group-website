const express = require('express');
const db = require('../db');

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
    if (db.isDbConfigured()) {
        try {
            const docs = await db.getDb().collection('products')
                .find({ is_active: true })
                .sort({ created_at: -1 })
                .toArray();
            products = docs.map(db.withId);
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

router.get('/account', require('../lib/auth').requireAuthPage(), async (req, res) => {
    const site = res.locals.site;
    let orders = [];
    if (db.isDbConfigured()) {
        try {
            const docs = await db.getDb().collection('orders').aggregate([
                { $match: { user_id: db.toId(req.user.id) } },
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
                { $addFields: { product_title: '$product.title' } },
            ]).toArray();
            orders = docs.map(db.withId);
        } catch (error) {
            orders = [];
        }
    }

    res.render('account', {
        pageTitle: `${site.short_name} - My Account`,
        pageDescription: 'Your account and order history.',
        activePage: 'account',
        orders,
    });
});

module.exports = router;
