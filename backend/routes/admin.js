const express = require('express');
const multer = require('multer');
const db = require('../db');
const site = require('../config/site');
const { requireAdmin, createAdminSession, destroyAdminSession, hashPassword } = require('../lib/auth');
const adminSecurity = require('../lib/adminSecurity');
const design = require('../lib/design');
const siteInfo = require('../lib/siteInfo');
const legal = require('../lib/legal');
const auditLog = require('../lib/auditLog');
const coupons = require('../lib/coupons');
const invoices = require('../lib/invoices');
const mailer = require('../lib/mailer');
const reviews = require('../lib/reviews');
const { markOrderPaid } = require('../lib/orders');
const { adminLoginLimiter } = require('../lib/rateLimiters');
const csrf = require('../lib/csrf');

function logAdminAction(req, action, details) {
    return auditLog.log(req, action, details);
}

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
// Deliverable files (project ZIPs, documents) need a much higher limit than product images.
// Capped at 200MB since multer buffers the whole file in server memory before it's streamed to GridFS.
const uploadDeliverable = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });

function safeAdminRedirect(value) {
    if (typeof value === 'string' && value.startsWith('/admin')) {
        return value;
    }
    return '/admin';
}

function slugify(value) {
    return String(value || '')
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function parseFeaturesText(text) {
    return String(text || '')
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean)
        .map(line => {
            const [title, ...rest] = line.split('::');
            return { title: title.trim(), description: rest.join('::').trim() };
        });
}

function featuresToText(features) {
    return (features || []).map(f => `${f.title} :: ${f.description}`).join('\n');
}

function parseAreasText(text) {
    return String(text || '')
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean);
}

function areasToText(areas) {
    return (areas || []).join('\n');
}

router.get('/admin/login', (req, res) => {
    res.render('admin-login', { site, redirect: safeAdminRedirect(req.query.redirect), error: '' });
});

router.post('/admin/login', adminLoginLimiter, async (req, res) => {
    const redirect = safeAdminRedirect(req.body.redirect);

    if (!db.isDbConfigured()) {
        // No DB means no TOTP/self-service password possible; fall back to plain env-var check.
        const { checkAdminCredentials } = require('../lib/auth');
        if (!checkAdminCredentials(req.body.username, req.body.password)) {
            res.render('admin-login', { site, redirect, error: 'Invalid username or password.' });
            return;
        }
        await createAdminSession(res, req);
        res.redirect(redirect);
        return;
    }

    const valid = await adminSecurity.checkAdminPassword(req.body.username, req.body.password);
    if (!valid) {
        res.render('admin-login', { site, redirect, error: 'Invalid username or password.' });
        return;
    }

    if (await adminSecurity.isTotpEnabled()) {
        await adminSecurity.createPendingLogin(res, redirect);
        res.redirect('/admin/verify-2fa');
        return;
    }

    await createAdminSession(res, req);
    res.redirect(redirect);
});

router.get('/admin/verify-2fa', async (req, res) => {
    const pending = await adminSecurity.getPendingLogin(req);
    if (!pending) {
        res.redirect('/admin/login');
        return;
    }
    res.render('admin-verify-2fa', { site, error: '' });
});

router.post('/admin/verify-2fa', adminLoginLimiter, async (req, res) => {
    const pending = await adminSecurity.getPendingLogin(req);
    if (!pending) {
        res.redirect('/admin/login');
        return;
    }

    const valid = await adminSecurity.verifyLoginTotpCode(req.body.code);
    if (!valid) {
        res.render('admin-verify-2fa', { site, error: 'Invalid or expired code. Please try again.' });
        return;
    }

    const redirect = safeAdminRedirect(pending.redirect);
    await adminSecurity.clearPendingLogin(req, res);
    await createAdminSession(res, req);
    res.redirect(redirect);
});

router.get('/admin/forgot-password', async (req, res) => {
    const totpAvailable = db.isDbConfigured() && (await adminSecurity.isTotpEnabled());
    res.render('admin-forgot-password', { site, totpAvailable, error: '' });
});

router.post('/admin/forgot-password', adminLoginLimiter, async (req, res) => {
    const totpAvailable = db.isDbConfigured() && (await adminSecurity.isTotpEnabled());
    if (!totpAvailable) {
        res.render('admin-forgot-password', { site, totpAvailable, error: 'Two-factor authentication is not enabled, so password recovery is not available this way.' });
        return;
    }

    const valid = await adminSecurity.verifyLoginTotpCode(req.body.code);
    if (!valid) {
        res.render('admin-forgot-password', { site, totpAvailable, error: 'Invalid or expired code. Please try again.' });
        return;
    }

    const token = await adminSecurity.createPasswordResetToken();
    res.render('admin-reset-password', { site, token, error: '' });
});

router.post('/admin/reset-password', async (req, res) => {
    const valid = db.isDbConfigured() && (await adminSecurity.consumePasswordResetToken(req.body.token));
    if (!valid) {
        res.render('admin-forgot-password', { site, totpAvailable: true, error: 'That reset link expired. Please verify your code again.' });
        return;
    }

    if (!req.body.password || req.body.password.length < 8) {
        res.render('admin-login', { site, redirect: '/admin', error: 'Password reset failed: new password must be at least 8 characters. Please try the forgot-password flow again.' });
        return;
    }

    await adminSecurity.setAdminPassword(req.body.password);
    res.render('admin-login', { site, redirect: '/admin', error: 'Password updated. Please log in with your new password.' });
});

router.get('/admin/logout', async (req, res) => {
    await destroyAdminSession(req, res);
    res.redirect('/admin/login');
});

router.use('/admin', requireAdmin);

router.get('/admin/security', async (req, res) => {
    const enabled = db.isDbConfigured() && (await adminSecurity.isTotpEnabled());
    res.render('admin-security', { site, enabled, enrollment: null, error: '', message: '' });
});

router.post('/admin/security/start-enrollment', async (req, res) => {
    if (!db.isDbConfigured()) {
        res.redirect('/admin/security');
        return;
    }
    const enrollment = await adminSecurity.startTotpEnrollment();
    const QRCode = require('qrcode');
    const qrDataUrl = await QRCode.toDataURL(enrollment.url);
    res.render('admin-security', { site, enabled: false, enrollment: { ...enrollment, qrDataUrl }, error: '', message: '' });
});

router.post('/admin/security/confirm-enrollment', async (req, res) => {
    const ok = db.isDbConfigured() && (await adminSecurity.confirmTotpEnrollment(req.body.code));
    if (!ok) {
        res.render('admin-security', { site, enabled: false, enrollment: null, error: 'Invalid code. Please scan the QR code again and try once more.', message: '' });
        return;
    }
    res.render('admin-security', { site, enabled: true, enrollment: null, error: '', message: 'Two-factor authentication is now enabled.' });
});

router.post('/admin/security/disable', async (req, res) => {
    const ok = db.isDbConfigured() && (await adminSecurity.disableTotp(req.body.code));
    if (!ok) {
        res.render('admin-security', { site, enabled: true, enrollment: null, error: 'Invalid code. Two-factor authentication was not disabled.', message: '' });
        return;
    }
    res.render('admin-security', { site, enabled: false, enrollment: null, error: '', message: 'Two-factor authentication has been disabled.' });
});

