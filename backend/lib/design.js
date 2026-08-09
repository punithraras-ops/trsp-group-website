const db = require('../db');

const CONFIG_ID = 'main';

const DEFAULT_COLORS = {
    primary_color: '#22a8bc',
    primary_dark: '#178396',
    dark_color: '#0c1b2b',
    light_color: '#f5f9fb',
    text_color: '#44525f',
    heading_color: '#132236',
    card_background_color: '#ffffff',
};

const DEFAULT_ADMIN_COLORS = {
    admin_accent: '#4f46e5',
    admin_accent_dark: '#4338ca',
    admin_text: '#1e293b',
    admin_surface: '#ffffff',
};

const ADMIN_BUTTON_SLOTS = [
    'admin_btn_tickets', 'admin_btn_siteinfo', 'admin_btn_sitedesign', 'admin_btn_legal',
    'admin_btn_coupons', 'admin_btn_auditlog', 'admin_btn_security', 'admin_btn_logout',
];

const CARD_SLOTS = [
    { key: 'process_card1_bg', label: 'Process Card 1 (Discover)' },
    { key: 'process_card2_bg', label: 'Process Card 2 (Design & Build)' },
    { key: 'process_card3_bg', label: 'Process Card 3 (Improve & Scale)' },
    { key: 'about_mission_card_bg', label: 'About Page - Mission Card' },
    { key: 'about_vision_card_bg', label: 'About Page - Vision Card' },
    { key: 'about_team_card_bg', label: 'About Page - Team Card' },
    { key: 'about_focus_card_bg', label: 'About Page - Focus Card' },
    { key: 'home_about_mission_card_bg', label: 'Home Page - Mission Card' },
    { key: 'home_about_approach_card_bg', label: 'Home Page - Approach Card' },
];

const ADMIN_CARD_SLOTS = [
    { key: 'admin_stat_submissions_bg', label: 'Contact Submissions' },
    { key: 'admin_stat_users_bg', label: 'Registered Users' },
    { key: 'admin_stat_orders_bg', label: 'Total Orders' },
    { key: 'admin_stat_pending_bg', label: 'Pending Approvals' },
    { key: 'admin_stat_upi_bg', label: 'Pending UPI Confirmations' },
    { key: 'admin_stat_revenue_bg', label: 'Revenue (Paid)' },
];

const WELCOME_COLOR_SLOTS = [
    { key: 'welcome_bg_color_1', label: 'Background Gradient Start' },
    { key: 'welcome_bg_color_2', label: 'Background Gradient End' },
    { key: 'welcome_text_color', label: 'Text Color' },
];

const CARD_COLOR_SLOTS = [...CARD_SLOTS, ...ADMIN_CARD_SLOTS, ...WELCOME_COLOR_SLOTS].map(s => s.key);

const IMAGE_SLOTS = [
    'logo', 'favicon', 'hero_background', 'team_photo', 'page_background', 'services_background', 'button_background',
    'welcome_background', 'welcome_logo',
    'nav_home_bg', 'nav_services_bg', 'nav_store_bg', 'nav_contact_bg', 'nav_about_bg', 'nav_language_bg', 'nav_login_bg', 'service_cta_bg',
    'admin_page_background', 'footer_background',
    ...ADMIN_BUTTON_SLOTS,
    ...CARD_COLOR_SLOTS,
];
const DEFAULT_ADMIN_BG = '#eef1f5';

async function getDesignSettings() {
    if (!db.isDbConfigured()) {
        return { colors: DEFAULT_COLORS, images: {}, adminBackground: DEFAULT_ADMIN_BG, adminButtonColors: {}, adminColors: DEFAULT_ADMIN_COLORS, cardColors: {}, welcomeVideo: null };
    }

    const doc = await db.getDb().collection('site_settings').findOne({ _id: CONFIG_ID });
    const colors = { ...DEFAULT_COLORS, ...(doc && doc.colors ? doc.colors : {}) };
    const images = {};

    for (const slot of IMAGE_SLOTS) {
        if (doc && doc.images && doc.images[slot]) {
            images[slot] = `/uploads/${doc.images[slot]}`;
        }
    }

    const adminBackground = (doc && doc.admin_bg_color) || DEFAULT_ADMIN_BG;
    const adminButtonColors = (doc && doc.admin_button_colors) || {};
    const adminColors = { ...DEFAULT_ADMIN_COLORS, ...(doc && doc.admin_colors ? doc.admin_colors : {}) };
    const cardColors = (doc && doc.card_colors) || {};
    const welcomeVideo = (doc && doc.welcome_video_id) ? `/uploads/${doc.welcome_video_id}` : null;

    return { colors, images, adminBackground, adminButtonColors, adminColors, cardColors, welcomeVideo };
}

async function saveWelcomeVideo(fileId) {
    await db.getDb().collection('site_settings').updateOne(
        { _id: CONFIG_ID },
        { $set: { welcome_video_id: fileId.toString(), updated_at: new Date() } },
        { upsert: true }
    );
}

