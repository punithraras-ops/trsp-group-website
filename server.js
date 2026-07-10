const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const nodePort = Number(process.env.PORT || 3000);
const phpPort = Number(process.env.PHP_PORT || 8000);
const phpHost = '127.0.0.1';
const nodeHost = '127.0.0.1';
const baseDir = __dirname;
const storageDir = path.join(baseDir, 'storage');
const storageFile = path.join(storageDir, 'contact-submissions.json');

let shuttingDown = false;

function ensureStorage() {
    if (!fs.existsSync(storageDir)) {
        fs.mkdirSync(storageDir, { recursive: true });
    }

    if (!fs.existsSync(storageFile)) {
        fs.writeFileSync(storageFile, '[]\n', 'utf8');
    }
}

function parseRequestBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';

        req.on('data', chunk => {
            body += chunk;

            if (body.length > 1_000_000) {
                reject(new Error('Request body is too large.'));
                req.destroy();
            }
        });

        req.on('end', () => {
            if (!body) {
                resolve({});
                return;
            }

            try {
                resolve(JSON.parse(body));
            } catch (error) {
                reject(new Error('Invalid JSON payload.'));
            }
        });

        req.on('error', reject);
    });
}

function validateSubmission(payload) {
    const name = String(payload.name || '').trim();
    const email = String(payload.email || '').trim();
    const phone = String(payload.phone || '').trim();
    const service = String(payload.service || '').trim();
    const message = String(payload.message || '').trim();

    if (!name || !email || !message) {
        return { ok: false, error: 'Name, email, and message are required.' };
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(email)) {
        return { ok: false, error: 'Please enter a valid email address.' };
    }

    return {
        ok: true,
        data: {
            id: `${Date.now()}`,
            name,
            email,
            phone,
            service,
            message,
            createdAt: new Date().toISOString(),
        },
    };
}

function writeSubmission(entry) {
    ensureStorage();
    const existing = JSON.parse(fs.readFileSync(storageFile, 'utf8'));
    existing.push(entry);
    fs.writeFileSync(storageFile, `${JSON.stringify(existing, null, 2)}\n`, 'utf8');
}

function sendJson(res, statusCode, payload) {
    res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(payload));
}

const phpProcess = spawn('php', ['-S', `${phpHost}:${phpPort}`, 'router.php'], {
    cwd: baseDir,
    stdio: 'inherit',
});

phpProcess.on('exit', code => {
    if (!shuttingDown) {
        console.error(`PHP server exited unexpectedly with code ${code ?? 'unknown'}.`);
        process.exit(code ?? 1);
    }
});

const server = http.createServer(async (req, res) => {
    if (!req.url) {
        sendJson(res, 400, { error: 'Invalid request URL.' });
        return;
    }

    const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    if (requestUrl.pathname === '/api/contact') {
        if (req.method !== 'POST') {
            sendJson(res, 405, { error: 'Method not allowed.' });
            return;
        }

        try {
            const payload = await parseRequestBody(req);
            const validation = validateSubmission(payload);

            if (!validation.ok) {
                sendJson(res, 422, { error: validation.error });
                return;
            }

            writeSubmission(validation.data);
            sendJson(res, 201, { message: 'Message received successfully.' });
        } catch (error) {
            sendJson(res, 400, { error: error.message || 'Unable to process request.' });
        }

        return;
    }

    const proxyRequest = http.request(
        {
            hostname: phpHost,
            port: phpPort,
            path: `${requestUrl.pathname}${requestUrl.search}`,
            method: req.method,
            headers: req.headers,
        },
        proxyResponse => {
            res.writeHead(proxyResponse.statusCode || 500, proxyResponse.headers);
            proxyResponse.pipe(res);
        }
    );

    proxyRequest.on('error', error => {
        sendJson(res, 502, { error: `Upstream PHP server error: ${error.message}` });
    });

    req.pipe(proxyRequest);
});

function shutdown() {
    shuttingDown = true;
    server.close(() => {
        phpProcess.kill('SIGTERM');
        process.exit(0);
    });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

server.listen(nodePort, nodeHost, () => {
    ensureStorage();
    console.log(`Node server running at http://${nodeHost}:${nodePort}`);
    console.log(`PHP renderer proxied from http://${phpHost}:${phpPort}`);
});