router.post('/admin/security/change-password', async (req, res) => {
    const enabled = db.isDbConfigured() && (await adminSecurity.isTotpEnabled());

    if (!db.isDbConfigured() || !req.body.password || req.body.password.length < 8) {
        res.render('admin-security', { site, enabled, enrollment: null, error: 'New password must be at least 8 characters.', message: '' });
        return;
    }
    if (req.body.password !== req.body.confirm_password) {
        res.render('admin-security', { site, enabled, enrollment: null, error: 'Passwords do not match.', message: '' });
        return;
    }

    await adminSecurity.setAdminPassword(req.body.password);
    res.render('admin-security', { site, enabled, enrollment: null, error: '', message: 'Password updated successfully.' });
});

router.get('/admin', async (req, res) => {
    let submissions = [];
    let users = [];
    let orders = [];
    let products = [];
    let features = [];
    let services = [];
    let productReviews = [];
    let testimonials = [];
    let researchVerticals = [];
    let staffAccounts = [];

    if (db.isDbConfigured()) {
        try {
            const database = db.getDb();
            productReviews = await reviews.listAllReviews();
            const [submissionDocs, userDocs, orderDocs, productDocs, featureDocs, serviceDocs, testimonialDocs, researchDocs, staffDocs] = await Promise.all([
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
                database.collection('services').find().sort({ sort_order: 1, created_at: 1 }).toArray(),
                database.collection('testimonials').find().sort({ sort_order: 1, created_at: -1 }).toArray(),
                database.collection('research_verticals').find().sort({ sort_order: 1, created_at: -1 }).toArray(),
                database.collection('staff_accounts').aggregate([
                    { $sort: { created_at: -1 } },
                    { $lookup: { from: 'services', localField: 'service_id', foreignField: '_id', as: 'service' } },
                    { $unwind: { path: '$service', preserveNullAndEmptyArrays: true } },
                    { $addFields: { service_title: '$service.title' } },
                ]).toArray(),
            ]);

            submissions = submissionDocs.map(db.withId);
            users = userDocs.map(db.withId);
            orders = orderDocs.map(db.withId).map(order => ({
                ...order,
                display_title: order.items && order.items.length > 0
                    ? order.items.map(i => `${i.title}${i.quantity > 1 ? ' x' + i.quantity : ''}`).join(', ')
                    : order.product_title,
            }));
            products = productDocs.map(db.withId);
            features = featureDocs.map(db.withId).map(f => ({
                ...f,
                background_image: f.background_image_id ? `/uploads/${f.background_image_id}` : null,
            }));
            services = serviceDocs.map(db.withId).map(s => ({
                ...s,
                featuresText: featuresToText(s.features),
                background_image: s.background_image_id ? `/uploads/${s.background_image_id}` : null,
            }));
            testimonials = testimonialDocs.map(db.withId).map(t => ({
                ...t,
                background_image: t.background_image_id ? `/uploads/${t.background_image_id}` : null,
            }));
            researchVerticals = researchDocs.map(db.withId).map(r => ({
                ...r,
                areasText: areasToText(r.areas),
                background_image: r.background_image_id ? `/uploads/${r.background_image_id}` : null,
            }));
            staffAccounts = staffDocs.map(db.withId);
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
        services,
        productReviews,
        testimonials,
        researchVerticals,
        staffAccounts,
    });
});

router.post('/admin/reviews/:id/delete', async (req, res) => {
    if (db.isDbConfigured()) {
        await reviews.deleteReview(req.params.id);
        await logAdminAction(req, 'review.delete', req.params.id);
    }
    res.redirect('/admin?tab=reviews');
});

router.post('/admin/products', upload.array('images', 10), csrf.verifyAfterUpload, async (req, res) => {
    if (db.isDbConfigured()) {
        const pricePaise = Math.round(parseFloat(req.body.price || '0') * 100);
        const images = [];

        for (const file of req.files || []) {
            if (!file.mimetype.startsWith('image/')) continue;
            const fileId = await db.uploadBuffer(file.buffer, file.originalname, file.mimetype);
            images.push(fileId.toString());
        }

        await db.getDb().collection('products').insertOne({
            title: req.body.title,
            description: req.body.description || '',
            category: (req.body.category || '').trim(),
            price_paise: pricePaise,
            currency: 'INR',
            images,
            requires_approval: req.body.requires_approval === '1',
            auto_approve: req.body.auto_approve === '1',
            is_active: true,
            created_at: new Date(),
        });
        await logAdminAction(req, 'product.create', req.body.title);
    }
    res.redirect('/admin?tab=products');
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
                    category: (req.body.category || '').trim(),
                    price_paise: pricePaise,
                    is_active: req.body.is_active === '1',
                    requires_approval: req.body.requires_approval === '1',
                    auto_approve: req.body.auto_approve === '1',
                },
            }
        );
        await logAdminAction(req, 'product.update', req.body.title);
    }
    res.redirect('/admin?tab=products');
});

router.post('/admin/products/bulk-disable-approval', async (req, res) => {
    if (db.isDbConfigured()) {
        const result = await db.getDb().collection('products').updateMany(
            {},
            { $set: { requires_approval: false } }
        );
        await logAdminAction(req, 'product.bulk_disable_approval', `${result.modifiedCount} products`);
    }
    res.redirect('/admin?tab=products');
});

router.post('/admin/products/:id/images', upload.array('files', 10), csrf.verifyAfterUpload, async (req, res) => {
    if (db.isDbConfigured() && req.files && req.files.length > 0) {
        const products = db.getDb().collection('products');
        const product = await products.findOne({ _id: db.toId(req.params.id) });
        const existing = (product && product.images) || [];
        const remainingSlots = Math.max(0, 10 - existing.length);

        const newIds = [];
        for (const file of req.files.slice(0, remainingSlots)) {
            if (!file.mimetype.startsWith('image/')) continue;
            const fileId = await db.uploadBuffer(file.buffer, file.originalname, file.mimetype);
            newIds.push(fileId.toString());
        }

        if (newIds.length > 0) {
            await products.updateOne({ _id: db.toId(req.params.id) }, { $push: { images: { $each: newIds } } });
        }
    }
    res.redirect('/admin?tab=products');
});

router.post('/admin/products/:id/images/remove', async (req, res) => {
    if (db.isDbConfigured() && req.body.fileId) {
        await db.getDb().collection('products').updateOne(
            { _id: db.toId(req.params.id) },
            { $pull: { images: req.body.fileId } }
        );
        await db.deleteFile(req.body.fileId);
    }
    res.redirect('/admin?tab=products');
});

router.post('/admin/products/:id/delete', async (req, res) => {
    if (db.isDbConfigured()) {
        const product = await db.getDb().collection('products').findOne({ _id: db.toId(req.params.id) });
        await db.getDb().collection('products').deleteOne({ _id: db.toId(req.params.id) });
        for (const fileId of (product && product.images) || []) {
            await db.deleteFile(fileId);
        }
        if (product && product.deliverable_file_id) {
            await db.deleteFile(product.deliverable_file_id);
        }
        await logAdminAction(req, 'product.delete', product && product.title);
    }
    res.redirect('/admin?tab=products');
});

