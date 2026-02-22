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

  await transporter.sendMail({
    from: `"RagVault" <${process.env.SMTP_USER}>`,
    to: customerEmail,
    subject: `Your RagVault ${tierDisplay} License Key`,
    html,
  });
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
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  // Handle the checkout.session.completed event (initial purchase)
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;

    try {
      const tier = session.metadata?.tier || 'team';
      const seats = parseInt(session.metadata?.seats || (tier === 'team' ? '5' : '25'), 10);
      const customerEmail = session.customer_details?.email || session.customer_email;
      const customerName = session.customer_details?.name || '';
      const orgName = customerName || customerEmail || 'Customer';
      const expiryDays = 90;

      if (!customerEmail) {
        console.error('No customer email found in session:', session.id);
        return res.status(200).json({ received: true, warning: 'No email — manual follow-up needed' });
      }

      // Generate license key (initial purchase, renewal_count = 0)
      const licenseKey = generateLicenseKey(tier, orgName, seats, expiryDays, 0);

      // Send license email
      await sendLicenseEmail(customerEmail, customerName, tier, licenseKey, seats, expiryDays);

      console.log(`License delivered: ${tier} (${seats} seats, ${expiryDays}d) → ${customerEmail}`);
    } catch (err) {
      console.error('License delivery failed:', err);
      // Still return 200 so Stripe doesn't retry — handle manually
      return res.status(200).json({ received: true, error: 'License delivery failed — manual follow-up needed' });
    }
  }

  // Handle subscription renewal (invoice.paid for recurring billing cycles)
  if (event.type === 'invoice.paid') {
    const invoice = event.data.object;

    // Process both initial subscription payment and renewals
    if (invoice.subscription && (invoice.billing_reason === 'subscription_create' || invoice.billing_reason === 'subscription_cycle')) {
      try {
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

        // Get subscription to read metadata
        const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
        const tier = subscription.metadata?.tier || 'team';
        const seats = parseInt(subscription.metadata?.seats || (tier === 'team' ? '5' : '25'), 10);
        const renewalCount = parseInt(subscription.metadata?.renewal_count || '0', 10) + 1;
        const orgName = subscription.metadata?.org || invoice.customer_name || invoice.customer_email || 'Customer';
        const customerEmail = invoice.customer_email;
        const customerName = invoice.customer_name || '';
        const expiryDays = 90;

        if (!customerEmail) {
          console.error('No customer email on renewal invoice:', invoice.id);
          return res.status(200).json({ received: true, warning: 'No email — manual follow-up needed' });
        }

        // Generate fresh license key with incremented renewal count
        const licenseKey = generateLicenseKey(tier, orgName, seats, expiryDays, renewalCount);

        // Send renewal email
        await sendLicenseEmail(customerEmail, customerName, tier, licenseKey, seats, expiryDays);

        // Update renewal count in subscription metadata
        await stripe.subscriptions.update(invoice.subscription, {
          metadata: { ...subscription.metadata, renewal_count: String(renewalCount) },
        });

        console.log(`License renewed (#${renewalCount}): ${tier} (${seats} seats, ${expiryDays}d) → ${customerEmail}`);
      } catch (err) {
        console.error('License renewal failed:', err);
        return res.status(200).json({ received: true, error: 'License renewal failed — manual follow-up needed' });
      }
    }
  }

  return res.status(200).json({ received: true });
}
