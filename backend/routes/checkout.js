const express = require('express');
const QRCode = require('qrcode');
const db = require('../db');
const razorpay = require('../lib/razorpay');
const { requireAuthApi } = require('../lib/auth');
const mailer = require('../lib/mailer');
const coupons = require('../lib/coupons');
const { markOrderPaid } = require('../lib/orders');
const { checkoutLimiter } = require('../lib/rateLimiters');
const { MANUAL_UPI_ID, buildUpiUri } = require('../lib/manualUpi');

const router = express.Router();
router.use('/api/checkout', checkoutLimiter);

router.post('/api/checkout/request-approval', requireAuthApi, async (req, res) => {
    if (!db.isDbConfigured()) {
        res.status(503).json({ error: 'The store is not enabled yet.' });
        return;
    }

    if (!req.body.productId) {
        res.status(422).json({ error: 'A product is required.' });
        return;
    }

    try {
        const product = await db.getDb().collection('products').findOne({
            _id: db.toId(req.body.productId),
            is_active: true,
        });

        if (!product || !product.requires_approval) {
            res.redirect(`/checkout?product=${req.body.productId}`);
            return;
        }

        const existing = await db.getDb().collection('orders').findOne({
            user_id: db.toId(req.user.id),
            product_id: product._id,
            status: { $in: ['pending_approval', 'approved_awaiting_payment'] },
        });

        if (!existing) {
            await db.getDb().collection('orders').insertOne({
                user_id: db.toId(req.user.id),
                product_id: product._id,
                quantity: 1,
                amount_paise: product.price_paise,
                currency: product.currency,
                // Auto-approve products skip the manual admin review step and
                // go straight to "ready to pay" the moment the request is made.
                status: product.auto_approve ? 'approved_awaiting_payment' : 'pending_approval',
                delivery_status: 'processing',
                razorpay_order_id: null,
                razorpay_payment_id: null,
                razorpay_signature: null,
                created_at: new Date(),
                updated_at: new Date(),
            });
        }

        res.redirect(`/checkout?product=${req.body.productId}`);
    } catch (error) {
        console.error('request-approval failed:', error.message);
        res.redirect(`/checkout?product=${req.body.productId}`);
    }
});

// Fetches active products for a set of cart line items and computes the
// server-verified subtotal - client-supplied prices are never trusted.
async function resolveCartItems(rawItems) {
    const ids = rawItems
        .filter(item => item && item.productId)
        .map(item => ({ id: item.productId, quantity: Math.max(1, Math.min(20, parseInt(item.quantity, 10) || 1)) }));

    if (ids.length === 0) {
        return { error: 'Your cart is empty.' };
    }

    const products = await db.getDb().collection('products')
        .find({ _id: { $in: ids.map(i => db.toId(i.id)) }, is_active: true })
        .toArray();

    const byId = new Map(products.map(p => [p._id.toString(), p]));
    const items = [];
    let subtotalPaise = 0;

    for (const { id, quantity } of ids) {
        const product = byId.get(id);
        if (!product) {
            return { error: 'One of the items in your cart is no longer available.' };
        }
        if (product.requires_approval) {
            return { error: `"${product.title}" requires approval and can't be bought via the cart. Please purchase it separately from its product page.` };
        }
        const lineTotal = product.price_paise * quantity;
        subtotalPaise += lineTotal;
        items.push({ product_id: product._id, title: product.title, quantity, amount_paise: lineTotal, unit_price_paise: product.price_paise });
    }

    return { items, subtotalPaise };
}

router.post('/api/checkout/apply-coupon', requireAuthApi, async (req, res) => {
    if (!db.isDbConfigured()) {
        res.status(503).json({ error: 'The store is not enabled yet.' });
        return;
    }

    try {
        let subtotalPaise;

        if (Array.isArray(req.body.items)) {
            const resolved = await resolveCartItems(req.body.items);
            if (resolved.error) {
                res.status(422).json({ error: resolved.error });
                return;
            }
            subtotalPaise = resolved.subtotalPaise;
        } else if (req.body.productId) {
            const product = await db.getDb().collection('products').findOne({ _id: db.toId(req.body.productId), is_active: true });
            if (!product || product.requires_approval) {
                res.status(422).json({ error: 'Coupon not applicable to this item.' });
                return;
            }
            subtotalPaise = product.price_paise;
        } else {
            res.status(422).json({ error: 'Nothing to apply the coupon to.' });
            return;
        }

        const result = await coupons.validateCoupon(req.body.code, subtotalPaise);
        if (!result.valid) {
            res.status(422).json({ error: result.error });
            return;
        }

        res.json({
            valid: true,
            discountPaise: result.discountPaise,
            finalAmountPaise: subtotalPaise - result.discountPaise,
        });
    } catch (error) {
        console.error('apply-coupon failed:', error.message);
        res.status(500).json({ error: 'Unable to apply coupon right now.' });
    }
});

