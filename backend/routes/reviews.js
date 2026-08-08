const express = require('express');
const db = require('../db');
const { requireAuthApi } = require('../lib/auth');
const reviews = require('../lib/reviews');
const { reviewLimiter } = require('../lib/rateLimiters');

const router = express.Router();

router.get('/api/products/:id/reviews', async (req, res) => {
    if (!db.isDbConfigured()) {
        res.json({ reviews: [], canReview: false });
        return;
    }
    try {
        const list = await reviews.getReviewsForProduct(req.params.id);
        const canReview = req.user ? await reviews.canReview(req.user.id, req.params.id) : false;
        res.json({ reviews: list, canReview });
    } catch (error) {
        res.status(500).json({ reviews: [], canReview: false });
    }
});

router.post('/api/products/:id/reviews', reviewLimiter, requireAuthApi, async (req, res) => {
    if (!db.isDbConfigured()) {
        res.status(503).json({ error: 'Reviews are not available yet.' });
        return;
    }

    const rating = parseInt(req.body.rating, 10);
    if (!rating || rating < 1 || rating > 5) {
        res.status(422).json({ error: 'Please choose a rating from 1 to 5.' });
        return;
    }

    try {
        const allowed = await reviews.canReview(req.user.id, req.params.id);
        if (!allowed) {
            res.status(403).json({ error: 'You can only review products you have purchased, and only once per product.' });
            return;
        }

        await reviews.createReview({
            productId: req.params.id,
            userId: req.user.id,
            userName: req.user.name,
            rating,
            comment: req.body.comment,
        });

        res.status(201).json({ message: 'Thanks for your review!' });
    } catch (error) {
        res.status(500).json({ error: 'Unable to save your review right now.' });
    }
});

module.exports = router;
