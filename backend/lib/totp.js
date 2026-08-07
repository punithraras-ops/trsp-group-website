const crypto = require('node:crypto');

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buffer) {
    let bits = '';
    for (const byte of buffer) {
        bits += byte.toString(2).padStart(8, '0');
    }

    let output = '';
    for (let i = 0; i + 5 <= bits.length; i += 5) {
        output += BASE32_ALPHABET[parseInt(bits.slice(i, i + 5), 2)];
    }

    const remainder = bits.length % 5;
    if (remainder !== 0) {
        const lastChunk = bits.slice(bits.length - remainder).padEnd(5, '0');
        output += BASE32_ALPHABET[parseInt(lastChunk, 2)];
    }

    return output;
}

function base32Decode(input) {
    const cleaned = input.toUpperCase().replace(/[^A-Z2-7]/g, '');
    let bits = '';
    for (const char of cleaned) {
        const index = BASE32_ALPHABET.indexOf(char);
        if (index === -1) continue;
        bits += index.toString(2).padStart(5, '0');
    }

    const bytes = [];
    for (let i = 0; i + 8 <= bits.length; i += 8) {
        bytes.push(parseInt(bits.slice(i, i + 8), 2));
    }

    return Buffer.from(bytes);
}

function generateSecret() {
    return base32Encode(crypto.randomBytes(20));
}

function hotp(secretBuffer, counter) {
    const counterBuffer = Buffer.alloc(8);
    counterBuffer.writeBigUInt64BE(BigInt(counter));

    const hmac = crypto.createHmac('sha1', secretBuffer).update(counterBuffer).digest();
    const offset = hmac[hmac.length - 1] & 0x0f;

    const code =
        ((hmac[offset] & 0x7f) << 24) |
        ((hmac[offset + 1] & 0xff) << 16) |
        ((hmac[offset + 2] & 0xff) << 8) |
        (hmac[offset + 3] & 0xff);

    return String(code % 1_000_000).padStart(6, '0');
}

function totp(secretBase32, timeStepSeconds = 30, forCounter = null) {
    const secretBuffer = base32Decode(secretBase32);
    const counter = forCounter !== null ? forCounter : Math.floor(Date.now() / 1000 / timeStepSeconds);
    return hotp(secretBuffer, counter);
}

function verifyToken(secretBase32, token, windowSteps = 1) {
    const cleanToken = String(token || '').trim();
    if (!/^\d{6}$/.test(cleanToken)) {
        return false;
    }

    const currentCounter = Math.floor(Date.now() / 1000 / 30);

    for (let offset = -windowSteps; offset <= windowSteps; offset++) {
        const candidate = totp(secretBase32, 30, currentCounter + offset);
        const candidateBuf = Buffer.from(candidate);
        const tokenBuf = Buffer.from(cleanToken);
        if (candidateBuf.length === tokenBuf.length && crypto.timingSafeEqual(candidateBuf, tokenBuf)) {
            return true;
        }
    }

    return false;
}

function otpauthUrl(secretBase32, accountLabel, issuer) {
    const encodedIssuer = encodeURIComponent(issuer);
    const encodedLabel = encodeURIComponent(`${issuer}:${accountLabel}`);
    return `otpauth://totp/${encodedLabel}?secret=${secretBase32}&issuer=${encodedIssuer}&algorithm=SHA1&digits=6&period=30`;
}

module.exports = { generateSecret, verifyToken, otpauthUrl };