router.post('/admin/products/:id/deliverable', uploadDeliverable.single('deliverable'), csrf.verifyAfterUpload, async (req, res) => {
    if (db.isDbConfigured() && req.file) {
        const product = await db.getDb().collection('products').findOne({ _id: db.toId(req.params.id) });
        if (product && product.deliverable_file_id) {
            await db.deleteFile(product.deliverable_file_id);
        }
        const fileId = await db.uploadBuffer(req.file.buffer, req.file.originalname, req.file.mimetype);
        await db.getDb().collection('products').updateOne(
            { _id: db.toId(req.params.id) },
            { $set: { deliverable_file_id: fileId.toString(), deliverable_filename: req.file.originalname } }
        );
        await logAdminAction(req, 'product.deliverable_upload', req.file.originalname);
    }
    res.redirect('/admin?tab=products');
});

router.post('/admin/products/:id/deliverable/remove', async (req, res) => {
    if (db.isDbConfigured()) {
        const product = await db.getDb().collection('products').findOne({ _id: db.toId(req.params.id) });
        if (product && product.deliverable_file_id) {
            await db.deleteFile(product.deliverable_file_id);
            await db.getDb().collection('products').updateOne(
                { _id: db.toId(req.params.id) },
                { $unset: { deliverable_file_id: '', deliverable_filename: '' } }
            );
            await logAdminAction(req, 'product.deliverable_remove', product.title);
        }
    }
    res.redirect('/admin?tab=products');
});

router.post('/admin/features', async (req, res) => {
    if (db.isDbConfigured()) {
        await db.getDb().collection('upcoming_features').insertOne({
            title: req.body.title,
            description: req.body.description || '',
            image_url: null,
            status: req.body.status || 'planned',
            sort_order: parseInt(req.body.sort_order, 10) || 0,
            is_active: req.body.is_active === '1',
            created_at: new Date(),
            updated_at: new Date(),
        });
        await logAdminAction(req, 'feature.create', req.body.title);
    }
    res.redirect('/admin?tab=features');
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
        await logAdminAction(req, 'feature.update', req.body.title);
    }
    res.redirect('/admin?tab=features');
});

router.post('/admin/features/:id/delete', async (req, res) => {
    if (db.isDbConfigured()) {
        const feature = await db.getDb().collection('upcoming_features').findOne({ _id: db.toId(req.params.id) });
        await db.getDb().collection('upcoming_features').deleteOne({ _id: db.toId(req.params.id) });
        if (feature && feature.background_image_id) {
            await db.deleteFile(feature.background_image_id);
        }
        await logAdminAction(req, 'feature.delete', req.params.id);
    }
    res.redirect('/admin?tab=features');
});

router.post('/admin/features/:id/background', upload.single('background'), csrf.verifyAfterUpload, async (req, res) => {
    if (db.isDbConfigured() && req.file) {
        const feature = await db.getDb().collection('upcoming_features').findOne({ _id: db.toId(req.params.id) });
        if (feature && feature.background_image_id) {
            await db.deleteFile(feature.background_image_id);
        }
        const fileId = await db.uploadBuffer(req.file.buffer, req.file.originalname, req.file.mimetype);
        await db.getDb().collection('upcoming_features').updateOne(
            { _id: db.toId(req.params.id) },
            { $set: { background_image_id: fileId.toString() } }
        );
        await logAdminAction(req, 'feature.background_upload', req.params.id);
    }
    res.redirect('/admin?tab=features');
});

router.post('/admin/features/:id/background/remove', async (req, res) => {
    if (db.isDbConfigured()) {
        const feature = await db.getDb().collection('upcoming_features').findOne({ _id: db.toId(req.params.id) });
        if (feature && feature.background_image_id) {
            await db.deleteFile(feature.background_image_id);
            await db.getDb().collection('upcoming_features').updateOne(
                { _id: db.toId(req.params.id) },
                { $unset: { background_image_id: '' } }
            );
        }
        await logAdminAction(req, 'feature.background_remove', req.params.id);
    }
    res.redirect('/admin?tab=features');
});

router.post('/admin/features/:id/background-color', async (req, res) => {
    if (db.isDbConfigured() && req.body.color) {
        await db.getDb().collection('upcoming_features').updateOne(
            { _id: db.toId(req.params.id) },
            { $set: { background_color: req.body.color } }
        );
        await logAdminAction(req, 'feature.background_color', req.params.id);
    }
    res.redirect('/admin?tab=features');
});

router.post('/admin/testimonials', async (req, res) => {
    if (db.isDbConfigured()) {
        await db.getDb().collection('testimonials').insertOne({
            quote: req.body.quote,
            author: req.body.author || '',
            sort_order: parseInt(req.body.sort_order, 10) || 0,
            created_at: new Date(),
            updated_at: new Date(),
        });
        await logAdminAction(req, 'testimonial.create', req.body.author);
    }
    res.redirect('/admin?tab=testimonials');
});

router.post('/admin/testimonials/:id/update', async (req, res) => {
    if (db.isDbConfigured()) {
        await db.getDb().collection('testimonials').updateOne(
            { _id: db.toId(req.params.id) },
            {
                $set: {
                    quote: req.body.quote,
                    author: req.body.author || '',
                    sort_order: parseInt(req.body.sort_order, 10) || 0,
                    updated_at: new Date(),
                },
            }
        );
        await logAdminAction(req, 'testimonial.update', req.body.author);
    }
    res.redirect('/admin?tab=testimonials');
});

router.post('/admin/testimonials/:id/delete', async (req, res) => {
    if (db.isDbConfigured()) {
        const testimonial = await db.getDb().collection('testimonials').findOne({ _id: db.toId(req.params.id) });
        await db.getDb().collection('testimonials').deleteOne({ _id: db.toId(req.params.id) });
        if (testimonial && testimonial.background_image_id) {
            await db.deleteFile(testimonial.background_image_id);
        }
        await logAdminAction(req, 'testimonial.delete', req.params.id);
    }
    res.redirect('/admin?tab=testimonials');
});

router.post('/admin/testimonials/:id/background', upload.single('background'), csrf.verifyAfterUpload, async (req, res) => {
    if (db.isDbConfigured() && req.file) {
        const testimonial = await db.getDb().collection('testimonials').findOne({ _id: db.toId(req.params.id) });
        if (testimonial && testimonial.background_image_id) {
            await db.deleteFile(testimonial.background_image_id);
        }
        const fileId = await db.uploadBuffer(req.file.buffer, req.file.originalname, req.file.mimetype);
        await db.getDb().collection('testimonials').updateOne(
            { _id: db.toId(req.params.id) },
            { $set: { background_image_id: fileId.toString() } }
        );
        await logAdminAction(req, 'testimonial.background_upload', req.params.id);
    }
    res.redirect('/admin?tab=testimonials');
});

