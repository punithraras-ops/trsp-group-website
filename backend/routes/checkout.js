const express = require('express');
const db = require('../db');
const site = require('../config/site');
const razorpay = require('../lib/razorpay');
const { requireAuthApi } = require('../lib/auth');

const router = express.Router();

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

        const orderResult = await db.getDb().collection('orders').insertOne({
            user_id: db.toId(req.user.id),
            product_id: product._id,
            quantity: 1,
            amount_paise: product.price_paise,
            currency: product.currency,
            status: 'created',
            razorpay_order_id: null,
            razorpay_payment_id: null,
            razorpay_signature: null,
            created_at: new Date(),
            updated_at: new Date(),
        });
        const localOrderId = orderResult.insertedId.toString();

        const razorpayOrder = await razorpay.createOrder({
            amountPaise: product.price_paise,
            currency: product.currency,
            receipt: `order_${localOrderId}`,
        });

        await db.getDb().collection('orders').updateOne(
            { _id: orderResult.insertedId },
            { $set: { razorpay_order_id: razorpayOrder.id, updated_at: new Date() } }
        );

        res.json({
            razorpayOrderId: razorpayOrder.id,
            amount: product.price_paise,
            currency: product.currency,
            key: process.env.RAZORPAY_KEY_ID,
            companyName: site.company_name,
            productTitle: product.title,
        });
    } catch (error) {
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

        await orders.updateOne(filter, {
            $set: {
                status: 'paid',
                razorpay_payment_id: paymentId,
                razorpay_signature: signature,
                updated_at: new Date(),
            },
        });

        res.json({ message: 'Payment verified.' });
    } catch (error) {
        res.status(500).json({ error: 'Unable to verify payment right now.' });
    }
});

module.exports = router;