async function removeWelcomeVideo() {
    const doc = await db.getDb().collection('site_settings').findOne({ _id: CONFIG_ID });
    const existingFileId = doc && doc.welcome_video_id;

    await db.getDb().collection('site_settings').updateOne(
        { _id: CONFIG_ID },
        { $unset: { welcome_video_id: '' }, $set: { updated_at: new Date() } }
    );

    if (existingFileId) {
        try {
            await db.getBucket().delete(db.toId(existingFileId));
        } catch (error) {
            // File may already be gone; ignore.
        }
    }
}

async function saveAdminBackground(color) {
    await db.getDb().collection('site_settings').updateOne(
        { _id: CONFIG_ID },
        { $set: { admin_bg_color: color, updated_at: new Date() } },
        { upsert: true }
    );
}

async function saveAdminColors(colors) {
    const update = {};
    for (const key of Object.keys(DEFAULT_ADMIN_COLORS)) {
        if (colors[key]) {
            update[`admin_colors.${key}`] = colors[key];
        }
    }
    await db.getDb().collection('site_settings').updateOne(
        { _id: CONFIG_ID },
        { $set: { ...update, updated_at: new Date() } },
        { upsert: true }
    );
}

async function saveColors(colors) {
    const update = {};
    for (const key of Object.keys(DEFAULT_COLORS)) {
        if (colors[key]) {
            update[`colors.${key}`] = colors[key];
        }
    }
    await db.getDb().collection('site_settings').updateOne(
        { _id: CONFIG_ID },
        { $set: { ...update, updated_at: new Date() } },
        { upsert: true }
    );
}

async function saveAdminButtonColor(slot, color) {
    if (!ADMIN_BUTTON_SLOTS.includes(slot)) {
        throw new Error(`Unknown admin button slot: ${slot}`);
    }
    await db.getDb().collection('site_settings').updateOne(
        { _id: CONFIG_ID },
        { $set: { [`admin_button_colors.${slot}`]: color, updated_at: new Date() } },
        { upsert: true }
    );
}

async function removeAdminButtonColor(slot) {
    if (!ADMIN_BUTTON_SLOTS.includes(slot)) {
        throw new Error(`Unknown admin button slot: ${slot}`);
    }
    await db.getDb().collection('site_settings').updateOne(
        { _id: CONFIG_ID },
        { $unset: { [`admin_button_colors.${slot}`]: '' }, $set: { updated_at: new Date() } }
    );
}

async function saveCardColor(slot, color) {
    if (!CARD_COLOR_SLOTS.includes(slot)) {
        throw new Error(`Unknown card color slot: ${slot}`);
    }
    await db.getDb().collection('site_settings').updateOne(
        { _id: CONFIG_ID },
        { $set: { [`card_colors.${slot}`]: color, updated_at: new Date() } },
        { upsert: true }
    );
}

async function removeCardColor(slot) {
    if (!CARD_COLOR_SLOTS.includes(slot)) {
        throw new Error(`Unknown card color slot: ${slot}`);
    }
    await db.getDb().collection('site_settings').updateOne(
        { _id: CONFIG_ID },
        { $unset: { [`card_colors.${slot}`]: '' }, $set: { updated_at: new Date() } }
    );
}

async function saveImageRef(slot, fileId) {
    if (!IMAGE_SLOTS.includes(slot)) {
        throw new Error(`Unknown image slot: ${slot}`);
    }
    await db.getDb().collection('site_settings').updateOne(
        { _id: CONFIG_ID },
        { $set: { [`images.${slot}`]: fileId.toString(), updated_at: new Date() } },
        { upsert: true }
    );
}

async function removeImage(slot) {
    if (!IMAGE_SLOTS.includes(slot)) {
        throw new Error(`Unknown image slot: ${slot}`);
    }

    const doc = await db.getDb().collection('site_settings').findOne({ _id: CONFIG_ID });
    const existingFileId = doc && doc.images && doc.images[slot];

    await db.getDb().collection('site_settings').updateOne(
        { _id: CONFIG_ID },
        { $unset: { [`images.${slot}`]: '' }, $set: { updated_at: new Date() } }
    );

    if (existingFileId) {
        try {
            await db.getBucket().delete(db.toId(existingFileId));
        } catch (error) {
            // File may already be gone; ignore.
        }
    }
}

module.exports = {
    getDesignSettings,
    saveColors,
    saveImageRef,
    removeImage,
    saveAdminBackground,
    saveAdminColors,
    saveAdminButtonColor,
    removeAdminButtonColor,
    saveCardColor,
    removeCardColor,
    saveWelcomeVideo,
    removeWelcomeVideo,
    DEFAULT_COLORS,
    DEFAULT_ADMIN_COLORS,
    IMAGE_SLOTS,
    ADMIN_BUTTON_SLOTS,
    CARD_SLOTS,
    ADMIN_CARD_SLOTS,
    WELCOME_COLOR_SLOTS,
    CARD_COLOR_SLOTS,
    DEFAULT_ADMIN_BG,
};
