const db = require('../db');

const CONFIG_ID = 'main';

const DEFAULT_COLORS = {
    primary_color: '#22a8bc',
    primary_dark: '#178396',
    dark_color: '#0c1b2b',
    light_color: '#f5f9fb',
    text_color: '#44525f',
    heading_color: '#132236',
};

const IMAGE_SLOTS = ['logo', 'favicon', 'hero_background', 'team_photo'];
const DEFAULT_ADMIN_BG = '#eef1f5';

async function getDesignSettings() {
    if (!db.isDbConfigured()) {
        return { colors: DEFAULT_COLORS, images: {}, adminBackground: DEFAULT_ADMIN_BG };
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

    return { colors, images, adminBackground };
}

async function saveAdminBackground(color) {
    await db.getDb().collection('site_settings').updateOne(
        { _id: CONFIG_ID },
        { $set: { admin_bg_color: color, updated_at: new Date() } },
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

module.exports = { getDesignSettings, saveColors, saveImageRef, removeImage, saveAdminBackground, DEFAULT_COLORS, IMAGE_SLOTS, DEFAULT_ADMIN_BG };
