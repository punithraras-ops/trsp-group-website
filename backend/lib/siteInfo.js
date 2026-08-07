const db = require('../db');
const baseSite = require('../config/site');

const CONFIG_ID = 'main';

const EDITABLE_FIELDS = [
    'company_name',
    'legal_name',
    'short_name',
    'address',
    'location',
    'postal_code',
    'gst',
    'email',
    'phone_display',
    'phone_href',
    'whatsapp_href',
    'default_description',
];

async function getMergedSite() {
    if (!db.isDbConfigured()) {
        return baseSite;
    }

    try {
        const doc = await db.getDb().collection('site_info').findOne({ _id: CONFIG_ID });
        if (!doc) {
            return baseSite;
        }
        const overrides = {};
        for (const key of EDITABLE_FIELDS) {
            if (doc[key]) {
                overrides[key] = doc[key];
            }
        }
        return { ...baseSite, ...overrides };
    } catch (error) {
        return baseSite;
    }
}

async function saveSiteInfo(fields) {
    const update = {};
    for (const key of EDITABLE_FIELDS) {
        if (typeof fields[key] === 'string' && fields[key].trim() !== '') {
            update[key] = fields[key].trim();
        }
    }
    await db.getDb().collection('site_info').updateOne(
        { _id: CONFIG_ID },
        { $set: { ...update, updated_at: new Date() } },
        { upsert: true }
    );
}

module.exports = { getMergedSite, saveSiteInfo, EDITABLE_FIELDS };
