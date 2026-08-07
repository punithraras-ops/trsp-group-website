const { MongoClient, ObjectId } = require('mongodb');

const uri = process.env.MONGODB_URI || '';
let client = null;
let db = null;

function isDbConfigured() {
    return db !== null;
}

function getDb() {
    if (!db) {
        throw new Error('Database is not configured. Set the MONGODB_URI environment variable.');
    }
    return db;
}

async function connect() {
    if (!uri) {
        console.warn('MONGODB_URI not set - skipping database connection. Auth, store, and admin data features are disabled until it is configured.');
        return;
    }

    try {
        client = new MongoClient(uri);
        await client.connect();
        db = client.db();

        await Promise.all([
            db.collection('users').createIndex({ email: 1 }, { unique: true }),
            db.collection('users').createIndex({ google_id: 1 }, { unique: true, sparse: true }),
            db.collection('users').createIndex({ github_id: 1 }, { unique: true, sparse: true }),
            db.collection('sessions').createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 }),
            db.collection('products').createIndex({ is_active: 1 }),
            db.collection('orders').createIndex({ user_id: 1 }),
            db.collection('upcoming_features').createIndex({ is_active: 1, sort_order: 1 }),
        ]);

        console.log('Connected to MongoDB successfully.');
    } catch (error) {
        console.error('MongoDB connection failed:', error.message);
        db = null;
    }
}

function toId(value) {
    return typeof value === 'string' ? new ObjectId(value) : value;
}

function withId(doc) {
    if (!doc) return doc;
    const { _id, ...rest } = doc;
    return { id: _id.toString(), ...rest };
}

module.exports = { connect, isDbConfigured, getDb, toId, withId, ObjectId };