router.post('/admin/testimonials/:id/background/remove', async (req, res) => {
    if (db.isDbConfigured()) {
        const testimonial = await db.getDb().collection('testimonials').findOne({ _id: db.toId(req.params.id) });
        if (testimonial && testimonial.background_image_id) {
            await db.deleteFile(testimonial.background_image_id);
            await db.getDb().collection('testimonials').updateOne(
                { _id: db.toId(req.params.id) },
                { $unset: { background_image_id: '' } }
            );
        }
        await logAdminAction(req, 'testimonial.background_remove', req.params.id);
    }
    res.redirect('/admin?tab=testimonials');
});

router.post('/admin/testimonials/:id/background-color', async (req, res) => {
    if (db.isDbConfigured() && req.body.color) {
        await db.getDb().collection('testimonials').updateOne(
            { _id: db.toId(req.params.id) },
            { $set: { background_color: req.body.color } }
        );
        await logAdminAction(req, 'testimonial.background_color', req.params.id);
    }
    res.redirect('/admin?tab=testimonials');
});

router.post('/admin/research-verticals', async (req, res) => {
    if (db.isDbConfigured()) {
        await db.getDb().collection('research_verticals').insertOne({
            title: req.body.title,
            summary: req.body.summary || '',
            areas: parseAreasText(req.body.areas),
            sort_order: parseInt(req.body.sort_order, 10) || 0,
            created_at: new Date(),
            updated_at: new Date(),
        });
        await logAdminAction(req, 'research_vertical.create', req.body.title);
    }
    res.redirect('/admin?tab=research');
});

router.post('/admin/research-verticals/:id/update', async (req, res) => {
    if (db.isDbConfigured()) {
        await db.getDb().collection('research_verticals').updateOne(
            { _id: db.toId(req.params.id) },
            {
                $set: {
                    title: req.body.title,
                    summary: req.body.summary || '',
                    areas: parseAreasText(req.body.areas),
                    sort_order: parseInt(req.body.sort_order, 10) || 0,
                    updated_at: new Date(),
                },
            }
        );
        await logAdminAction(req, 'research_vertical.update', req.body.title);
    }
    res.redirect('/admin?tab=research');
});

router.post('/admin/research-verticals/:id/delete', async (req, res) => {
    if (db.isDbConfigured()) {
        const vertical = await db.getDb().collection('research_verticals').findOne({ _id: db.toId(req.params.id) });
        await db.getDb().collection('research_verticals').deleteOne({ _id: db.toId(req.params.id) });
        if (vertical && vertical.background_image_id) {
            await db.deleteFile(vertical.background_image_id);
        }
        await logAdminAction(req, 'research_vertical.delete', req.params.id);
    }
    res.redirect('/admin?tab=research');
});

router.post('/admin/research-verticals/:id/background', upload.single('background'), csrf.verifyAfterUpload, async (req, res) => {
    if (db.isDbConfigured() && req.file) {
        const vertical = await db.getDb().collection('research_verticals').findOne({ _id: db.toId(req.params.id) });
        if (vertical && vertical.background_image_id) {
            await db.deleteFile(vertical.background_image_id);
        }
        const fileId = await db.uploadBuffer(req.file.buffer, req.file.originalname, req.file.mimetype);
        await db.getDb().collection('research_verticals').updateOne(
            { _id: db.toId(req.params.id) },
            { $set: { background_image_id: fileId.toString() } }
        );
        await logAdminAction(req, 'research_vertical.background_upload', req.params.id);
    }
    res.redirect('/admin?tab=research');
});

router.post('/admin/research-verticals/:id/background/remove', async (req, res) => {
    if (db.isDbConfigured()) {
        const vertical = await db.getDb().collection('research_verticals').findOne({ _id: db.toId(req.params.id) });
        if (vertical && vertical.background_image_id) {
            await db.deleteFile(vertical.background_image_id);
            await db.getDb().collection('research_verticals').updateOne(
                { _id: db.toId(req.params.id) },
                { $unset: { background_image_id: '' } }
            );
        }
        await logAdminAction(req, 'research_vertical.background_remove', req.params.id);
    }
    res.redirect('/admin?tab=research');
});

router.post('/admin/research-verticals/:id/background-color', async (req, res) => {
    if (db.isDbConfigured() && req.body.color) {
        await db.getDb().collection('research_verticals').updateOne(
            { _id: db.toId(req.params.id) },
            { $set: { background_color: req.body.color } }
        );
        await logAdminAction(req, 'research_vertical.background_color', req.params.id);
    }
    res.redirect('/admin?tab=research');
});

router.post('/admin/services', async (req, res) => {
    if (db.isDbConfigured()) {
        const slug = slugify(req.body.slug || req.body.title);
        await db.getDb().collection('services').insertOne({
            title: req.body.title,
            slug,
            icon: req.body.icon || 'fas fa-briefcase',
            summary: req.body.summary || '',
            hero_subtitle: req.body.hero_subtitle || '',
            cta_label: req.body.cta_label || 'View Detailed Features',
            features: parseFeaturesText(req.body.features),
            sort_order: parseInt(req.body.sort_order, 10) || 0,
            is_active: true,
            created_at: new Date(),
            updated_at: new Date(),
        });
        await logAdminAction(req, 'service.create', req.body.title);
    }
    res.redirect('/admin?tab=services');
});

router.post('/admin/services/:id/update', async (req, res) => {
    if (db.isDbConfigured()) {
        const slug = slugify(req.body.slug || req.body.title);
        await db.getDb().collection('services').updateOne(
            { _id: db.toId(req.params.id) },
            {
                $set: {
                    title: req.body.title,
                    slug,
                    icon: req.body.icon || 'fas fa-briefcase',
                    summary: req.body.summary || '',
                    hero_subtitle: req.body.hero_subtitle || '',
                    cta_label: req.body.cta_label || 'View Detailed Features',
                    features: parseFeaturesText(req.body.features),
                    sort_order: parseInt(req.body.sort_order, 10) || 0,
                    is_active: req.body.is_active === '1',
                    updated_at: new Date(),
                },
            }
        );
        await logAdminAction(req, 'service.update', req.body.title);
    }
    res.redirect('/admin?tab=services');
});

router.post('/admin/services/:id/delete', async (req, res) => {
    if (db.isDbConfigured()) {
        const assignedStaffCount = await db.getDb().collection('staff_accounts').countDocuments({ service_id: db.toId(req.params.id) });
        if (assignedStaffCount > 0) {
            await logAdminAction(req, 'service.delete_blocked', `${req.params.id}: ${assignedStaffCount} staff assigned`);
            res.redirect('/admin?tab=services');
            return;
        }
        const service = await db.getDb().collection('services').findOne({ _id: db.toId(req.params.id) });
        await db.getDb().collection('services').deleteOne({ _id: db.toId(req.params.id) });
        if (service && service.background_image_id) {
            await db.deleteFile(service.background_image_id);
        }
        await logAdminAction(req, 'service.delete', req.params.id);
    }
    res.redirect('/admin?tab=services');
});

