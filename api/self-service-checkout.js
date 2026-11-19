import Stripe from 'stripe';
import { SELF_SERVICE_VERSION, SELF_SERVICE_OFFERS, selfServicePriceMatches } from './lib/webhook-logic.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (process.env.SELF_SERVICE_ENABLED !== 'true')
    return res.status(503).json({ error: 'Self-service checkout is not yet available.' });
  const { tier, termsAccepted, offerVersion } = req.body || {};
  const offer = Object.hasOwn(SELF_SERVICE_OFFERS, tier || '') && SELF_SERVICE_OFFERS[tier];
  if (!offer) return res.status(400).json({ error: 'Choose Team or Organization.' });
  if (termsAccepted !== true || offerVersion !== SELF_SERVICE_VERSION)
    return res.status(400).json({ error: 'Please accept the current self-service terms.' });
  try {
    const siteUrl = process.env.VERCEL_ENV === 'preview' && process.env.VERCEL_URL
      ? 'https://' + process.env.VERCEL_URL : process.env.SITE_URL;
    if (!process.env.STRIPE_SECRET_KEY || !siteUrl)
      throw new Error('Missing checkout configuration');
    if (process.env.VERCEL_ENV === 'preview' && !process.env.STRIPE_SECRET_KEY.startsWith('sk_test_'))
      throw new Error('Preview requires Stripe test mode');
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const override = process.env[offer.priceEnv];
    const price = override ? await stripe.prices.retrieve(override)
      : (await stripe.prices.list({ lookup_keys: [offer.lookupKey], active: true, limit: 2 })).data?.[0];
    if (!selfServicePriceMatches(price, tier)) throw new Error('Self-service price is not configured correctly');
    const site = siteUrl.replace(/\/$/, '');
    const termsUrl = site + '/self-service-terms-2026-11-18.html';
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ price: price.id, quantity: 1 }],
      metadata: {
        tier, seats: String(offer.seats), fulfillment_version: 'one_time_v1',
        purchase_price_id: price.id, offer_family: 'self_service',
        offer_version: SELF_SERVICE_VERSION, terms_accepted: SELF_SERVICE_VERSION,
      },
      consent_collection: { terms_of_service: 'required' },
      custom_text: { terms_of_service_acceptance: {
        message: 'I agree to the [Self-Service Terms](' + termsUrl +
          '): 3,650 days, all edition updates, no technical support or onboarding, full refund on request within 14 days of payment.',
      } },
      success_url: site + '/index.html#purchase-success',
      cancel_url: site + '/index.html#pricing',
      billing_address_collection: 'required',
    });
    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Self-service checkout:', err.message);
    return res.status(503).json({ error: 'Checkout is temporarily unavailable. Email hello@ragvault.net.' });
  }
}
