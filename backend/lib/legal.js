const db = require('../db');

const CONFIG_ID = 'main';

const DEFAULT_TERMS = `1. Acceptance of Terms

By accessing or using this website, creating an account, or purchasing any product or service, you agree to be bound by these Terms and Conditions. If you do not agree with any part of these terms, please do not use this website.

2. About These Services

This website is operated to provide information about, and enable purchase of, software development, business analytics, cybersecurity, and product strategy services, along with any packages or products listed in the Store. Service descriptions, features, and pricing are provided in good faith but may change without prior notice.

3. Accounts

You may create an account using an email and password, or by signing in through a supported third-party provider (such as Google or GitHub). You are responsible for maintaining the confidentiality of your account credentials and for all activity under your account. Notify us immediately if you suspect unauthorized use of your account.

4. Orders, Pricing & Payments

All prices listed in the Store are shown in Indian Rupees (INR) and are inclusive or exclusive of applicable taxes as indicated at checkout. Payments are processed securely through Razorpay; we do not store your card, UPI, or bank details on our servers.

By placing an order, you authorize us to charge the listed amount using your chosen payment method. An order is only confirmed once payment has been successfully verified.

Some products may be marked as requiring approval before payment. In such cases, submitting a purchase request does not guarantee approval, and no payment will be collected unless and until the request is approved.

5. Refunds & Cancellations

Refund eligibility, if any, depends on the nature of the product or service purchased and will be assessed on a case-by-case basis. To request a refund or cancellation, please contact us using the details on the Contact page, quoting your order details. Approved refunds will be processed back to the original payment method within a reasonable timeframe.

6. Delivery & Service Fulfillment

For physical or digital deliverables, order status and delivery updates are visible on your Account page. For custom services (software development, consulting, etc.), delivery timelines will be agreed upon separately with our team.

7. User Conduct

You agree not to misuse this website, including but not limited to: attempting unauthorized access to any part of the site or its underlying systems, submitting false or misleading information, or using the site for any unlawful purpose.

8. Intellectual Property

All content on this website, including text, graphics, logos, and software, is the property of this business or its licensors and is protected by applicable intellectual property laws, unless otherwise stated. You may not reproduce, distribute, or create derivative works without prior written permission.

9. Third-Party Services

This website integrates with third-party services including Razorpay (payments), Google and GitHub (sign-in), and WhatsApp (contact). Your use of these services is also subject to their respective terms and privacy policies.

10. Limitation of Liability

This website and its services are provided on an "as is" basis. To the fullest extent permitted by law, we are not liable for any indirect, incidental, or consequential damages arising from your use of this website or its services.

11. Changes to These Terms

We may update these Terms and Conditions from time to time. Continued use of the website after changes are posted constitutes acceptance of the revised terms. We encourage you to review this page periodically.

12. Governing Law

These terms are governed by the laws of India. Any disputes arising from these terms or your use of this website will be subject to the jurisdiction of the courts in Karnataka, India.

13. Contact Us

If you have any questions about these Terms and Conditions, please reach out using the details on our Contact page.`;

async function getTermsContent() {
    if (!db.isDbConfigured()) {
        return DEFAULT_TERMS;
    }

    try {
        const doc = await db.getDb().collection('legal_content').findOne({ _id: CONFIG_ID });
        return (doc && doc.terms) || DEFAULT_TERMS;
    } catch (error) {
        return DEFAULT_TERMS;
    }
}

async function saveTermsContent(text) {
    await db.getDb().collection('legal_content').updateOne(
        { _id: CONFIG_ID },
        { $set: { terms: text, updated_at: new Date() } },
        { upsert: true }
    );
}

module.exports = { getTermsContent, saveTermsContent, DEFAULT_TERMS };
