const db = require('../db');

async function getSummaryForProducts(productIds) {
    if (!db.isDbConfigured() || productIds.length === 0) {
        return new Map();
    }
    const docs = await db.getDb().collection('reviews').aggregate([
        { $match: { product_id: { $in: productIds } } },
        { $group: { _id: '$product_id', avg: { $avg: '$rating' }, count: { $sum: 1 } } },
    ]).toArray();

    const map = new Map();
    for (const doc of docs) {
        map.set(doc._id.toString(), { avg: doc.avg, count: doc.count });
    }
    return map;
}

async function getReviewsForProduct(productId) {
    if (!db.isDbConfigured()) {
        return [];
    }
    const docs = await db.getDb().collection('reviews')
        .find({ product_id: db.toId(productId) })
        .sort({ created_at: -1 })
        .toArray();
    return docs.map(db.withId);
}

async function canReview(userId, productId) {
    if (!db.isDbConfigured()) {
        return false;
    }
    const order = await db.getDb().collection('orders').findOne({
        user_id: db.toId(userId),
        status: 'paid',
        $or: [
            { product_id: db.toId(productId) },
            { 'items.product_id': db.toId(productId) },
        ],
    });
    if (!order) {
        return false;
    }
    const existingReview = await db.getDb().collection('reviews').findOne({
        user_id: db.toId(userId),
        product_id: db.toId(productId),
    });
    return !existingReview;
}

async function createReview({ productId, userId, userName, rating, comment }) {
    await db.getDb().collection('reviews').insertOne({
        product_id: db.toId(productId),
        user_id: db.toId(userId),
        user_name: userName,
        rating: Math.min(5, Math.max(1, parseInt(rating, 10) || 5)),
        comment: String(comment || '').trim().slice(0, 1000),
        created_at: new Date(),
    });
}

async function listAllReviews() {
    if (!db.isDbConfigured()) {
        return [];
    }
    const docs = await db.getDb().collection('reviews').aggregate([
        { $sort: { created_at: -1 } },
        { $lookup: { from: 'products', localField: 'product_id', foreignField: '_id', as: 'product' } },
        { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
        { $addFields: { product_title: '$product.title' } },
    ]).toArray();
    return docs.map(db.withId);
}

async function deleteReview(id) {
    await db.getDb().collection('reviews').deleteOne({ _id: db.toId(id) });
}

module.exports = { getSummaryForProducts, getReviewsForProduct, canReview, createReview, listAllReviews, deleteReview };
