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
    'home_upcoming_kicker',
    'home_upcoming_heading',
    'home_upcoming_description',
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
    'home_hero_btn1_label',
    'home_hero_btn2_label',
    'home_about_paragraph2',
    'home_about_mission_title',
    'home_about_mission_text',
    'home_about_approach_title',
    'home_about_approach_text',
    'home_about_btn_label',
    'services_process_card1_title',
    'services_process_card1_text',
    'services_process_card2_title',
    'services_process_card2_text',
    'services_process_card3_title',
    'services_process_card3_text',
    'about_mission_title',
    'about_mission_text',
    'about_vision_title',
    'about_vision_text',
    'about_team_title',
    'about_team_text',
    'about_focus_title',
    'about_focus_text',
    'contact_form_heading',
    'contact_form_name_placeholder',
    'contact_form_email_placeholder',
    'contact_form_phone_placeholder',
    'contact_form_service_placeholder',
    'contact_form_message_placeholder',
    'contact_form_submit_label',
    'contact_location_heading',
    'contact_map_embed_url',
    'store_hero_kicker',
    'store_hero_heading',
    'store_hero_description',
    'nav_home_label',
    'nav_services_label',
    'nav_store_label',
    'nav_contact_label',
    'nav_about_label',
    'nav_login_label',
    'nav_logout_label',
    'footer_contact_heading',
    'footer_terms_label',
    'footer_privacy_label',
    'footer_rights_text',
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
