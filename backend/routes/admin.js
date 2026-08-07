const express = require('express');
const db = require('../db');
const site = require('../config/site');
const { requireAdmin } = require('../lib/auth');

const router = express.Router();

router.use('/admin', requireAdmin);

router.get('/admin', async (req, res) => {
    let submissions = [];
    let users = [];
    let orders = [];
    let products = [];
    let features = [];

    if (db.isDbConfigured()) {
        try {
            [submissions, users, orders, products, features] = await Promise.all([
                db.query('SELECT * FROM contact_submissions ORDER BY created_at DESC').then(r => r.rows),
                db.query('SELECT * FROM users ORDER BY created_at DESC').then(r => r.rows),
                db.query(
                    `SELECT o.*, u.name AS user_name, u.email AS user_email, p.title AS product_title
                     FROM orders o
                     JOIN users u ON u.id = o.user_id
                     JOIN products p ON p.id = o.product_id
                     ORDER BY o.created_at DESC`
                ).then(r => r.rows),
                db.query('SELECT * FROM products ORDER BY created_at DESC').then(r => r.rows),
                db.query('SELECT * FROM upcoming_features ORDER BY sort_order ASC, created_at DESC').then(r => r.rows),
            ]);
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
        await db.query(
            'INSERT INTO products (title, description, price_paise, image_url) VALUES ($1, $2, $3, $4)',
            [req.body.title, req.body.description || '', pricePaise, req.body.image_url || null]
        );
    }
    res.redirect('/admin#tab-products');
});

router.post('/admin/products/:id/update', async (req, res) => {
    if (db.isDbConfigured()) {
        const pricePaise = Math.round(parseFloat(req.body.price || '0') * 100);
        await db.query(
            'UPDATE products SET title = $1, description = $2, price_paise = $3, image_url = $4, is_active = $5 WHERE id = $6',
            [req.body.title, req.body.description || '', pricePaise, req.body.image_url || null, req.body.is_active === '1', req.params.id]
        );
    }
    res.redirect('/admin#tab-products');
});

router.post('/admin/products/:id/delete', async (req, res) => {
    if (db.isDbConfigured()) {
        await db.query('DELETE FROM products WHERE id = $1', [req.params.id]);
    }
    res.redirect('/admin#tab-products');
});

router.post('/admin/features', async (req, res) => {
    if (db.isDbConfigured()) {
        await db.query(
            'INSERT INTO upcoming_features (title, description, status, sort_order) VALUES ($1, $2, $3, $4)',
            [req.body.title, req.body.description || '', req.body.status || 'planned', parseInt(req.body.sort_order, 10) || 0]
        );
    }
    res.redirect('/admin#tab-features');
});

router.post('/admin/features/:id/update', async (req, res) => {
    if (db.isDbConfigured()) {
        await db.query(
            'UPDATE upcoming_features SET title = $1, description = $2, status = $3, sort_order = $4, is_active = $5, updated_at = now() WHERE id = $6',
            [req.body.title, req.body.description || '', req.body.status || 'planned', parseInt(req.body.sort_order, 10) || 0, req.body.is_active === '1', req.params.id]
        );
    }
    res.redirect('/admin#tab-features');
});

router.post('/admin/features/:id/delete', async (req, res) => {
    if (db.isDbConfigured()) {
        await db.query('DELETE FROM upcoming_features WHERE id = $1', [req.params.id]);
    }
    res.redirect('/admin#tab-features');
});

module.exports = router;
