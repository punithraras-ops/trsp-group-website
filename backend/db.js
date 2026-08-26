const { MongoClient, ObjectId, GridFSBucket } = require('mongodb');

const uri = process.env.MONGODB_URI || '';
let client = null;
let db = null;
let bucket = null;

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
        bucket = new GridFSBucket(db, { bucketName: 'uploads' });

        await Promise.all([
            db.collection('users').createIndex({ email: 1 }, { unique: true }),
            db.collection('users').createIndex({ google_id: 1 }, { unique: true, sparse: true }),
            db.collection('users').createIndex({ github_id: 1 }, { unique: true, sparse: true }),
            db.collection('sessions').createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 }),
            db.collection('admin_sessions').createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 }),
            db.collection('admin_pending_logins').createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 }),
            db.collection('products').createIndex({ is_active: 1 }),
            db.collection('services').createIndex({ is_active: 1, sort_order: 1 }),
            db.collection('services').createIndex({ slug: 1 }, { unique: true }),
            db.collection('orders').createIndex({ user_id: 1 }),
            db.collection('upcoming_features').createIndex({ is_active: 1, sort_order: 1 }),
            db.collection('users').createIndex({ reset_token: 1 }, { sparse: true }),
            db.collection('users').createIndex({ verify_token: 1 }, { sparse: true }),
            db.collection('pending_logins').createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 }),
            db.collection('reviews').createIndex({ product_id: 1 }),
            db.collection('coupons').createIndex({ code: 1 }, { unique: true }),
            db.collection('admin_audit_log').createIndex({ created_at: -1 }),
            db.collection('staff_accounts').createIndex({ email: 1 }, { unique: true }),
            db.collection('staff_accounts').createIndex({ service_id: 1 }),
            db.collection('staff_sessions').createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 }),
            db.collection('tickets').createIndex({ service_id: 1 }),
            // created_at stores creation time (not a future expiry), so expireAfterSeconds
            // must be a positive duration here - unlike the expires_at/0 pattern used above.
            db.collection('security_events').createIndex({ created_at: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 }),
            db.collection('security_events').createIndex({ ip: 1, created_at: -1 }),
            db.collection('app_errors').createIndex({ created_at: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 14 }),
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

function getBucket() {
    if (!bucket) {
        throw new Error('Database is not configured. Set the MONGODB_URI environment variable.');
    }
    return bucket;
}

function withId(doc) {
    if (!doc) return doc;
    const { _id, ...rest } = doc;
    return { id: _id.toString(), ...rest };
}

function uploadBuffer(buffer, filename, contentType) {
    return new Promise((resolve, reject) => {
        const uploadStream = getBucket().openUploadStream(filename, { contentType });
        uploadStream.end(buffer);
        uploadStream.on('finish', () => resolve(uploadStream.id));
        uploadStream.on('error', reject);
    });
}

async function deleteFile(id) {
    try {
        await getBucket().delete(toId(id));
    } catch (error) {
        // Already gone; ignore.
    }
}

module.exports = { connect, isDbConfigured, getDb, getBucket, toId, withId, uploadBuffer, deleteFile, ObjectId };
