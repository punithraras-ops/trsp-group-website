const db = require('../db');

const CONFIG_ID = 'main';

const DELETABLE_ENTITIES = [
    { key: 'submissions', label: 'Contact Submissions' },
    { key: 'reviews', label: 'Product Reviews' },
    { key: 'products', label: 'Products' },
    { key: 'features', label: 'Upcoming Features' },
    { key: 'testimonials', label: 'Testimonials' },
    { key: 'research_verticals', label: 'Research Verticals' },
    { key: 'services', label: 'Services' },
    { key: 'coupons', label: 'Coupons' },
    { key: 'tickets', label: 'Tickets' },
];

async function getDeletePermissions() {
    const permissions = {};
    for (const entity of DELETABLE_ENTITIES) {
        permissions[entity.key] = true;
    }
    if (!db.isDbConfigured()) {
        return permissions;
    }
    const doc = await db.getDb().collection('delete_permissions').findOne({ _id: CONFIG_ID });
    if (doc) {
        for (const entity of DELETABLE_ENTITIES) {
            if (doc[entity.key] === false) {
                permissions[entity.key] = false;
            }
        }
    }
    return permissions;
}

async function isDeleteEnabled(key) {
    const permissions = await getDeletePermissions();
    return permissions[key] !== false;
}

async function setDeletePermissions(fields) {
    const update = {};
    for (const entity of DELETABLE_ENTITIES) {
        update[entity.key] = fields[entity.key] === '1';
    }
    await db.getDb().collection('delete_permissions').updateOne(
        { _id: CONFIG_ID },
        { $set: { ...update, updated_at: new Date() } },
        { upsert: true }
    );
}

function requireDeleteEnabled(key, redirectPath) {
    return async (req, res, next) => {
        if (!db.isDbConfigured() || (await isDeleteEnabled(key))) {
            next();
            return;
        }
        // Deletion is turned off for this entity type - the UI already hides/disables
        // the button, this is the server-side backstop against a direct POST.
        res.redirect(redirectPath || '/admin');
    };
}

module.exports = {
    DELETABLE_ENTITIES,
    getDeletePermissions,
    isDeleteEnabled,
    setDeletePermissions,
    requireDeleteEnabled,
};