router.post('/api/checkout/create-order', requireAuthApi, async (req, res) => {
    if (!db.isDbConfigured() || !razorpay.isConfigured()) {
        res.status(503).json({ error: 'Payments are not enabled yet.' });
        return;
    }

    if (!req.body.productId) {
        res.status(422).json({ error: 'A product is required.' });
        return;
    }

    try {
        const product = await db.getDb().collection('products').findOne({
            _id: db.toId(req.body.productId),
            is_active: true,
        });

        if (!product) {
            res.status(404).json({ error: 'Product not found.' });
            return;
        }

        let localOrderId;
        let couponCode = null;
        let discountPaise = 0;
        let finalAmountPaise = product.price_paise;

        if (product.requires_approval) {
            const approved = await db.getDb().collection('orders').findOne({
                user_id: db.toId(req.user.id),
                product_id: product._id,
                status: 'approved_awaiting_payment',
            });

            if (!approved) {
                res.status(403).json({ error: 'This purchase has not been approved yet.' });
                return;
            }

            localOrderId = approved._id.toString();
            finalAmountPaise = approved.amount_paise;
        } else {
            if (req.body.couponCode) {
                const result = await coupons.validateCoupon(req.body.couponCode, product.price_paise);
                if (result.valid) {
                    couponCode = result.coupon.code;
                    discountPaise = result.discountPaise;
                    finalAmountPaise = Math.max(0, product.price_paise - discountPaise);
                }
            }

            const orderResult = await db.getDb().collection('orders').insertOne({
                user_id: db.toId(req.user.id),
                product_id: product._id,
                quantity: 1,
                amount_paise: finalAmountPaise,
                subtotal_paise: product.price_paise,
                discount_paise: discountPaise,
                coupon_code: couponCode,
                currency: product.currency,
                status: 'created',
                delivery_status: 'processing',
                razorpay_order_id: null,
                razorpay_payment_id: null,
                razorpay_signature: null,
                created_at: new Date(),
                updated_at: new Date(),
            });
            localOrderId = orderResult.insertedId.toString();
        }

        const razorpayOrder = await razorpay.createOrder({
            amountPaise: finalAmountPaise,
            currency: product.currency,
            receipt: `order_${localOrderId}`,
        });

        await db.getDb().collection('orders').updateOne(
            { _id: db.toId(localOrderId) },
            { $set: { razorpay_order_id: razorpayOrder.id, updated_at: new Date() } }
        );

        res.json({
            razorpayOrderId: razorpayOrder.id,
            amount: finalAmountPaise,
            currency: product.currency,
            key: process.env.RAZORPAY_KEY_ID,
            companyName: res.locals.site.company_name,
            productTitle: product.title,
        });
    } catch (error) {
        console.error('create-order failed:', error.message);
        res.status(500).json({ error: 'Unable to start checkout. Please try again.' });
    }
});

router.post('/api/checkout/create-cart-order', requireAuthApi, async (req, res) => {
    if (!db.isDbConfigured() || !razorpay.isConfigured()) {
        res.status(503).json({ error: 'Payments are not enabled yet.' });
        return;
    }

    try {
        const resolved = await resolveCartItems(req.body.items);
        if (resolved.error) {
            res.status(422).json({ error: resolved.error });
            return;
        }

        let couponCode = null;
        let discountPaise = 0;
        let finalAmountPaise = resolved.subtotalPaise;

        if (req.body.couponCode) {
            const result = await coupons.validateCoupon(req.body.couponCode, resolved.subtotalPaise);
            if (result.valid) {
                couponCode = result.coupon.code;
                discountPaise = result.discountPaise;
                finalAmountPaise = Math.max(0, resolved.subtotalPaise - discountPaise);
            }
        }

        const orderResult = await db.getDb().collection('orders').insertOne({
            user_id: db.toId(req.user.id),
            items: resolved.items,
            amount_paise: finalAmountPaise,
            subtotal_paise: resolved.subtotalPaise,
            discount_paise: discountPaise,
            coupon_code: couponCode,
            currency: 'INR',
            status: 'created',
            delivery_status: 'processing',
            razorpay_order_id: null,
            razorpay_payment_id: null,
            razorpay_signature: null,
            created_at: new Date(),
            updated_at: new Date(),
        });
        const localOrderId = orderResult.insertedId.toString();

        const razorpayOrder = await razorpay.createOrder({
            amountPaise: finalAmountPaise,
            currency: 'INR',
            receipt: `order_${localOrderId}`,
        });

        await db.getDb().collection('orders').updateOne(
            { _id: orderResult.insertedId },
            { $set: { razorpay_order_id: razorpayOrder.id, updated_at: new Date() } }
        );

        res.json({
            razorpayOrderId: razorpayOrder.id,
            amount: finalAmountPaise,
            currency: 'INR',
            key: process.env.RAZORPAY_KEY_ID,
            companyName: res.locals.site.company_name,
            productTitle: resolved.items.length === 1 ? resolved.items[0].title : `${resolved.items.length} items`,
        });
    } catch (error) {
        console.error('create-cart-order failed:', error.message);
        res.status(500).json({ error: 'Unable to start checkout. Please try again.' });
    }
});

