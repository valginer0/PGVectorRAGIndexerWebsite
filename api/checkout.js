import Stripe from 'stripe';

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', process.env.SITE_URL || 'https://www.ragvault.net');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    console.error('STRIPE_SECRET_KEY is not set');
    return res.status(500).json({ error: 'Payment system not configured. Email hello@ragvault.net' });
  }

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

    const isProduction = process.env.NODE_ENV === 'production' || (process.env.SITE_URL && process.env.SITE_URL.includes('ragvault.net'));
    const PRICE_TEAM_YEARLY = isProduction ? 'price_1T3aT6Rc9V96VoFQxazszs8E' : null;
    const PRICE_ORG_YEARLY = isProduction ? 'price_1T1iKDRc9V96VoFQupw5Wlaa' : null;

    const { tier: tierInput, seats: seatsInput } = req.body || {};

    // Normalize tier: org -> organization
    const tier = (tierInput === 'org') ? 'organization' : tierInput;

    const PRICE_MAP = {
      team: process.env.STRIPE_PRICE_TEAM || PRICE_TEAM_YEARLY,
      organization: process.env.STRIPE_PRICE_ORG || PRICE_ORG_YEARLY,
    };

    if (!tier || !PRICE_MAP[tier]) {
      return res.status(400).json({
        error: `Invalid tier. Must be one of: ${Object.keys(PRICE_MAP).join(', ')}`,
      });
    }

    // Validation: Coerce seats to a positive integer and clamp (min 1, max 500)
    let seats = parseInt(seatsInput || (tier === 'team' ? 5 : 25), 10);
    seats = Number.isSafeInteger(seats) ? Math.min(500, Math.max(1, seats)) : (tier === 'team' ? 5 : 25);

    const priceId = PRICE_MAP[tier];
    if (!priceId) {
      return res.status(500).json({
        error: `Price ID not configured for tier: ${tier}. Contact hello@ragvault.net`,
      });
    }


    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      metadata: {
        tier,
        seats: String(seats),
      },
      subscription_data: {
        metadata: {
          tier,
          seats: String(seats),
        },
      },
      success_url: `${process.env.SITE_URL || 'https://www.ragvault.net'}/index.html#purchase-success`,
      cancel_url: `${process.env.SITE_URL || 'https://www.ragvault.net'}/index.html#pricing`,
      billing_address_collection: 'required',
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    const msg = err.message || err;
    console.error('Checkout error:', msg);
    return res.status(500).json({ error: `Checkout Error: ${msg}. Email hello@ragvault.net` });
  }
}
