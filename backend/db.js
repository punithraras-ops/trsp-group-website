const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL || '';
let pool = null;

if (connectionString) {
    pool = new Pool({
        connectionString,
        ssl: connectionString.includes('sslmode=disable') ? false : { rejectUnauthorized: false },
    });
    pool.on('error', err => {
        console.error('Unexpected Postgres client error', err);
    });
}

function isDbConfigured() {
    return pool !== null;
}

async function query(text, params) {
    if (!pool) {
        throw new Error('Database is not configured. Set the DATABASE_URL environment variable.');
    }
    return pool.query(text, params);
}

async function migrate() {
    if (!pool) {
        console.warn('DATABASE_URL not set - skipping migrations. Auth, store, and admin data features are disabled until it is configured.');
        return;
    }

    const schemaPath = path.join(__dirname, 'db', 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');

    try {
        await pool.query(schema);
        console.log('Database migrated successfully.');
    } catch (error) {
        console.error('Database migration failed:', error.message);
    }
}

module.exports = { query, migrate, isDbConfigured };
