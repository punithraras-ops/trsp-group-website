const db = require('../db');

function normalizeCode(code) {
    return String(code || '').trim().toUpperCase();
}

async function listCoupons() {
    if (!db.isDbConfigured()) {
        return [];
    }
    const docs = await db.getDb().collection('coupons').find().sort({ created_at: -1 }).toArray();
    return docs.map(db.withId);
}

async function createCoupon(fields) {
    const discountType = fields.discount_type === 'flat' ? 'flat' : 'percent';
    const value = discountType === 'percent'
        ? Math.min(100, Math.max(1, parseInt(fields.value, 10) || 0))
        : Math.max(0, Math.round(parseFloat(fields.value || '0') * 100));

    await db.getDb().collection('coupons').insertOne({
        code: normalizeCode(fields.code),
        discount_type: discountType,
        value,
        active: true,
        expires_at: fields.expires_at ? new Date(fields.expires_at) : null,
        usage_limit: fields.usage_limit ? parseInt(fields.usage_limit, 10) : null,
        used_count: 0,
        created_at: new Date(),
    });
}

async function updateCoupon(id, fields) {
    const discountType = fields.discount_type === 'flat' ? 'flat' : 'percent';
    const value = discountType === 'percent'
        ? Math.min(100, Math.max(1, parseInt(fields.value, 10) || 0))
        : Math.max(0, Math.round(parseFloat(fields.value || '0') * 100));

    await db.getDb().collection('coupons').updateOne(
        { _id: db.toId(id) },
        {
            $set: {
                code: normalizeCode(fields.code),
                discount_type: discountType,
                value,
                active: fields.active === '1',
                expires_at: fields.expires_at ? new Date(fields.expires_at) : null,
                usage_limit: fields.usage_limit ? parseInt(fields.usage_limit, 10) : null,
            },
        }
    );
}

async function deleteCoupon(id) {
    await db.getDb().collection('coupons').deleteOne({ _id: db.toId(id) });
}

async function validateCoupon(code, amountPaise) {
    if (!db.isDbConfigured() || !code) {
        return { valid: false, error: 'No coupon code provided.' };
    }

    const coupon = await db.getDb().collection('coupons').findOne({ code: normalizeCode(code) });
    if (!coupon || !coupon.active) {
        return { valid: false, error: 'Invalid or inactive coupon code.' };
    }
    if (coupon.expires_at && coupon.expires_at < new Date()) {
        return { valid: false, error: 'This coupon has expired.' };
    }
    if (coupon.usage_limit && coupon.used_count >= coupon.usage_limit) {
        return { valid: false, error: 'This coupon has reached its usage limit.' };
    }

    const discountPaise = coupon.discount_type === 'percent'
        ? Math.round(amountPaise * (coupon.value / 100))
        : Math.min(coupon.value, amountPaise);

    return { valid: true, coupon: db.withId(coupon), discountPaise };
}

async function incrementUsageByCode(code) {
    await db.getDb().collection('coupons').updateOne(
        { code: normalizeCode(code) },
        { $inc: { used_count: 1 } }
    );
}

module.exports = { listCoupons, createCoupon, updateCoupon, deleteCoupon, validateCoupon, incrementUsageByCode };
