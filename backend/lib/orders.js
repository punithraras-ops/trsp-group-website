const db = require('../db');
const mailer = require('./mailer');
const coupons = require('./coupons');

async function markOrderPaid(order, { email, name, site }) {
    if (order.coupon_code) {
        coupons.incrementUsageByCode(order.coupon_code).catch(() => {});
    }

    let items = order.items;
    if (!items && order.product_id) {
        const product = await db.getDb().collection('products').findOne({ _id: order.product_id });
        items = [{ title: product ? product.title : 'Product', quantity: order.quantity || 1, amount_paise: order.amount_paise }];
    }

    mailer.sendOrderConfirmation({
        to: email,
        name,
        items: items || [],
        totalPaise: order.amount_paise,
        currency: order.currency,
        orderId: order._id.toString(),
        site,
    }).catch(() => {});
}

module.exports = { markOrderPaid };