router.post('/api/checkout/verify', requireAuthApi, async (req, res) => {
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

    try {
        const orders = db.getDb().collection('orders');
        const filter = { razorpay_order_id: orderId, user_id: db.toId(req.user.id) };

        if (!valid) {
            await orders.updateOne(filter, { $set: { status: 'failed', updated_at: new Date() } });
            res.status(400).json({ error: 'Payment verification failed.' });
            return;
        }

        const order = await orders.findOneAndUpdate(filter, {
            $set: {
                status: 'paid',
                razorpay_payment_id: paymentId,
                razorpay_signature: signature,
                updated_at: new Date(),
            },
        }, { returnDocument: 'after' });

        if (order) {
            await markOrderPaid(order, { email: req.user.email, name: req.user.name, site: res.locals.site });
        }

        res.json({ message: 'Payment verified.' });
    } catch (error) {
        console.error('verify failed:', error.message);
        res.status(500).json({ error: 'Unable to verify payment right now.' });
    }
});

router.post('/api/checkout/create-manual-upi-order', requireAuthApi, async (req, res) => {
    if (!db.isDbConfigured()) {
        res.status(503).json({ error: 'The store is not enabled yet.' });
        return;
    }

    try {
        let finalAmountPaise;
        let currency;
        let localOrderId;
        let title;

        if (Array.isArray(req.body.items)) {
            const resolved = await resolveCartItems(req.body.items);
            if (resolved.error) {
                res.status(422).json({ error: resolved.error });
                return;
            }

            let couponCode = null;
            let discountPaise = 0;
            finalAmountPaise = resolved.subtotalPaise;
            if (req.body.couponCode) {
                const result = await coupons.validateCoupon(req.body.couponCode, resolved.subtotalPaise);
                if (result.valid) {
                    couponCode = result.coupon.code;
                    discountPaise = result.discountPaise;
                    finalAmountPaise = Math.max(0, resolved.subtotalPaise - discountPaise);
                }
            }

            const orderResult = await db.getDb().collection('orders').insertOne({
                user_id: db.toId(req.user.id),
                items: resolved.items,
                amount_paise: finalAmountPaise,
                subtotal_paise: resolved.subtotalPaise,
                discount_paise: discountPaise,
                coupon_code: couponCode,
                currency: 'INR',
                status: 'awaiting_upi_confirmation',
                payment_method: 'manual_upi',
                utr_reference: null,
                delivery_status: 'processing',
                razorpay_order_id: null,
                razorpay_payment_id: null,
                razorpay_signature: null,
                created_at: new Date(),
                updated_at: new Date(),
            });
            localOrderId = orderResult.insertedId.toString();
            currency = 'INR';
            title = resolved.items.length === 1 ? resolved.items[0].title : `${resolved.items.length} items`;
        } else if (req.body.productId) {
            const product = await db.getDb().collection('products').findOne({
                _id: db.toId(req.body.productId),
                is_active: true,
            });

            if (!product) {
                res.status(404).json({ error: 'Product not found.' });
                return;
            }
            if (product.requires_approval) {
                res.status(422).json({ error: 'This product requires approval before purchase.' });
                return;
            }

            let couponCode = null;
            let discountPaise = 0;
            finalAmountPaise = product.price_paise;
            if (req.body.couponCode) {
                const result = await coupons.validateCoupon(req.body.couponCode, product.price_paise);
                if (result.valid) {
                    couponCode = result.coupon.code;
                    discountPaise = result.discountPaise;
                    finalAmountPaise = Math.max(0, product.price_paise - discountPaise);
                }
            }

            const orderResult = await db.getDb().collection('orders').insertOne({
                user_id: db.toId(req.user.id),
                product_id: product._id,
                quantity: 1,
                amount_paise: finalAmountPaise,
                subtotal_paise: product.price_paise,
                discount_paise: discountPaise,
                coupon_code: couponCode,
                currency: product.currency,
                status: 'awaiting_upi_confirmation',
                payment_method: 'manual_upi',
                utr_reference: null,
                delivery_status: 'processing',
                razorpay_order_id: null,
                razorpay_payment_id: null,
                razorpay_signature: null,
                created_at: new Date(),
                updated_at: new Date(),
            });
            localOrderId = orderResult.insertedId.toString();
            currency = product.currency;
            title = product.title;
        } else {
            res.status(422).json({ error: 'Nothing to check out.' });
            return;
        }

        const upiUri = buildUpiUri({ amountPaise: finalAmountPaise, referenceId: localOrderId, companyName: res.locals.site.company_name });
        const qrDataUrl = await QRCode.toDataURL(upiUri);

        res.json({
            orderId: localOrderId,
            amount: finalAmountPaise,
            currency,
            productTitle: title,
            upiId: MANUAL_UPI_ID,
            upiUri,
            qrDataUrl,
        });
    } catch (error) {
        console.error('create-manual-upi-order failed:', error.message);
        res.status(500).json({ error: 'Unable to start UPI checkout. Please try again.' });
    }
});