router.post('/admin/services/:id/background', upload.single('background'), csrf.verifyAfterUpload, async (req, res) => {
    if (db.isDbConfigured() && req.file) {
        const service = await db.getDb().collection('services').findOne({ _id: db.toId(req.params.id) });
        if (service && service.background_image_id) {
            await db.deleteFile(service.background_image_id);
        }
        const fileId = await db.uploadBuffer(req.file.buffer, req.file.originalname, req.file.mimetype);
        await db.getDb().collection('services').updateOne(
            { _id: db.toId(req.params.id) },
            { $set: { background_image_id: fileId.toString() } }
        );
        await logAdminAction(req, 'service.background_upload', req.params.id);
    }
    res.redirect('/admin?tab=services');
});

router.post('/admin/services/:id/background/remove', async (req, res) => {
    if (db.isDbConfigured()) {
        const service = await db.getDb().collection('services').findOne({ _id: db.toId(req.params.id) });
        if (service && service.background_image_id) {
            await db.deleteFile(service.background_image_id);
            await db.getDb().collection('services').updateOne(
                { _id: db.toId(req.params.id) },
                { $unset: { background_image_id: '' } }
            );
        }
        await logAdminAction(req, 'service.background_remove', req.params.id);
    }
    res.redirect('/admin?tab=services');
});

router.post('/admin/services/:id/background-color', async (req, res) => {
    if (db.isDbConfigured() && req.body.color) {
        await db.getDb().collection('services').updateOne(
            { _id: db.toId(req.params.id) },
            { $set: { background_color: req.body.color } }
        );
        await logAdminAction(req, 'service.background_color', req.params.id);
    }
    res.redirect('/admin?tab=services');
});

router.post('/admin/staff', async (req, res) => {
    if (db.isDbConfigured()) {
        const email = String(req.body.email || '').trim().toLowerCase();
        const name = String(req.body.name || '').trim();
        const password = String(req.body.password || '');
        const isAllStores = req.body.service_id === 'all';
        const validServiceId = /^[0-9a-fA-F]{24}$/.test(req.body.service_id || '');
        const service = validServiceId ? await db.getDb().collection('services').findOne({ _id: db.toId(req.body.service_id) }) : null;

        if (name && email && password.length >= 8 && (isAllStores || service)) {
            try {
                await db.getDb().collection('staff_accounts').insertOne({
                    name,
                    email,
                    password_hash: await hashPassword(password),
                    service_id: isAllStores ? null : service._id,
                    service_slug: isAllStores ? 'all' : service.slug,
                    is_active: true,
                    created_at: new Date(),
                    updated_at: new Date(),
                    last_login_at: null,
                });
                await logAdminAction(req, 'staff.create', email);
            } catch (error) {
                // Duplicate email (unique index) or other write error - silently skip, matching this file's existing error-handling style.
            }
        }
    }
    res.redirect('/admin?tab=staff');
});

router.post('/admin/staff/:id/update', async (req, res) => {
    if (db.isDbConfigured()) {
        const update = {
            name: String(req.body.name || '').trim(),
            email: String(req.body.email || '').trim().toLowerCase(),
            is_active: req.body.is_active === '1',
            updated_at: new Date(),
        };
        if (req.body.service_id === 'all') {
            update.service_id = null;
            update.service_slug = 'all';
        } else if (/^[0-9a-fA-F]{24}$/.test(req.body.service_id || '')) {
            const service = await db.getDb().collection('services').findOne({ _id: db.toId(req.body.service_id) });
            if (service) {
                update.service_id = service._id;
                update.service_slug = service.slug;
            }
        }
        try {
            await db.getDb().collection('staff_accounts').updateOne(
                { _id: db.toId(req.params.id) },
                { $set: update }
            );
            await logAdminAction(req, 'staff.update', req.params.id);
        } catch (error) {
            // Duplicate email or other write error - skip.
        }
    }
    res.redirect('/admin?tab=staff');
});

router.post('/admin/staff/:id/reset-password', async (req, res) => {
    if (db.isDbConfigured() && req.body.password && req.body.password.length >= 8) {
        await db.getDb().collection('staff_accounts').updateOne(
            { _id: db.toId(req.params.id) },
            { $set: { password_hash: await hashPassword(req.body.password), updated_at: new Date() } }
        );
        await db.getDb().collection('staff_sessions').deleteMany({ staff_id: db.toId(req.params.id) });
        await logAdminAction(req, 'staff.reset_password', req.params.id);
    }
    res.redirect('/admin?tab=staff');
});

router.get('/admin/design', async (req, res) => {
    const settings = await design.getDesignSettings();
    res.render('admin-design', { site, colors: settings.colors, images: settings.images, error: '', message: '' });
});

router.post('/admin/design/colors', async (req, res) => {
    if (db.isDbConfigured()) {
        await design.saveColors({
            primary_color: req.body.primary_color,
            primary_dark: req.body.primary_dark,
            dark_color: req.body.dark_color,
            light_color: req.body.light_color,
            text_color: req.body.text_color,
            heading_color: req.body.heading_color,
        });
        await logAdminAction(req, 'design.colors', 'Updated site color palette');
    }
    const settings = await design.getDesignSettings();
    res.render('admin-design', { site, colors: settings.colors, images: settings.images, error: '', message: 'Colors updated.' });
});

router.post('/admin/design/upload/:slot', upload.single('file'), csrf.verifyAfterUpload, async (req, res) => {
    const settings = await design.getDesignSettings();

    if (!db.isDbConfigured() || !req.file) {
        res.render('admin-design', { site, colors: settings.colors, images: settings.images, error: 'No file received.', message: '' });
        return;
    }

    if (!design.IMAGE_SLOTS.includes(req.params.slot)) {
        res.render('admin-design', { site, colors: settings.colors, images: settings.images, error: 'Unknown image slot.', message: '' });
        return;
    }

    if (!req.file.mimetype.startsWith('image/')) {
        res.render('admin-design', { site, colors: settings.colors, images: settings.images, error: 'Please upload an image file.', message: '' });
        return;
    }

    const uploadStream = db.getBucket().openUploadStream(req.file.originalname, { contentType: req.file.mimetype });
    uploadStream.end(req.file.buffer);

    uploadStream.on('finish', async () => {
        await design.saveImageRef(req.params.slot, uploadStream.id);
        await logAdminAction(req, 'design.image', `Updated ${req.params.slot}`);
        const updated = await design.getDesignSettings();
        res.render('admin-design', { site, colors: updated.colors, images: updated.images, error: '', message: 'Image updated.' });
    });

    uploadStream.on('error', () => {
        res.render('admin-design', { site, colors: settings.colors, images: settings.images, error: 'Upload failed. Please try again.', message: '' });
    });
});

router.post('/admin/design/remove/:slot', async (req, res) => {
    if (db.isDbConfigured() && design.IMAGE_SLOTS.includes(req.params.slot)) {
        await design.removeImage(req.params.slot);
        await logAdminAction(req, 'design.image_remove', req.params.slot);
    }
    const settings = await design.getDesignSettings();
    res.render('admin-design', { site, colors: settings.colors, images: settings.images, error: '', message: 'Image removed.' });
});

router.post('/admin/design/card-color/:slot', async (req, res) => {
    if (db.isDbConfigured() && design.CARD_COLOR_SLOTS.includes(req.params.slot) && req.body.color) {
        await design.saveCardColor(req.params.slot, req.body.color);
        await logAdminAction(req, 'design.card_color', req.params.slot);
    }
    const settings = await design.getDesignSettings();
    res.locals.design = settings;
    res.render('admin-design', { site, colors: settings.colors, images: settings.images, error: '', message: 'Card color updated.' });
});

