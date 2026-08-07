const crypto = require('node:crypto');

function isConfigured() {
    return Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}

function authHeader() {
    const token = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64');
    return `Basic ${token}`;
}

async function createOrder({ amountPaise, currency, receipt }) {
    const response = await fetch('https://api.razorpay.com/v1/orders', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: authHeader(),
        },
        body: JSON.stringify({
            amount: amountPaise,
            currency,
            receipt,
        }),
    });

    const data = await response.json();
    if (!response.ok) {
        throw new Error(data.error?.description || 'Unable to create Razorpay order.');
    }

    return data;
}

function verifySignature({ orderId, paymentId, signature }) {
    const expected = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(`${orderId}|${paymentId}`)
        .digest('hex');

    const expectedBuf = Buffer.from(expected);
    const providedBuf = Buffer.from(signature || '');

    if (expectedBuf.length !== providedBuf.length) {
        return false;
    }

    return crypto.timingSafeEqual(expectedBuf, providedBuf);
}

module.exports = { isConfigured, createOrder, verifySignature };
