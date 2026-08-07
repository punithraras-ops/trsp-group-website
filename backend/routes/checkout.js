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

    const productId = parseInt(req.body.productId, 10);
    if (!productId) {
        res.status(422).json({ error: 'A product is required.' });
        return;
    }

    try {
        const productResult = await db.query('SELECT * FROM products WHERE id = $1 AND is_active = true', [productId]);
        const product = productResult.rows[0];
        if (!product) {
            res.status(404).json({ error: 'Product not found.' });
            return;
        }

        const orderResult = await db.query(
            `INSERT INTO orders (user_id, product_id, quantity, amount_paise, currency, status)
             VALUES ($1, $2, 1, $3, $4, 'created') RETURNING id`,
            [req.user.id, product.id, product.price_paise, product.currency]
        );
        const localOrderId = orderResult.rows[0].id;

        const razorpayOrder = await razorpay.createOrder({
            amountPaise: product.price_paise,
            currency: product.currency,
            receipt: `order_${localOrderId}`,
        });

        await db.query('UPDATE orders SET razorpay_order_id = $1, updated_at = now() WHERE id = $2', [razorpayOrder.id, localOrderId]);

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
        if (!valid) {
            await db.query(
                `UPDATE orders SET status = 'failed', updated_at = now() WHERE razorpay_order_id = $1 AND user_id = $2`,
                [orderId, req.user.id]
            );
            res.status(400).json({ error: 'Payment verification failed.' });
            return;
        }

        await db.query(
            `UPDATE orders SET status = 'paid', razorpay_payment_id = $1, razorpay_signature = $2, updated_at = now()
             WHERE razorpay_order_id = $3 AND user_id = $4`,
            [paymentId, signature, orderId, req.user.id]
        );

        res.json({ message: 'Payment verified.' });
    } catch (error) {
        res.status(500).json({ error: 'Unable to verify payment right now.' });
    }
});

module.exports = router;
