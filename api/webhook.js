import Stripe from 'stripe';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import crypto from 'crypto';

// ---------------------------------------------------------------------------
// License key generation (mirrors generate_license_key.py)
// ---------------------------------------------------------------------------

function generateLicenseKey(edition, orgName, seats, days, renewalCount = 0) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    edition,
    org: orgName,
    seats,
    iat: now,
    exp: now + days * 86400,
    jti: crypto.randomUUID(),
    renewal_count: renewalCount,
  };
  return jwt.sign(payload, process.env.LICENSE_SIGNING_SECRET, { algorithm: 'HS256' });
}

// ---------------------------------------------------------------------------
// Email delivery via Zoho Mail SMTP
// ---------------------------------------------------------------------------

function createTransporter() {
  return nodemailer.createTransport({
    host: 'smtp.zoho.com',
    port: 465,
    secure: true,
    auth: {
      user: process.env.SMTP_USER,       // hello@ragvault.net
      pass: process.env.SMTP_PASSWORD,    // Zoho app-specific password
    },
  });
}

async function sendLicenseEmail(customerEmail, customerName, tier, licenseKey, seats, expiryDays) {
  console.log(`[sendLicenseEmail] Preparing to send email to ${customerEmail} (Tier: ${tier})`);
  const transporter = createTransporter();
  const expiryDate = new Date(Date.now() + expiryDays * 86400 * 1000).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  const tierDisplay = tier.charAt(0).toUpperCase() + tier.slice(1);

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #6366f1, #8b5cf6); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 24px;">🔑 Your RagVault License Key</h1>
      </div>
      <div style="background: #1e1e2e; padding: 30px; border-radius: 0 0 12px 12px; color: #e2e8f0;">
        <p>Hi${customerName ? ' ' + customerName : ''},</p>
        <p>Thank you for purchasing a <strong>${tierDisplay}</strong> license for PGVectorRAGIndexer!</p>

        <div style="background: #2d2d3f; border: 1px solid #4a4a5e; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <p style="margin: 0 0 8px 0; color: #9ca3af; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em;">License Key</p>
          <code style="display: block; background: #1a1a2e; padding: 12px; border-radius: 6px; font-size: 11px; word-break: break-all; color: #a5b4fc;">${licenseKey}</code>
        </div>

        <table style="width: 100%; margin: 20px 0; color: #e2e8f0;">
          <tr><td style="padding: 6px 0; color: #9ca3af;">Edition</td><td style="padding: 6px 0; text-align: right;">${tierDisplay}</td></tr>
          <tr><td style="padding: 6px 0; color: #9ca3af;">Licensed Seats</td><td style="padding: 6px 0; text-align: right;">${seats}</td></tr>
          <tr><td style="padding: 6px 0; color: #9ca3af;">Valid Until</td><td style="padding: 6px 0; text-align: right;">${expiryDate}</td></tr>
        </table>

        <div style="background: #2d2d3f; border-radius: 8px; padding: 16px; margin: 20px 0;">
          <p style="margin: 0 0 8px 0; color: #9ca3af; font-size: 12px; text-transform: uppercase;">Installation</p>
          <p style="margin: 0; font-size: 14px;"><strong>macOS / Linux:</strong></p>
          <code style="display: block; background: #1a1a2e; padding: 8px; border-radius: 4px; font-size: 11px; margin: 4px 0 12px 0; color: #a5b4fc;">mkdir -p ~/.pgvector-license && echo '${licenseKey}' > ~/.pgvector-license/license.key && chmod 600 ~/.pgvector-license/license.key</code>
          <p style="margin: 0; font-size: 14px;"><strong>Windows:</strong></p>
          <code style="display: block; background: #1a1a2e; padding: 8px; border-radius: 4px; font-size: 11px; margin: 4px 0 0 0; color: #a5b4fc;">Save the key to %APPDATA%\\PGVectorRAGIndexer\\license.key</code>
        </div>

        <p style="color: #9ca3af; font-size: 13px;">Need help? Reply to this email or visit <a href="https://www.ragvault.net" style="color: #a5b4fc;">ragvault.net</a>.</p>
      </div>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: `"RagVault" <${process.env.SMTP_USER}>`,
      to: customerEmail,
      subject: `Your RagVault ${tierDisplay} License Key`,
      html,
    });
    console.log(`[sendLicenseEmail] SUCCESS: Email sent to ${customerEmail}`);
  } catch (error) {
    console.error(`[sendLicenseEmail] ERROR: Failed to send email to ${customerEmail}:`, error);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Stripe webhook handler
// ---------------------------------------------------------------------------

// Vercel needs raw body for signature verification
export const config = {
  api: {
    bodyParser: false,
  },
};

async function getRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let event;

  try {
    const rawBody = await getRawBody(req);
    const sig = req.headers['stripe-signature'];

    if (!sig || !process.env.STRIPE_WEBHOOK_SECRET) {
      console.error('Missing signature or webhook secret');
      return res.status(400).json({ error: 'Missing signature' });
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
    console.log(`[Webhook] Event verified: ${event.type} (ID: ${event.id})`);

    // Safety check for other required secrets
    const requiredSecrets = ['SMTP_USER', 'SMTP_PASSWORD', 'LICENSE_SIGNING_SECRET'];
    const missing = requiredSecrets.filter(s => !process.env[s]);
    if (missing.length > 0) {
      console.error(`[Webhook] CRITICAL: Missing environment variables: ${missing.join(', ')}`);
    } else {
      console.log('[Webhook] All environment variables present.');
    }
  } catch (err) {
    console.error('[Webhook] Signature verification failed:', err.message);
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  // Handle the checkout.session.completed event (initial payment confirm)
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    console.log(`[Webhook] Handling checkout.session.completed for ${session.id}`);

    try {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

      // Audit metadata from Session + Customer
      const customer = session.customer ? await stripe.customers.retrieve(session.customer) : null;
      console.log('[Metadata Audit] Session:', JSON.stringify(session.metadata || {}));
      console.log('[Metadata Audit] Customer:', customer ? JSON.stringify(customer.metadata || {}) : '(null)');
      console.log('[Metadata Audit] Subscription ID:', session.subscription || '(null)');

      const tier = session.metadata?.tier || customer?.metadata?.tier || 'team';
      const seatsRaw = session.metadata?.seats || customer?.metadata?.seats;
      const seats = Number.isSafeInteger(parseInt(seatsRaw, 10)) ? parseInt(seatsRaw, 10) : (tier === 'team' ? 5 : 25);
      const customerEmail = session.customer_details?.email || session.customer_email || customer?.email;
      const customerName = session.customer_details?.name || customer?.name || '';
      const orgName = customerName || customerEmail || 'Customer';

      if (!customerEmail) {
        console.error('[Webhook] No customer email found in session or customer object:', session.id);
        return res.status(200).json({ received: true, warning: 'No email — manual follow-up needed' });
      }

      // Fulfill if it's a one-time payment
      if (session.mode === 'payment') {
        const expiryDays = 90;
        const licenseKey = generateLicenseKey(tier, orgName, seats, expiryDays, 0);
        await sendLicenseEmail(customerEmail, customerName, tier, licenseKey, seats, expiryDays);
        console.log(`[Webhook] SUCCESS: One-time license delivered via session.completed → ${customerEmail}`);
      } else {
        console.log('[Webhook] Session is subscription mode. Fulfillment deferred to invoice.paid.');
      }
    } catch (err) {
      console.error('[Webhook] ERROR in session.completed handler:', err);
    }
  }

  // Handle subscription creation & renewals (invoice.paid)
  if (event.type === 'invoice.paid') {
    const invoice = event.data.object;
    console.log(`[Webhook] Handling invoice.paid for ${invoice.id}, reason: ${invoice.billing_reason}`);

    // Strict guard on billing reason per expert advice
    const validReasons = ['subscription_create', 'subscription_cycle'];
    if (!validReasons.includes(invoice.billing_reason)) {
      console.log(`[Webhook] Skipping invoice.paid with reason: ${invoice.billing_reason}`);
      return res.status(200).json({ received: true });
    }

    if (!invoice.subscription) {
      console.warn(`[Webhook] invoice.paid for ${invoice.id} WITHOUT subscription. Skipping automatic fulfillment.`);
      return res.status(200).json({ received: true });
    }

    try {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
      const [subscription, customer] = await Promise.all([
        stripe.subscriptions.retrieve(invoice.subscription),
        stripe.customers.retrieve(invoice.customer)
      ]);

      // Audit all metadata sources
      console.log('[Metadata Audit] Invoice Metadata:', JSON.stringify(invoice.metadata || {}));
      console.log('[Metadata Audit] Subscription Metadata:', JSON.stringify(subscription.metadata || {}));
      console.log('[Metadata Audit] Customer Metadata:', JSON.stringify(customer.metadata || {}));

      // Extract with robust fallbacks
      const tier = subscription.metadata?.tier || invoice.metadata?.tier || customer.metadata?.tier || 'team';
      const seatsRaw = subscription.metadata?.seats || invoice.metadata?.seats || customer.metadata?.seats;
      const seats = Number.isSafeInteger(parseInt(seatsRaw, 10)) ? parseInt(seatsRaw, 10) : (tier === 'team' ? 5 : 25);
      const renewalCount = parseInt(subscription.metadata?.renewal_count || '0', 10);
      const orgName = subscription.metadata?.org || customer.name || customer.email || 'Customer';
      const customerEmail = invoice.customer_email || customer.email;
      const customerName = invoice.customer_name || customer.name || '';

      if (!customerEmail) {
        console.error('[Webhook] No customer email found for invoice:', invoice.id);
        return res.status(200).json({ received: true, error: 'No email found' });
      }

      // Calculate expiry from subscription.current_period_end
      const expiryTimestamp = subscription.current_period_end;
      const nowSeconds = Math.floor(Date.now() / 1000);
      const diffSeconds = expiryTimestamp - nowSeconds;
      const expiryDays = Math.max(1, Math.ceil(diffSeconds / 86400));

      // Generate license key
      const licenseKey = generateLicenseKey(tier, orgName, seats, expiryDays, renewalCount);

      // Send renewal/creation email
      await sendLicenseEmail(customerEmail, customerName, tier, licenseKey, seats, expiryDays);

      // Increment renewal_count if it was a cycle renewal
      if (invoice.billing_reason === 'subscription_cycle') {
        await stripe.subscriptions.update(invoice.subscription, {
          metadata: { ...subscription.metadata, renewal_count: String(renewalCount + 1) },
        });
        console.log(`[Webhook] SUCCESS: Subscription renewed (#${renewalCount + 1}) → ${customerEmail}`);
      } else {
        console.log(`[Webhook] SUCCESS: Subscription fulfilled → ${customerEmail}`);
      }
    } catch (err) {
      console.error('[Webhook] ERROR in invoice.paid fulfillment:', err);
      return res.status(200).json({ received: true, error: 'Fulfillment error' });
    }
  }

  return res.status(200).json({ received: true });
}
