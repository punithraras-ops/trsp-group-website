const db = require('../db');

async function log(req, action, details) {
    if (!db.isDbConfigured()) {
        return;
    }
    try {
        await db.getDb().collection('admin_audit_log').insertOne({
            action,
            details: details || '',
            ip: req.ip || (req.headers && req.headers['x-forwarded-for']) || '',
            created_at: new Date(),
        });
    } catch (error) {
        // Never let audit logging break the actual admin action.
    }
}

async function recent(limit = 200) {
    if (!db.isDbConfigured()) {
        return [];
    }
    try {
        const docs = await db.getDb().collection('admin_audit_log')
            .find()
            .sort({ created_at: -1 })
            .limit(limit)
            .toArray();
        return docs.map(db.withId);
    } catch (error) {
        return [];
    }
}

module.exports = { log, recent };
