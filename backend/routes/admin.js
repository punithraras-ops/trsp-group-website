const express = require('express');
const db = require('../db');
const site = require('../config/site');
const { requireAdmin, checkAdminCredentials, createAdminSession, destroyAdminSession } = require('../lib/auth');

const router = express.Router();

function safeAdminRedirect(value) {
    if (typeof value === 'string' && value.startsWith('/admin')) {
        return value;
    }
    return '/admin';
}

router.get('/admin/login', (req, res) => {
    res.render('admin-login', { site, redirect: safeAdminRedirect(req.query.redirect), error: '' });
});

router.post('/admin/login', async (req, res) => {
    const redirect = safeAdminRedirect(req.body.redirect);

    if (!checkAdminCredentials(req.body.username, req.body.password)) {
        res.render('admin-login', { site, redirect, error: 'Invalid username or password.' });
        return;
    }

    await createAdminSession(res, req);
    res.redirect(redirect);
});

router.get('/admin/logout', async (req, res) => {
    await destroyAdminSession(req, res);
    res.redirect('/admin/login');
});

router.use('/admin', requireAdmin);

router.get('/admin', async (req, res) => {
    let submissions = [];
    let users = [];
    let orders = [];
    let products = [];
    let features = [];

    if (db.isDbConfigured()) {
        try {
            const database = db.getDb();
            const [submissionDocs, userDocs, orderDocs, productDocs, featureDocs] = await Promise.all([
                database.collection('contact_submissions').find().sort({ created_at: -1 }).toArray(),
                database.collection('users').find().sort({ created_at: -1 }).toArray(),
                database.collection('orders').aggregate([
                    { $sort: { created_at: -1 } },
                    { $lookup: { from: 'users', localField: 'user_id', foreignField: '_id', as: 'user' } },
                    { $lookup: { from: 'products', localField: 'product_id', foreignField: '_id', as: 'product' } },
                    { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
                    { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
                    {
                        $addFields: {
                            user_name: '$user.name',
                            user_email: '$user.email',
                            product_title: '$product.title',
                        },
                    },
                ]).toArray(),
                database.collection('products').find().sort({ created_at: -1 }).toArray(),
                database.collection('upcoming_features').find().sort({ sort_order: 1, created_at: -1 }).toArray(),
            ]);

            submissions = submissionDocs.map(db.withId);
            users = userDocs.map(db.withId);
            orders = orderDocs.map(db.withId);
            products = productDocs.map(db.withId);
            features = featureDocs.map(db.withId);
        } catch (error) {
            // Leave arrays empty if any query fails; the page still renders.
        }
    }

    res.render('admin', {
        site,
        dbConfigured: db.isDbConfigured(),
        submissions,
        users,
        orders,
        products,
        features,
    });
});

router.post('/admin/products', async (req, res) => {
    if (db.isDbConfigured()) {
        const pricePaise = Math.round(parseFloat(req.body.price || '0') * 100);
        await db.getDb().collection('products').insertOne({
            title: req.body.title,
            description: req.body.description || '',
            price_paise: pricePaise,
            currency: 'INR',
            image_url: req.body.image_url || null,
            is_active: true,
            created_at: new Date(),
        });
    }
    res.redirect('/admin#tab-products');
});

router.post('/admin/products/:id/update', async (req, res) => {
    if (db.isDbConfigured()) {
        const pricePaise = Math.round(parseFloat(req.body.price || '0') * 100);
        await db.getDb().collection('products').updateOne(
            { _id: db.toId(req.params.id) },
            {
                $set: {
                    title: req.body.title,
                    description: req.body.description || '',
                    price_paise: pricePaise,
                    image_url: req.body.image_url || null,
                    is_active: req.body.is_active === '1',
                },
            }
        );
    }
    res.redirect('/admin#tab-products');
});

router.post('/admin/products/:id/delete', async (req, res) => {
    if (db.isDbConfigured()) {
        await db.getDb().collection('products').deleteOne({ _id: db.toId(req.params.id) });
    }
    res.redirect('/admin#tab-products');
});

router.post('/admin/features', async (req, res) => {
    if (db.isDbConfigured()) {
        await db.getDb().collection('upcoming_features').insertOne({
            title: req.body.title,
            description: req.body.description || '',
            image_url: null,
            status: req.body.status || 'planned',
            sort_order: parseInt(req.body.sort_order, 10) || 0,
            is_active: true,
            created_at: new Date(),
            updated_at: new Date(),
        });
    }
    res.redirect('/admin#tab-features');
});

router.post('/admin/features/:id/update', async (req, res) => {
    if (db.isDbConfigured()) {
        await db.getDb().collection('upcoming_features').updateOne(
            { _id: db.toId(req.params.id) },
            {
                $set: {
                    title: req.body.title,
                    description: req.body.description || '',
                    status: req.body.status || 'planned',
                    sort_order: parseInt(req.body.sort_order, 10) || 0,
                    is_active: req.body.is_active === '1',
                    updated_at: new Date(),
                },
            }
        );
    }
    res.redirect('/admin#tab-features');
});

router.post('/admin/features/:id/delete', async (req, res) => {
    if (db.isDbConfigured()) {
        await db.getDb().collection('upcoming_features').deleteOne({ _id: db.toId(req.params.id) });
    }
    res.redirect('/admin#tab-features');
});

module.exports = router;
