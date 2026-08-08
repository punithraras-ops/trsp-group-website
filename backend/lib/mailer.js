const nodemailer = require('nodemailer');

let transporter = null;

function isConfigured() {
    return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function getTransporter() {
    if (transporter) {
        return transporter;
    }
    transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 465),
        secure: Number(process.env.SMTP_PORT || 465) === 465,
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
        },
    });
    return transporter;
}

async function sendMail({ to, subject, html, text }) {
    if (!isConfigured()) {
        console.warn(`Email not sent (SMTP not configured): "${subject}" -> ${to}`);
        return false;
    }
    try {
        await getTransporter().sendMail({
            from: process.env.EMAIL_FROM || process.env.SMTP_USER,
            to,
            subject,
            html,
            text: text || html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
        });
        return true;
    } catch (error) {
        console.error(`Failed to send email "${subject}" to ${to}:`, error.message);
        return false;
    }
}

function formatMoney(paise, currency) {
    return `${currency || 'INR'} ${(paise / 100).toFixed(2)}`;
}

function shell(site, title, bodyHtml) {
    const brand = site.company_name || 'Technical of RSP Groups';
    const primary = '#22a8bc';
    return `
    <div style="background:#f4f6f8;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;">
        <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.08);">
            <div style="background:${primary};padding:20px 28px;">
                <span style="color:#ffffff;font-size:18px;font-weight:700;">${brand}</span>
            </div>
            <div style="padding:28px;color:#1e293b;font-size:15px;line-height:1.6;">
                <h2 style="margin:0 0 16px;font-size:20px;color:#1e293b;">${title}</h2>
                ${bodyHtml}
            </div>
            <div style="padding:16px 28px;background:#f4f6f8;color:#64748b;font-size:12px;">
                ${brand}${site.address ? ' &middot; ' + site.address : ''}${site.location ? ', ' + site.location : ''}
            </div>
        </div>
    </div>`;
}

async function sendContactAlert({ name, email, phone, message, site }) {
    if (!site.email) return false;
    const body = `
        <p>You received a new contact form submission.</p>
        <table style="width:100%;border-collapse:collapse;margin-top:12px;">
            <tr><td style="padding:6px 0;color:#64748b;width:100px;">Name</td><td style="padding:6px 0;">${name}</td></tr>
            <tr><td style="padding:6px 0;color:#64748b;">Email</td><td style="padding:6px 0;">${email}</td></tr>
            <tr><td style="padding:6px 0;color:#64748b;">Phone</td><td style="padding:6px 0;">${phone || '-'}</td></tr>
        </table>
        <p style="margin-top:16px;white-space:pre-wrap;background:#f4f6f8;padding:12px;border-radius:8px;">${message}</p>
    `;
    return sendMail({
        to: site.email,
        subject: `New contact form submission from ${name}`,
        html: shell(site, 'New Contact Submission', body),
    });
}

async function sendPasswordResetEmail({ to, name, resetUrl, site }) {
    const body = `
        <p>Hi ${name || 'there'},</p>
        <p>We received a request to reset your password. Click the button below to choose a new one. This link expires in 30 minutes.</p>
        <p style="text-align:center;margin:24px 0;">
            <a href="${resetUrl}" style="background:#22a8bc;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:999px;font-weight:600;display:inline-block;">Reset Password</a>
        </p>
        <p>If you didn't request this, you can safely ignore this email.</p>
    `;
    return sendMail({
        to,
        subject: 'Reset your password',
        html: shell(site, 'Reset Your Password', body),
    });
}

async function sendVerificationEmail({ to, name, verifyUrl, site }) {
    const body = `
        <p>Hi ${name || 'there'},</p>
        <p>Thanks for creating an account. Please confirm this is your email address by clicking below.</p>
        <p style="text-align:center;margin:24px 0;">
            <a href="${verifyUrl}" style="background:#22a8bc;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:999px;font-weight:600;display:inline-block;">Verify Email</a>
        </p>
        <p>If you didn't create this account, you can safely ignore this email.</p>
    `;
    return sendMail({
        to,
        subject: 'Verify your email address',
        html: shell(site, 'Verify Your Email', body),
    });
}

async function sendOrderConfirmation({ to, name, items, totalPaise, currency, orderId, site }) {
    const rows = items.map((item) => `
        <tr>
            <td style="padding:8px 0;border-bottom:1px solid #eef1f5;">${item.title} ${item.quantity > 1 ? `&times; ${item.quantity}` : ''}</td>
            <td style="padding:8px 0;border-bottom:1px solid #eef1f5;text-align:right;">${formatMoney(item.amount_paise, currency)}</td>
        </tr>`).join('');
    const body = `
        <p>Hi ${name || 'there'},</p>
        <p>Thanks for your order! Here's a summary:</p>
        <table style="width:100%;border-collapse:collapse;margin-top:12px;">${rows}
            <tr><td style="padding:10px 0 0;font-weight:700;">Total</td><td style="padding:10px 0 0;text-align:right;font-weight:700;">${formatMoney(totalPaise, currency)}</td></tr>
        </table>
        <p style="margin-top:16px;color:#64748b;">Order reference: ${orderId}</p>
        <p>You can track delivery status anytime from your account page.</p>
    `;
    return sendMail({
        to,
        subject: 'Order confirmation',
        html: shell(site, 'Order Confirmed', body),
    });
}

async function sendUtrReceivedEmail({ to, name, orderId, utr, amountPaise, currency, site }) {
    const body = `
        <p>Hi ${name || 'there'},</p>
        <p>We've received your UPI payment reference for order <strong>${orderId}</strong>:</p>
        <p style="background:#f4f6f8;padding:12px;border-radius:8px;font-family:monospace;">UTR / Transaction ID: ${utr}</p>
        <p>Amount: ${formatMoney(amountPaise, currency)}</p>
        <p>We'll verify this against our bank statement and confirm your order shortly. You can check the status anytime on your account page.</p>
    `;
    return sendMail({
        to,
        subject: 'We received your UPI payment reference',
        html: shell(site, 'Payment Reference Received', body),
    });
}

async function sendUpiUtrAlert({ orderId, utr, amountPaise, currency, customerName, customerEmail, site }) {
    if (!site.email) return false;
    const body = `
        <p>A customer has submitted a UPI payment reference awaiting your confirmation.</p>
        <table style="width:100%;border-collapse:collapse;margin-top:12px;">
            <tr><td style="padding:6px 0;color:#64748b;width:140px;">Order</td><td style="padding:6px 0;">${orderId}</td></tr>
            <tr><td style="padding:6px 0;color:#64748b;">Customer</td><td style="padding:6px 0;">${customerName} (${customerEmail})</td></tr>
            <tr><td style="padding:6px 0;color:#64748b;">Amount</td><td style="padding:6px 0;">${formatMoney(amountPaise, currency)}</td></tr>
            <tr><td style="padding:6px 0;color:#64748b;">UTR / Transaction ID</td><td style="padding:6px 0;font-family:monospace;">${utr}</td></tr>
        </table>
        <p style="margin-top:16px;">Check your bank/UPI app, then confirm or reject it from the admin Orders tab.</p>
    `;
    return sendMail({
        to: site.email,
        subject: `UPI payment awaiting confirmation — ${customerName}`,
        html: shell(site, 'UPI Payment Awaiting Confirmation', body),
    });
}

module.exports = {
    isConfigured,
    sendMail,
    sendContactAlert,
    sendPasswordResetEmail,
    sendVerificationEmail,
    sendOrderConfirmation,
    sendUtrReceivedEmail,
    sendUpiUtrAlert,
};
