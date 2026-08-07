const express = require('express');
const multer = require('multer');
const db = require('../db');
const site = require('../config/site');
const { requireAdmin, createAdminSession, destroyAdminSession } = require('../lib/auth');
const adminSecurity = require('../lib/adminSecurity');
const design = require('../lib/design');
const siteInfo = require('../lib/siteInfo');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

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

router.get('/admin/login', (req, res) => {
    res.render('admin-login', { site, redirect: safeAdminRedirect(req.query.redirect), error: '' });
});

router.post('/admin/login', async (req, res) => {
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

router.post('/admin/verify-2fa', async (req, res) => {
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

router.post('/admin/forgot-password', async (req, res) => {
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

    if (db.isDbConfigured()) {
        try {
            const database = db.getDb();
            const [submissionDocs, userDocs, orderDocs, productDocs, featureDocs, serviceDocs] = await Promise.all([
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
            ]);

            submissions = submissionDocs.map(db.withId);
            users = userDocs.map(db.withId);
            orders = orderDocs.map(db.withId);
            products = productDocs.map(db.withId);
            features = featureDocs.map(db.withId);
            services = serviceDocs.map(db.withId).map(s => ({ ...s, featuresText: featuresToText(s.features) }));
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
    });
});

router.post('/admin/products', upload.array('images', 10), async (req, res) => {
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
            price_paise: pricePaise,
            currency: 'INR',
            images,
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
                    is_active: req.body.is_active === '1',
                },
            }
        );
    }
    res.redirect('/admin#tab-products');
});

router.post('/admin/products/:id/images', upload.array('files', 10), async (req, res) => {
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
    res.redirect('/admin#tab-products');
});

router.post('/admin/products/:id/images/remove', async (req, res) => {
    if (db.isDbConfigured() && req.body.fileId) {
        await db.getDb().collection('products').updateOne(
            { _id: db.toId(req.params.id) },
            { $pull: { images: req.body.fileId } }
        );
        await db.deleteFile(req.body.fileId);
    }
    res.redirect('/admin#tab-products');
});

router.post('/admin/products/:id/delete', async (req, res) => {
    if (db.isDbConfigured()) {
        const product = await db.getDb().collection('products').findOne({ _id: db.toId(req.params.id) });
        await db.getDb().collection('products').deleteOne({ _id: db.toId(req.params.id) });
        for (const fileId of (product && product.images) || []) {
            await db.deleteFile(fileId);
        }
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
    }
    res.redirect('/admin#tab-services');
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
    }
    res.redirect('/admin#tab-services');
});

router.post('/admin/services/:id/delete', async (req, res) => {
    if (db.isDbConfigured()) {
        await db.getDb().collection('services').deleteOne({ _id: db.toId(req.params.id) });
    }
    res.redirect('/admin#tab-services');
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
    }
    const settings = await design.getDesignSettings();
    res.render('admin-design', { site, colors: settings.colors, images: settings.images, error: '', message: 'Colors updated.' });
});

router.post('/admin/design/upload/:slot', upload.single('file'), async (req, res) => {
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
    }
    const settings = await design.getDesignSettings();
    res.render('admin-design', { site, colors: settings.colors, images: settings.images, error: '', message: 'Image removed.' });
});

router.post('/admin/orders/:id/delivery-status', async (req, res) => {
    const allowed = ['processing', 'shipped', 'delivered', 'cancelled'];
    if (db.isDbConfigured() && allowed.includes(req.body.delivery_status)) {
        await db.getDb().collection('orders').updateOne(
            { _id: db.toId(req.params.id) },
            { $set: { delivery_status: req.body.delivery_status, updated_at: new Date() } }
        );
    }
    res.redirect('/admin#tab-orders');
});

router.get('/admin/site-info', async (req, res) => {
    const currentSite = await siteInfo.getMergedSite();
    res.render('admin-site-info', { site: currentSite, error: '', message: '' });
});

router.post('/admin/site-info', async (req, res) => {
    if (db.isDbConfigured()) {
        await siteInfo.saveSiteInfo(req.body);
    }
    const currentSite = await siteInfo.getMergedSite();
    res.render('admin-site-info', { site: currentSite, error: '', message: 'Site info updated.' });
});

module.exports = router;
