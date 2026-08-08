const rateLimit = require('express-rate-limit');

function make(windowMinutes, max, message) {
    return rateLimit({
        windowMs: windowMinutes * 60 * 1000,
        max,
        standardHeaders: true,
        legacyHeaders: false,
        message: { error: message },
    });
}

// Auth endpoints: generous enough for real typos, tight enough to blunt brute force.
const authLimiter = make(15, 20, 'Too many attempts. Please try again in a few minutes.');

// Admin login guards the single shared admin account - a high-value target.
const adminLoginLimiter = make(15, 10, 'Too many login attempts. Please try again in a few minutes.');

// Contact form: block spam bots without blocking a genuine visitor retrying.
const contactLimiter = make(15, 8, 'Too many messages sent. Please try again later.');

// Checkout/payment endpoints: allow rapid legitimate retries (double-clicks, coupon checks).
const checkoutLimiter = make(15, 40, 'Too many requests. Please slow down and try again.');

// Review submissions.
const reviewLimiter = make(60, 10, 'Too many reviews submitted. Please try again later.');

module.exports = { authLimiter, adminLoginLimiter, contactLimiter, checkoutLimiter, reviewLimiter };