router.post('/api/checkout/manual-upi/:orderId/submit-utr', requireAuthApi, async (req, res) => {
    if (!db.isDbConfigured()) {
        res.status(503).json({ error: 'The store is not enabled yet.' });
        return;
    }

    const utr = String(req.body.utr || '').trim();
    if (!utr || utr.length < 4 || utr.length > 40) {
        res.status(422).json({ error: 'Enter a valid UPI transaction / UTR reference number.' });
        return;
    }

    try {
        const order = await db.getDb().collection('orders').findOneAndUpdate(
            { _id: db.toId(req.params.orderId), user_id: db.toId(req.user.id), status: 'awaiting_upi_confirmation' },
            { $set: { utr_reference: utr, updated_at: new Date() } },
            { returnDocument: 'after' }
        );

        if (!order) {
            res.status(404).json({ error: 'Order not found or already processed.' });
            return;
        }

        mailer.sendUtrReceivedEmail({
            to: req.user.email,
            name: req.user.name,
            orderId: order._id.toString(),
            utr,
            amountPaise: order.amount_paise,
            currency: order.currency,
            site: res.locals.site,
        }).catch(() => {});

        mailer.sendUpiUtrAlert({
            orderId: order._id.toString(),
            utr,
            amountPaise: order.amount_paise,
            currency: order.currency,
            customerName: req.user.name,
            customerEmail: req.user.email,
            site: res.locals.site,
        }).catch(() => {});

        res.json({ message: "Reference submitted. We'll confirm your payment shortly." });
    } catch (error) {
        console.error('submit-utr failed:', error.message);
        res.status(500).json({ error: 'Unable to submit reference right now.' });
    }
});

router.post('/api/checkout/retry/:orderId', requireAuthApi, async (req, res) => {
    if (!db.isDbConfigured() || !razorpay.isConfigured()) {
        res.status(503).json({ error: 'Payments are not enabled yet.' });
        return;
    }

    try {
        const order = await db.getDb().collection('orders').findOne({
            _id: db.toId(req.params.orderId),
            user_id: db.toId(req.user.id),
            status: { $in: ['created', 'failed'] },
        });

        if (!order) {
            res.status(404).json({ error: 'This order can no longer be retried.' });
            return;
        }

        // The original Razorpay order was abandoned/failed - start a fresh one
        // with the same amount rather than trying to resume a stale one.
        // Razorpay caps the receipt field at 40 characters.
        const razorpayOrder = await razorpay.createOrder({
            amountPaise: order.amount_paise,
            currency: order.currency,
            receipt: `retry_${order._id.toString()}_${Date.now().toString().slice(-6)}`,
        });

        await db.getDb().collection('orders').updateOne(
            { _id: order._id },
            { $set: { razorpay_order_id: razorpayOrder.id, status: 'created', updated_at: new Date() } }
        );

        let title;
        if (order.items && order.items.length > 0) {
            title = order.items.length === 1 ? order.items[0].title : `${order.items.length} items`;
        } else {
            const product = await db.getDb().collection('products').findOne({ _id: order.product_id });
            title = product ? product.title : 'Order';
        }

        res.json({
            razorpayOrderId: razorpayOrder.id,
            amount: order.amount_paise,
            currency: order.currency,
            key: process.env.RAZORPAY_KEY_ID,
            companyName: res.locals.site.company_name,
            productTitle: title,
        });
    } catch (error) {
        console.error('retry payment failed:', error.message);
        res.status(500).json({ error: 'Unable to retry payment right now.' });
    }
});

module.exports = router;
