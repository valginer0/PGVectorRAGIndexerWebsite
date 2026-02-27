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
  // Vercel stores multiline env vars with literal \n — normalize to real newlines for PEM parsing
  const rawKey = process.env.LICENSE_PRIVATE_KEY || '';
  const privateKey = rawKey.replace(/\\n/g, '\n');
  console.log(`[Webhook] LICENSE_PRIVATE_KEY diagnostics: length=${rawKey.length}, hasRealNL=${rawKey.includes('\n')}, hasLiteralNL=${rawKey.includes('\\n')}, first60=${JSON.stringify(rawKey.substring(0, 60))}`);
  return jwt.sign(payload, privateKey, { algorithm: 'RS256' });
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

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { maxNetworkRetries: 2 });
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
    console.log(`[Webhook] Signature Verified: ${event.type} (ID: ${event.id})`);

    // Safety check for other required secrets
    const requiredSecrets = ['SMTP_USER', 'SMTP_PASSWORD', 'LICENSE_PRIVATE_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_SECRET_KEY'];
    const missing = requiredSecrets.filter(s => !process.env[s]);
    if (missing.length > 0) {
      console.error(`[Webhook] CRITICAL: Missing environment variables: ${missing.join(', ')}`);
    } else {
      console.log('[Webhook] Heartbeat: All secrets present.');
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
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { maxNetworkRetries: 2 });

      const customer = session.customer ? await stripe.customers.retrieve(session.customer) : null;
      let subscriptionMetadata = {};
      if (session.subscription) {
        const sub = await stripe.subscriptions.retrieve(session.subscription);
        subscriptionMetadata = sub.metadata || {};
      }

      // 1. Recovery-Aware Idempotency Check with Stale Lock
      const fulfilledId = customer?.metadata?.last_fulfilled_session_id;
      const processingId = customer?.metadata?.last_processing_session_id;
      const processingAt = parseInt(customer?.metadata?.last_processing_session_at || '0', 10);
      const now = Math.floor(Date.now() / 1000);
      const diff = now - processingAt;

      if (fulfilledId === session.id) {
        console.log(`[Webhook] SKIP (fulfilled): session ${session.id} already delivered.`);
        return res.status(200).json({ received: true, info: 'Duplicate session' });
      }

      if (processingId === session.id) {
        if (diff < 300) {
          console.log(`[Webhook] SKIP (recent processing): session ${session.id} is already in flight (${diff}s ago).`);
          return res.status(200).json({ received: true, info: 'Concurrent session' });
        } else {
          console.warn(`[Webhook] Stale recovery detected for session ${session.id}: Process was interrupted ${diff}s ago. Proceeding.`);
        }
      }

      // Metadata Audit
      console.log('[Metadata Audit] Session:', JSON.stringify(session.metadata || {}));
      console.log('[Metadata Audit] Customer:', customer ? JSON.stringify(customer.metadata || {}) : '(null)');
      console.log('[Metadata Audit] Subscription:', JSON.stringify(subscriptionMetadata));

      const rawTier = session.metadata?.tier || customer?.metadata?.tier || subscriptionMetadata?.tier || 'team';
      const tier = (rawTier === 'org') ? 'organization' : rawTier;

      const seatsRaw = session.metadata?.seats || customer?.metadata?.seats || subscriptionMetadata?.seats;
      const seatsParsed = parseInt(seatsRaw, 10);
      const seats = Number.isSafeInteger(seatsParsed) ? Math.min(500, Math.max(1, seatsParsed)) : (tier === 'team' ? 5 : 25);

      const customerEmail = session.customer_details?.email || session.customer_email || customer?.email;
      const customerName = session.customer_details?.name || customer?.name || '';
      const orgName = customerName || customerEmail || 'Customer';

      if (!customerEmail) {
        console.error('[Webhook] Permanent Error: No customer email found in session:', session.id);
        // Clear processing marker if it was set
        if (session.customer) {
          const freshCustomer = await stripe.customers.retrieve(session.customer);
          await stripe.customers.update(session.customer, {
            metadata: {
              ...freshCustomer.metadata,
              last_processing_session_id: '',
              last_processing_session_at: ''
            }
          });
        }
        return res.status(200).json({ received: true, warning: 'No email found' });
      }

      // 2. Mark as Processing (Timestamped)
      if (session.customer) {
        const freshCustomer = await stripe.customers.retrieve(session.customer);
        await stripe.customers.update(session.customer, {
          metadata: {
            ...freshCustomer.metadata,
            last_processing_session_id: session.id,
            last_processing_session_at: String(now)
          }
        });
      }

      // Fulfill if it's a one-time payment
      if (session.mode === 'payment') {
        const expiryDays = 90;
        const edition = (tier === 'org' || tier === 'organization') ? 'team' : tier;
        const licenseKey = generateLicenseKey(edition, orgName, seats, expiryDays, 0);

        console.log(`[Webhook] License generated. Sending email to ${customerEmail}...`);
        await sendLicenseEmail(customerEmail, customerName, tier, licenseKey, seats, expiryDays);
        console.log(`[Webhook] SUCCESS: Email sent to ${customerEmail}.`);

        // 3. Final Fulfillment Mark (Atomic & Data-Safe Merge)
        if (session.customer) {
          const finalCustomerFetch = await stripe.customers.retrieve(session.customer);
          await stripe.customers.update(session.customer, {
            metadata: {
              ...finalCustomerFetch.metadata,
              last_fulfilled_session_id: session.id,
              last_processing_session_id: '',
              last_processing_session_at: ''
            }
          });
        }

        console.log(`[Webhook] SUCCESS: One-time license delivered via session.completed → ${customerEmail}`);
      } else if (session.mode === 'subscription' && session.subscription) {
        // Fulfill subscription initial license directly here.
        // Stripe's invoice.paid fires with invoice.subscription=null during checkout creation,
        // so we cannot reliably use invoice.paid for initial delivery.
        // session.subscription is always present here.
        const sub = await stripe.subscriptions.retrieve(session.subscription);
        const now2 = Math.floor(Date.now() / 1000);
        const expiryTimestamp = sub.current_period_end;
        const expiryDays = Math.max(1, Math.ceil((expiryTimestamp - now2) / 86400));
        const edition = (tier === 'org' || tier === 'organization') ? 'team' : tier;

        const licenseKey = generateLicenseKey(edition, orgName, seats, expiryDays, 0);
        console.log(`[Webhook] Subscription license generated (${expiryDays} days). Sending to ${customerEmail}...`);
        await sendLicenseEmail(customerEmail, customerName, tier, licenseKey, seats, expiryDays);

        if (session.customer) {
          const finalCustomerFetch = await stripe.customers.retrieve(session.customer);
          await stripe.customers.update(session.customer, {
            metadata: {
              ...finalCustomerFetch.metadata,
              last_fulfilled_session_id: session.id,
              last_processing_session_id: '',
              last_processing_session_at: ''
            }
          });
        }
        console.log(`[Webhook] SUCCESS: Subscription license delivered via session.completed → ${customerEmail}`);
      } else {
        console.log(`[Webhook] Session mode=${session.mode}, no subscription — no action taken.`);
        if (session.customer) {
          const finalCustomerFetch = await stripe.customers.retrieve(session.customer);
          await stripe.customers.update(session.customer, {
            metadata: {
              ...finalCustomerFetch.metadata,
              last_processing_session_id: '',
              last_processing_session_at: ''
            }
          });
        }
      }
    } catch (err) {
      console.error('[Webhook] ERROR in session.completed handler:', err);

      // Precision Retry: Stripe types + all Nodemailer/Network failures
      const transientTypes = ['StripeRateLimitError', 'StripeAPIError', 'StripeConnectionError'];
      const isStripeTransient = transientTypes.includes(err.type);
      const isNodemailerTransient = !!(err.responseCode || err.command || err.response || err.code === 'ETIMEDOUT');
      const isNetworkTransient = ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT'].includes(err.code) || err.syscall === 'connect';

      if (isStripeTransient || isNodemailerTransient || isNetworkTransient || err.message?.includes('SMTP')) {
        return res.status(500).json({ error: 'Transient failure, retrying...' });
      }

      // Permanent failure cleanup (Fresh re-fetch for safety)
      try {
        if (session.customer) {
          const stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY);
          const currentCustomer = await stripeClient.customers.retrieve(session.customer);
          await stripeClient.customers.update(session.customer, {
            metadata: {
              ...currentCustomer.metadata,
              last_processing_session_id: '',
              last_processing_session_at: ''
            }
          });
        }
      } catch (e) { console.error('Failed to clear processing marker:', e); }

      return res.status(200).json({ received: true, error: 'Permanent failure' });
    }
  }

  // Handle subscription creation & renewals (invoice.paid)
  if (event.type === 'invoice.paid') {
    const invoice = event.data.object;

    // Stripe sometimes fires invoice.paid with invoice.subscription=null when the invoice is
    // created before the subscription is fully linked. Fall back to line items.
    const subscriptionId = invoice.subscription ||
      invoice.lines?.data?.find(line => line.subscription)?.subscription;

    console.log(`[Webhook] Handling invoice.paid for ${invoice.id}, reason: ${invoice.billing_reason}, subscription: ${subscriptionId} (invoice.subscription=${invoice.subscription})`);

    // Primary guard: must be tied to a subscription
    if (!subscriptionId) {
      console.log(`[Webhook] Skipping invoice.paid: No subscription ID found on invoice ${invoice.id} or its line items.`);
      return res.status(200).json({ received: true });
    }

    // Allow any billing_reason as long as we have a subscription
    const validReasons = ['subscription_create', 'subscription_cycle', 'subscription_update', 'subscription_threshold'];
    if (!validReasons.includes(invoice.billing_reason)) {
      console.log(`[Webhook] Note: Unusual billing_reason=${invoice.billing_reason} for subscription ${subscriptionId} — proceeding.`);
    }

    try {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { maxNetworkRetries: 2 });
      const [subscription, customer] = await Promise.all([
        stripe.subscriptions.retrieve(subscriptionId),
        invoice.customer ? stripe.customers.retrieve(invoice.customer) : Promise.resolve(null)
      ]);

      // 1. Recovery-Aware Idempotency Check with Stale Lock
      const fulfilledId = subscription?.metadata?.last_fulfilled_invoice_id;
      const processingId = subscription?.metadata?.last_processing_invoice_id;
      const processingAt = parseInt(subscription?.metadata?.last_processing_invoice_at || '0', 10);
      const now = Math.floor(Date.now() / 1000);
      const diff = now - processingAt;

      if (fulfilledId === invoice.id) {
        console.log(`[Webhook] SKIP (fulfilled): invoice ${invoice.id} already fulfilled.`);
        return res.status(200).json({ received: true, info: 'Duplicate invoice' });
      }

      if (processingId === invoice.id) {
        if (diff < 300) {
          console.log(`[Webhook] SKIP (recent processing): invoice ${invoice.id} is already in flight (${diff}s ago).`);
          return res.status(200).json({ received: true, info: 'Concurrent invoice' });
        } else {
          console.warn(`[Webhook] Stale recovery detected for invoice ${invoice.id}: Process was interrupted ${diff}s ago. Proceeding.`);
        }
      }

      // Metadata Audit for Invoices
      console.log('[Metadata Audit] Invoice:', JSON.stringify(invoice.metadata || {}));
      console.log('[Metadata Audit] Subscription:', JSON.stringify(subscription.metadata || {}));
      console.log('[Metadata Audit] Customer:', customer ? JSON.stringify(customer.metadata || {}) : '(null)');

      // Metadata extraction
      const rawTier = subscription.metadata?.tier || invoice.metadata?.tier || customer?.metadata?.tier || 'team';
      const tier = (rawTier === 'org') ? 'organization' : rawTier;

      const seatsRaw = subscription.metadata?.seats || invoice.metadata?.seats || customer?.metadata?.seats;
      const seatsParsed = parseInt(seatsRaw, 10);
      const seats = Number.isSafeInteger(seatsParsed) ? Math.min(500, Math.max(1, seatsParsed)) : (tier === 'team' ? 5 : 25);

      const renewalParsed = parseInt(subscription.metadata?.renewal_count || '0', 10);
      const renewalCount = Number.isSafeInteger(renewalParsed) ? renewalParsed : 0;

      const orgName = subscription.metadata?.org || customer?.name || customer?.email || 'Customer';
      const customerEmail = invoice.customer_email || customer?.email;
      const customerName = invoice.customer_name || customer?.name || '';

      if (!customerEmail) {
        console.error('[Webhook] Permanent Error: No email for invoice:', invoice.id);
        // Clear processing marker
        const finalSubFetch = await stripe.subscriptions.retrieve(subscriptionId);
        await stripe.subscriptions.update(subscriptionId, {
          metadata: {
            ...finalSubFetch.metadata,
            last_processing_invoice_id: '',
            last_processing_invoice_at: ''
          }
        });
        return res.status(200).json({ received: true, error: 'No email found' });
      }

      // 2. Mark as Processing (Metadata Merge + Timestamp)
      const freshSubBefore = await stripe.subscriptions.retrieve(subscriptionId);
      await stripe.subscriptions.update(subscriptionId, {
        metadata: {
          ...freshSubBefore.metadata,
          last_processing_invoice_id: invoice.id,
          last_processing_invoice_at: String(now)
        }
      });

      // Calculate Expiry (Fresh re-fetch to ensure period_end is accurate)
      const subForExpiry = await stripe.subscriptions.retrieve(subscriptionId);
      const expiryTimestamp = subForExpiry.current_period_end;
      const expiryDays = Math.max(1, Math.ceil((expiryTimestamp - now) / 86400));
      const edition = (tier === 'org' || tier === 'organization') ? 'team' : tier;

      // License keys & Email
      const licenseKey = generateLicenseKey(edition, orgName, seats, expiryDays, renewalCount);
      await sendLicenseEmail(customerEmail, customerName, tier, licenseKey, seats, expiryDays);

      // 3. Final atomic update: Marker + Renewal (Metadata Merge)
      const freshSubAfter = await stripe.subscriptions.retrieve(subscriptionId);

      const freshRenewalParsed = parseInt(freshSubAfter.metadata?.renewal_count || '0', 10);
      const freshRenewalCount = Number.isSafeInteger(freshRenewalParsed) ? freshRenewalParsed : 0;

      const updatedMetadata = {
        ...freshSubAfter.metadata,
        last_fulfilled_invoice_id: invoice.id,
        last_processing_invoice_id: '',
        last_processing_invoice_at: ''
      };
      if (invoice.billing_reason === 'subscription_cycle') {
        updatedMetadata.renewal_count = String(freshRenewalCount + 1);
      }

      await stripe.subscriptions.update(subscriptionId, { metadata: updatedMetadata });

      console.log(`[Webhook] SUCCESS: Subscription fulfilled/renewed (${invoice.billing_reason}) → ${customerEmail}`);
    } catch (err) {
      console.error('[Webhook] ERROR in invoice.paid fulfillment:', err);

      // Precision Retry: Stripe types + all Nodemailer/Network failures
      const transientTypes = ['StripeRateLimitError', 'StripeAPIError', 'StripeConnectionError'];
      const isStripeTransient = transientTypes.includes(err.type);
      const isNodemailerTransient = !!(err.responseCode || err.command || err.response || err.code === 'ETIMEDOUT');
      const isNetworkTransient = ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT'].includes(err.code) || err.syscall === 'connect';

      if (isStripeTransient || isNodemailerTransient || isNetworkTransient || err.message?.includes('SMTP')) {
        return res.status(500).json({ error: 'Transient failure, retrying...' });
      }

      // Permanent failure cleanup (Fresh re-fetch for safety)
      try {
        if (subscriptionId) {
          const stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY);
          const freshSubCleanup = await stripeClient.subscriptions.retrieve(subscriptionId);
          await stripeClient.subscriptions.update(subscriptionId, {
            metadata: {
              ...freshSubCleanup.metadata,
              last_processing_invoice_id: '',
              last_processing_invoice_at: ''
            }
          });
        }
      } catch (e) { console.error('Failed to clear processing marker:', e); }

      return res.status(200).json({ received: true, error: 'Permanent failure' });
    }
  }

  return res.status(200).json({ received: true });
}
