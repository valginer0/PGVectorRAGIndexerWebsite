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

    // Audit metadata sources
    console.log('[Metadata Audit] Session:', JSON.stringify(session.metadata || {}));
    console.log('[Metadata Audit] Subscription:', session.subscription ? '(exists)' : '(null)');

    try {
      const tier = session.metadata?.tier || 'team';
      const seats = parseInt(session.metadata?.seats || (tier === 'team' ? '5' : '25'), 10);
      const customerEmail = session.customer_details?.email || session.customer_email;
      const customerName = session.customer_details?.name || '';
      const orgName = customerName || customerEmail || 'Customer';
      const expiryDays = 90; // Fallback

      if (!customerEmail) {
        console.error('[Webhook] No customer email found in session:', session.id);
        return res.status(200).json({ received: true, warning: 'No email — manual follow-up needed' });
      }

      // We only send from session.completed if it's NOT a subscription (one-time)
      // or if we want immediate delivery without waiting for the first invoice.
      // Since we shifted to SUBSCRIPTION mode, invoice.paid is the gold standard,
      // but we'll fulfill here if logic permits (e.g. for trial or instant setup).
      if (session.mode === 'payment') {
        const licenseKey = generateLicenseKey(tier, orgName, seats, expiryDays, 0);
        await sendLicenseEmail(customerEmail, customerName, tier, licenseKey, seats, expiryDays);
        console.log(`[Webhook] SUCCESS: License delivered via session.completed → ${customerEmail}`);
      } else {
        console.log('[Webhook] Subscription mode detected. Offloading fulfillment to invoice.paid.');
      }
    } catch (err) {
      console.error('[Webhook] ERROR in session.completed handler:', err);
    }
  }

  // Handle subscription renewal & creation (invoice.paid)
  if (event.type === 'invoice.paid') {
    const invoice = event.data.object;
    console.log(`[Webhook] Handling invoice.paid for ${invoice.id}, reason: ${invoice.billing_reason}`);

    if (invoice.subscription) {
      try {
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
        const subscription = await stripe.subscriptions.retrieve(invoice.subscription);

        // Audit metadata
        console.log('[Metadata Audit] Invoice Metadata:', JSON.stringify(invoice.metadata || {}));
        console.log('[Metadata Audit] Subscription Metadata:', JSON.stringify(subscription.metadata || {}));

        const tier = subscription.metadata?.tier || invoice.metadata?.tier || 'team';
        const seats = parseInt(subscription.metadata?.seats || invoice.metadata?.seats || (tier === 'team' ? '5' : '25'), 10);
        const renewalCount = parseInt(subscription.metadata?.renewal_count || '0', 10);
        const orgName = subscription.metadata?.org || invoice.customer_name || invoice.customer_email || 'Customer';
        const customerEmail = invoice.customer_email;
        const customerName = invoice.customer_name || '';

        // Calculate expiry from current_period_end
        const expiryDate = new Date(subscription.current_period_end * 1000);
        const now = new Date();
        const diffTime = Math.abs(expiryDate - now);
        const expiryDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (!customerEmail) {
          console.error('[Webhook] No customer email on invoice:', invoice.id);
          return res.status(200).json({ received: true, warning: 'No email' });
        }

        // Generate license key
        const licenseKey = generateLicenseKey(tier, orgName, seats, expiryDays, renewalCount);

        // Send email
        await sendLicenseEmail(customerEmail, customerName, tier, licenseKey, seats, expiryDays);

        // If it's a renewal (subscription_cycle), increment renewal_count
        if (invoice.billing_reason === 'subscription_cycle') {
          await stripe.subscriptions.update(invoice.subscription, {
            metadata: { ...subscription.metadata, renewal_count: String(renewalCount + 1) },
          });
          console.log(`[Webhook] SUCCESS: Subscription renewed (#${renewalCount + 1}) → ${customerEmail}`);
        } else {
          console.log(`[Webhook] SUCCESS: Subscription created → ${customerEmail}`);
        }
      } catch (err) {
        console.error('[Webhook] ERROR in invoice.paid handler:', err);
        return res.status(200).json({ received: true, error: 'Fulfillment failed' });
      }
    }
  }

  return res.status(200).json({ received: true });
}