router.post('/admin/design/card-color/:slot/remove', async (req, res) => {
    if (db.isDbConfigured() && design.CARD_COLOR_SLOTS.includes(req.params.slot)) {
        await design.removeCardColor(req.params.slot);
        await logAdminAction(req, 'design.card_color_remove', req.params.slot);
    }
    const settings = await design.getDesignSettings();
    res.locals.design = settings;
    res.render('admin-design', { site, colors: settings.colors, images: settings.images, error: '', message: 'Card color reset.' });
});

router.post('/admin/design/welcome-video', uploadDeliverable.single('video'), csrf.verifyAfterUpload, async (req, res) => {
    const settings = await design.getDesignSettings();

    if (!db.isDbConfigured() || !req.file) {
        res.locals.design = settings;
        res.render('admin-design', { site, colors: settings.colors, images: settings.images, error: 'No file received.', message: '' });
        return;
    }

    if (!req.file.mimetype.startsWith('video/')) {
        res.locals.design = settings;
        res.render('admin-design', { site, colors: settings.colors, images: settings.images, error: 'Please upload a video file.', message: '' });
        return;
    }

    const oldVideoUrl = settings.welcomeVideo;
    const fileId = await db.uploadBuffer(req.file.buffer, req.file.originalname, req.file.mimetype);
    await design.saveWelcomeVideo(fileId);
    if (oldVideoUrl) {
        await db.deleteFile(oldVideoUrl.replace('/uploads/', ''));
    }
    await logAdminAction(req, 'design.welcome_video', 'Updated welcome screen video');
    const updated = await design.getDesignSettings();
    res.locals.design = updated;
    res.render('admin-design', { site, colors: updated.colors, images: updated.images, error: '', message: 'Video updated.' });
});

router.post('/admin/design/welcome-video/remove', async (req, res) => {
    if (db.isDbConfigured()) {
        await design.removeWelcomeVideo();
        await logAdminAction(req, 'design.welcome_video_remove', 'Removed welcome screen video');
    }
    const settings = await design.getDesignSettings();
    res.locals.design = settings;
    res.render('admin-design', { site, colors: settings.colors, images: settings.images, error: '', message: 'Video removed.' });
});

router.post('/admin/orders/:id/approve', async (req, res) => {
    if (db.isDbConfigured()) {
        await db.getDb().collection('orders').updateOne(
            { _id: db.toId(req.params.id), status: 'pending_approval' },
            { $set: { status: 'approved_awaiting_payment', updated_at: new Date() } }
        );
        await logAdminAction(req, 'order.approve', req.params.id);
    }
    res.redirect('/admin?tab=orders');
});

router.post('/admin/orders/:id/confirm-manual-upi', async (req, res) => {
    if (db.isDbConfigured()) {
        const order = await db.getDb().collection('orders').findOneAndUpdate(
            { _id: db.toId(req.params.id), status: 'awaiting_upi_confirmation' },
            { $set: { status: 'paid', updated_at: new Date() } },
            { returnDocument: 'after' }
        );
        if (order) {
            const user = await db.getDb().collection('users').findOne({ _id: order.user_id });
            if (user) {
                await markOrderPaid(order, { email: user.email, name: user.name, site: res.locals.site });
            }
            await logAdminAction(req, 'order.confirm_manual_upi', req.params.id);
        }
    }
    res.redirect('/admin?tab=orders');
});

router.post('/admin/orders/:id/reject-manual-upi', async (req, res) => {
    if (db.isDbConfigured()) {
        await db.getDb().collection('orders').updateOne(
            { _id: db.toId(req.params.id), status: 'awaiting_upi_confirmation' },
            { $set: { status: 'failed', updated_at: new Date() } }
        );
        await logAdminAction(req, 'order.reject_manual_upi', req.params.id);
    }
    res.redirect('/admin?tab=orders');
});

router.post('/admin/orders/:id/reject', async (req, res) => {
    if (db.isDbConfigured()) {
        await db.getDb().collection('orders').updateOne(
            { _id: db.toId(req.params.id), status: 'pending_approval' },
            { $set: { status: 'rejected', updated_at: new Date() } }
        );
        await logAdminAction(req, 'order.reject', req.params.id);
    }
    res.redirect('/admin?tab=orders');
});

router.post('/admin/orders/:id/delivery-status', async (req, res) => {
    const allowed = ['processing', 'shipped', 'delivered', 'cancelled'];
    if (db.isDbConfigured() && allowed.includes(req.body.delivery_status)) {
        await db.getDb().collection('orders').updateOne(
            { _id: db.toId(req.params.id) },
            { $set: { delivery_status: req.body.delivery_status, updated_at: new Date() } }
        );
        await logAdminAction(req, 'order.delivery_status', `${req.params.id} -> ${req.body.delivery_status}`);
    }
    res.redirect('/admin?tab=orders');
});

router.post('/admin/orders/:id/deliverable', uploadDeliverable.array('files', 5), csrf.verifyAfterUpload, async (req, res) => {
    if (db.isDbConfigured() && req.files && req.files.length > 0) {
        const newFiles = [];
        for (const file of req.files) {
            const fileId = await db.uploadBuffer(file.buffer, file.originalname, file.mimetype);
            newFiles.push({ id: fileId.toString(), filename: file.originalname, uploaded_at: new Date() });
        }
        await db.getDb().collection('orders').updateOne(
            { _id: db.toId(req.params.id) },
            { $push: { deliverable_files: { $each: newFiles } } }
        );
        await logAdminAction(req, 'order.deliverable_upload', `${req.params.id}: ${newFiles.map(f => f.filename).join(', ')}`);
    }
    res.redirect('/admin?tab=orders');
});

router.post('/admin/orders/:id/deliverable/:fileId/remove', async (req, res) => {
    if (db.isDbConfigured()) {
        await db.getDb().collection('orders').updateOne(
            { _id: db.toId(req.params.id) },
            { $pull: { deliverable_files: { id: req.params.fileId } } }
        );
        await db.deleteFile(req.params.fileId);
        await logAdminAction(req, 'order.deliverable_remove', req.params.id);
    }
    res.redirect('/admin?tab=orders');
});

router.post('/admin/design/admin-theme', async (req, res) => {
    if (db.isDbConfigured() && req.body.admin_bg_color) {
        await design.saveAdminBackground(req.body.admin_bg_color);
        await logAdminAction(req, 'design.admin_theme', 'Updated admin panel background');
    }
    const settings = await design.getDesignSettings();
    res.render('admin-design', { site, colors: settings.colors, images: settings.images, error: '', message: 'Admin panel appearance updated.' });
});

router.post('/admin/design/admin-colors', async (req, res) => {
    if (db.isDbConfigured()) {
        await design.saveAdminColors({
            admin_accent: req.body.admin_accent,
            admin_accent_dark: req.body.admin_accent_dark,
            admin_text: req.body.admin_text,
            admin_surface: req.body.admin_surface,
        });
        await logAdminAction(req, 'design.admin_colors', 'Updated admin panel colors');
    }
    const settings = await design.getDesignSettings();
    res.render('admin-design', { site, colors: settings.colors, images: settings.images, error: '', message: 'Admin panel colors updated.' });
});

