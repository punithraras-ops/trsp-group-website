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
    'analytics_id',
    'home_hero_kicker',
    'home_hero_title',
    'home_hero_description',
    'home_services_kicker',
    'home_services_heading',
    'home_services_description',
    'home_about_kicker',
    'home_about_heading',
    'home_research_kicker',
    'home_research_heading',
    'home_research_description',
    'home_testimonials_kicker',
    'home_testimonials_heading',
    'home_testimonials_description',
    'services_hero_kicker',
    'services_hero_title',
    'services_hero_description',
    'services_offer_kicker',
    'services_offer_heading',
    'services_offer_description',
    'services_process_kicker',
    'services_process_heading',
    'services_process_description',
    'about_heading',
    'about_paragraph2',
    'contact_heading',
    'contact_subheading',
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
