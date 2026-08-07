const express = require('express');
const db = require('../db');
const site = require('../config/site');

const router = express.Router();

router.get('/', async (req, res) => {
    let upcomingFeatures = [];
    if (db.isDbConfigured()) {
        try {
            const result = await db.query(
                'SELECT * FROM upcoming_features WHERE is_active = true ORDER BY sort_order ASC, created_at DESC'
            );
            upcomingFeatures = result.rows;
        } catch (error) {
            upcomingFeatures = [];
        }
    }

    res.render('home', {
        site,
        pageTitle: site.company_name,
        pageDescription: site.default_description,
        activePage: 'home',
        upcomingFeatures,
    });
});

router.get('/about', (req, res) => {
    res.render('about', {
        site,
        pageTitle: `${site.short_name} - About Us`,
        pageDescription: `About ${site.legal_name} in ${site.location}.`,
        activePage: 'about',
    });
});

router.get('/services', (req, res) => {
    res.render('services', {
        site,
        pageTitle: `${site.short_name} - Our Services`,
        pageDescription: `Explore the services offered by ${site.legal_name}.`,
        activePage: 'services',
    });
});

router.get('/contact', (req, res) => {
    const serviceKeys = site.services.map(s => s.key);
    const selectedService = serviceKeys.includes(req.query.service) ? req.query.service : '';

    res.render('contact', {
        site,
        pageTitle: `${site.short_name} - Contact Us`,
        pageDescription: `Contact ${site.legal_name} in ${site.location}.`,
        activePage: 'contact',
        selectedService,
    });
});

router.get('/software-development', (req, res) => {
    res.render('service-detail', {
        site,
        pageTitle: `${site.short_name} - Custom Software Development`,
        pageDescription: `Custom software development services from ${site.legal_name}.`,
        activePage: 'services',
        heroIcon: 'fas fa-laptop-code',
        heroTitle: 'Custom Software Development',
        heroSubtitle: 'Advanced, research-driven software solutions tailored to your business needs',
        features: site.software_features,
        portfolio: site.software_portfolio,
        serviceKey: 'software-development',
    });
});

router.get('/business-analytics', (req, res) => {
    res.render('service-detail', {
        site,
        pageTitle: `${site.short_name} - Business Analytics`,
        pageDescription: `Business analytics and decision-support services from ${site.legal_name}.`,
        activePage: 'services',
        heroIcon: 'fas fa-chart-line',
        heroTitle: 'Business Analytics',
        heroSubtitle: 'Dashboards, reports, and decision-support systems that turn operational data into clear business insight',
        features: site.business_analytics_features,
        portfolio: null,
        serviceKey: 'business-analytics',
    });
});

router.get('/cybersecurity', (req, res) => {
    res.render('service-detail', {
        site,
        pageTitle: `${site.short_name} - Cybersecurity`,
        pageDescription: `Cybersecurity and application hardening services from ${site.legal_name}.`,
        activePage: 'services',
        heroIcon: 'fas fa-shield-halved',
        heroTitle: 'Cybersecurity',
        heroSubtitle: 'Application hardening, access control, and secure delivery practices that help protect systems and data',
        features: site.cybersecurity_features,
        portfolio: null,
        serviceKey: 'cybersecurity',
    });
});

router.get('/product-strategy', (req, res) => {
    res.render('service-detail', {
        site,
        pageTitle: `${site.short_name} - Product Strategy & Scale`,
        pageDescription: `Product strategy and platform scaling services from ${site.legal_name}.`,
        activePage: 'services',
        heroIcon: 'fas fa-rocket',
        heroTitle: 'Product Strategy & Scale',
        heroSubtitle: 'Roadmaps, rollout planning, and platform improvements that help products launch faster and grow with confidence',
        features: site.product_strategy_features,
        portfolio: null,
        serviceKey: 'product-strategy',
    });
});

router.get('/store', async (req, res) => {
    let products = [];
    if (db.isDbConfigured()) {
        try {
            const result = await db.query('SELECT * FROM products WHERE is_active = true ORDER BY created_at DESC');
            products = result.rows;
        } catch (error) {
            products = [];
        }
    }

    res.render('store', {
        site,
        pageTitle: `${site.short_name} - Store`,
        pageDescription: `Products and packages from ${site.legal_name}.`,
        activePage: 'store',
        dbConfigured: db.isDbConfigured(),
        products,
    });
});

router.get('/checkout', async (req, res) => {
    const productId = parseInt(req.query.product, 10);
    let product = null;

    if (db.isDbConfigured() && productId) {
        try {
            const result = await db.query('SELECT * FROM products WHERE id = $1 AND is_active = true', [productId]);
            product = result.rows[0] || null;
        } catch (error) {
            product = null;
        }
    }

    res.render('checkout', {
        site,
        pageTitle: `${site.short_name} - Checkout`,
        pageDescription: 'Complete your purchase.',
        activePage: 'store',
        dbConfigured: db.isDbConfigured(),
        product,
        razorpayConfigured: Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET),
        autoShowLogin: !req.user,
    });
});

router.get('/account', require('../lib/auth').requireAuthPage(), async (req, res) => {
    let orders = [];
    if (db.isDbConfigured()) {
        try {
            const result = await db.query(
                `SELECT o.*, p.title AS product_title
                 FROM orders o
                 JOIN products p ON p.id = o.product_id
                 WHERE o.user_id = $1
                 ORDER BY o.created_at DESC`,
                [req.user.id]
            );
            orders = result.rows;
        } catch (error) {
            orders = [];
        }
    }

    res.render('account', {
        site,
        pageTitle: `${site.short_name} - My Account`,
        pageDescription: 'Your account and order history.',
        activePage: 'account',
        orders,
    });
});

module.exports = router;