router.post('/admin/design/admin-button-color/:slot', async (req, res) => {
    if (db.isDbConfigured() && design.ADMIN_BUTTON_SLOTS.includes(req.params.slot) && req.body.color) {
        await design.saveAdminButtonColor(req.params.slot, req.body.color);
        await logAdminAction(req, 'design.admin_button_color', req.params.slot);
    }
    const settings = await design.getDesignSettings();
    res.render('admin-design', { site, colors: settings.colors, images: settings.images, error: '', message: 'Button color updated.' });
});

router.post('/admin/design/admin-button-color/:slot/remove', async (req, res) => {
    if (db.isDbConfigured() && design.ADMIN_BUTTON_SLOTS.includes(req.params.slot)) {
        await design.removeAdminButtonColor(req.params.slot);
        await logAdminAction(req, 'design.admin_button_color_remove', req.params.slot);
    }
    const settings = await design.getDesignSettings();
    res.render('admin-design', { site, colors: settings.colors, images: settings.images, error: '', message: 'Button color reset.' });
});

router.get('/admin/tickets', async (req, res) => {
    let tickets = [];
    let services = [];
    if (db.isDbConfigured()) {
        services = (await db.getDb().collection('services').find({ is_active: true }).sort({ sort_order: 1 }).toArray()).map(db.withId);

        const pipeline = [
            { $sort: { created_at: -1 } },
            { $lookup: { from: 'users', localField: 'user_id', foreignField: '_id', as: 'user' } },
            { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
            { $lookup: { from: 'services', localField: 'service_id', foreignField: '_id', as: 'service' } },
            { $unwind: { path: '$service', preserveNullAndEmptyArrays: true } },
            { $addFields: { user_name: '$user.name', user_email: '$user.email', service_title: '$service.title' } },
        ];

        if (req.query.service === 'unassigned') {
            pipeline.push({ $match: { service_id: { $exists: false } } });
        } else if (/^[0-9a-fA-F]{24}$/.test(req.query.service || '')) {
            pipeline.push({ $match: { service_id: db.toId(req.query.service) } });
        }

        const docs = await db.getDb().collection('tickets').aggregate(pipeline).toArray();
        tickets = docs.map(db.withId);
    }
    res.render('admin-tickets', { site, tickets, services, selectedServiceFilter: req.query.service || '', error: '', message: '' });
});

router.post('/admin/tickets/:id/update', async (req, res) => {
    if (db.isDbConfigured()) {
        const allowedStatus = ['open', 'in_progress', 'fulfilled', 'closed'];
        const allowedDelivery = ['not_delivered', 'delivered'];
        const allowedPayment = ['unpaid', 'awaiting_confirmation', 'paid'];
        const update = { updated_at: new Date() };

        if (allowedStatus.includes(req.body.status)) update.status = req.body.status;
        if (allowedDelivery.includes(req.body.delivery_status)) update.delivery_status = req.body.delivery_status;
        if (allowedPayment.includes(req.body.payment_status)) update.payment_status = req.body.payment_status;
        if (req.body.price !== undefined && req.body.price !== '') {
            update.price_paise = Math.round(parseFloat(req.body.price) * 100);
        }
        update.admin_notes = String(req.body.admin_notes || '').trim();

        if (/^[0-9a-fA-F]{24}$/.test(req.body.service_id || '')) {
            const service = await db.getDb().collection('services').findOne({ _id: db.toId(req.body.service_id) });
            if (service) {
                update.service_id = service._id;
                update.service_slug = service.slug;
            }
        }

        await db.getDb().collection('tickets').updateOne(
            { _id: db.toId(req.params.id) },
            { $set: update }
        );
        await logAdminAction(req, 'ticket.update', req.params.id);
    }
    res.redirect('/admin/tickets');
});

router.post('/admin/tickets/:id/confirm-manual-upi', async (req, res) => {
    if (db.isDbConfigured()) {
        const ticket = await db.getDb().collection('tickets').findOneAndUpdate(
            { _id: db.toId(req.params.id), payment_status: 'awaiting_confirmation' },
            { $set: { payment_status: 'paid', updated_at: new Date() } },
            { returnDocument: 'after' }
        );
        if (ticket) {
            const user = await db.getDb().collection('users').findOne({ _id: ticket.user_id });
            if (user) {
                mailer.sendOrderConfirmation({
                    to: user.email,
                    name: user.name,
                    items: [{ title: ticket.title, quantity: 1, amount_paise: ticket.price_paise }],
                    totalPaise: ticket.price_paise,
                    currency: ticket.currency,
                    orderId: ticket._id.toString(),
                    site: res.locals.site,
                }).catch(() => {});
            }
            await logAdminAction(req, 'ticket.confirm_manual_upi', req.params.id);
        }
    }
    res.redirect('/admin/tickets');
});

router.post('/admin/tickets/:id/reject-manual-upi', async (req, res) => {
    if (db.isDbConfigured()) {
        await db.getDb().collection('tickets').updateOne(
            { _id: db.toId(req.params.id), payment_status: 'awaiting_confirmation' },
            { $set: { payment_status: 'unpaid', updated_at: new Date() } }
        );
        await logAdminAction(req, 'ticket.reject_manual_upi', req.params.id);
    }
    res.redirect('/admin/tickets');
});

router.get('/admin/tickets/:id/messages', async (req, res) => {
    if (!db.isDbConfigured()) {
        res.status(503).json({ error: 'Not available.' });
        return;
    }
    const ticket = await db.getDb().collection('tickets').findOne({ _id: db.toId(req.params.id) });
    if (!ticket) {
        res.status(404).json({ error: 'Ticket not found.' });
        return;
    }
    res.json({ messages: ticket.messages || [] });
});

router.post('/admin/tickets/:id/message', async (req, res) => {
    if (!db.isDbConfigured()) {
        res.status(503).json({ error: 'Not available.' });
        return;
    }
    const text = String(req.body.text || '').trim();
    if (!text) {
        res.status(422).json({ error: 'Message cannot be empty.' });
        return;
    }

    const existing = await db.getDb().collection('tickets').findOne({ _id: db.toId(req.params.id) });
    if (!existing) {
        res.status(404).json({ error: 'Ticket not found.' });
        return;
    }
    if (existing.status === 'closed') {
        res.status(422).json({ error: 'This ticket is closed. Reopen it to send a message.' });
        return;
    }

    const newMessage = { from: 'admin', text, created_at: new Date() };
    const ticket = await db.getDb().collection('tickets').findOneAndUpdate(
        { _id: db.toId(req.params.id) },
        { $push: { messages: newMessage }, $set: { updated_at: new Date(), unread_by_customer: true } },
        { returnDocument: 'after' }
    );

    const user = await db.getDb().collection('users').findOne({ _id: ticket.user_id });
    if (user) {
        mailer.sendMail({
            to: user.email,
            subject: `New reply on your ticket: ${ticket.title}`,
            html: `<p>Hi ${user.name},</p><p>We replied on your ticket <strong>${ticket.title}</strong>:</p><p>${text}</p><p>View it at <a href="${res.locals.site.site_url}/tickets">your tickets page</a>.</p>`,
        }).catch(() => {});
    }
    await logAdminAction(req, 'ticket.message', req.params.id);

    res.json({ message: newMessage });
});

router.post('/admin/tickets/:id/deliverable', uploadDeliverable.array('files', 5), csrf.verifyAfterUpload, async (req, res) => {
    if (db.isDbConfigured() && req.files && req.files.length > 0) {
        const newFiles = [];
        for (const file of req.files) {
            const fileId = await db.uploadBuffer(file.buffer, file.originalname, file.mimetype);
            newFiles.push({ id: fileId.toString(), filename: file.originalname, uploaded_at: new Date() });
        }
        await db.getDb().collection('tickets').updateOne(
            { _id: db.toId(req.params.id) },
            { $push: { deliverable_files: { $each: newFiles } }, $set: { updated_at: new Date() } }
        );
        await logAdminAction(req, 'ticket.deliverable_upload', `${req.params.id}: ${newFiles.map(f => f.filename).join(', ')}`);
    }
    res.redirect('/admin/tickets');
});

router.get('/admin/tickets/:id/attachment/:fileId', async (req, res) => {
    if (!db.isDbConfigured()) {
        res.status(404).send('Not available.');
        return;
    }
    try {
        const ticket = await db.getDb().collection('tickets').findOne({ _id: db.toId(req.params.id) });
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

router.post('/admin/tickets/:id/deliverable/:fileId/remove', async (req, res) => {
    if (db.isDbConfigured()) {
        await db.getDb().collection('tickets').updateOne(
            { _id: db.toId(req.params.id) },
            { $pull: { deliverable_files: { id: req.params.fileId } } }
        );
        await db.deleteFile(req.params.fileId);
        await logAdminAction(req, 'ticket.deliverable_remove', req.params.id);
    }
    res.redirect('/admin/tickets');
});

router.get('/admin/tickets/:id/invoice', async (req, res) => {
    if (!db.isDbConfigured()) {
        res.status(404).send('Not available.');
        return;
    }
    try {
        const ticket = await db.getDb().collection('tickets').findOne({ _id: db.toId(req.params.id) });
        if (!ticket || !ticket.price_paise) {
            res.status(404).send('Invoice not available for this ticket yet.');
            return;
        }
        const user = await db.getDb().collection('users').findOne({ _id: ticket.user_id });

        invoices.streamInvoice(res, {
            order: {
                id: ticket._id.toString(),
                created_at: ticket.created_at,
                razorpay_payment_id: 'Custom ticket (offline/manual billing)',
                amount_paise: ticket.price_paise,
                currency: ticket.currency,
            },
            items: [{ title: ticket.title, quantity: 1, amount_paise: ticket.price_paise }],
            customerName: user ? user.name : '',
            customerEmail: user ? user.email : '',
            site,
        });
    } catch (error) {
        res.status(500).send('Unable to generate invoice.');
    }
});

router.get('/admin/site-info', async (req, res) => {
    const currentSite = await siteInfo.getMergedSite();
    res.render('admin-site-info', { site: currentSite, error: '', message: '' });
});

router.post('/admin/site-info', async (req, res) => {
    if (db.isDbConfigured()) {
        await siteInfo.saveSiteInfo(req.body);
        await logAdminAction(req, 'site_info.update', 'Updated site info');
    }
    const currentSite = await siteInfo.getMergedSite();
    res.render('admin-site-info', { site: currentSite, error: '', message: 'Site info updated.' });
});

router.get('/admin/legal', async (req, res) => {
    const terms = await legal.getTermsContent();
    const privacy = await legal.getPrivacyContent();
    res.render('admin-legal', { terms, privacy, activeDoc: 'terms', error: '', message: '' });
});

router.post('/admin/legal', async (req, res) => {
    if (db.isDbConfigured() && typeof req.body.terms === 'string' && req.body.terms.trim() !== '') {
        await legal.saveTermsContent(req.body.terms);
        await logAdminAction(req, 'terms.update', 'Updated Terms & Conditions');
    }
    const terms = await legal.getTermsContent();
    const privacy = await legal.getPrivacyContent();
    res.render('admin-legal', { terms, privacy, activeDoc: 'terms', error: '', message: 'Terms & Conditions updated.' });
});

router.post('/admin/legal/privacy', async (req, res) => {
    if (db.isDbConfigured() && typeof req.body.privacy === 'string' && req.body.privacy.trim() !== '') {
        await legal.savePrivacyContent(req.body.privacy);
        await logAdminAction(req, 'privacy.update', 'Updated Privacy Policy');
    }
    const terms = await legal.getTermsContent();
    const privacy = await legal.getPrivacyContent();
    res.render('admin-legal', { terms, privacy, activeDoc: 'privacy', error: '', message: 'Privacy Policy updated.' });
});

router.get('/admin/audit-log', async (req, res) => {
    const entries = await auditLog.recent(200);
    res.render('admin-audit-log', { site, entries });
});

router.get('/admin/coupons', async (req, res) => {
    const list = await coupons.listCoupons();
    res.render('admin-coupons', { site, coupons: list, error: '', message: '' });
});

router.post('/admin/coupons', async (req, res) => {
    if (db.isDbConfigured() && req.body.code) {
        await coupons.createCoupon(req.body);
        await logAdminAction(req, 'coupon.create', req.body.code);
    }
    res.redirect('/admin/coupons');
});

router.post('/admin/coupons/:id/update', async (req, res) => {
    if (db.isDbConfigured()) {
        await coupons.updateCoupon(req.params.id, req.body);
        await logAdminAction(req, 'coupon.update', req.body.code);
    }
    res.redirect('/admin/coupons');
});

router.post('/admin/coupons/:id/delete', async (req, res) => {
    if (db.isDbConfigured()) {
        await coupons.deleteCoupon(req.params.id);
        await logAdminAction(req, 'coupon.delete', req.params.id);
    }
    res.redirect('/admin/coupons');
});

router.get('/admin/orders/:id/invoice', async (req, res) => {
    if (!db.isDbConfigured()) {
        res.status(404).send('Not available.');
        return;
    }
    try {
        const order = await db.getDb().collection('orders').findOne({ _id: db.toId(req.params.id) });
        if (!order || order.status !== 'paid') {
            res.status(404).send('Invoice not available for this order.');
            return;
        }
        const user = await db.getDb().collection('users').findOne({ _id: order.user_id });
        let items = order.items;
        if (!items && order.product_id) {
            const product = await db.getDb().collection('products').findOne({ _id: order.product_id });
            items = [{ title: product ? product.title : 'Product', quantity: order.quantity || 1, amount_paise: order.amount_paise }];
        }
        invoices.streamInvoice(res, {
            order: db.withId(order),
            items: items || [],
            customerName: user ? user.name : '',
            customerEmail: user ? user.email : '',
            site,
        });
    } catch (error) {
        res.status(500).send('Unable to generate invoice.');
    }
});

module.exports = router;
