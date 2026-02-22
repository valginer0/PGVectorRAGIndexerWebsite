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

    const PRICE_MAP = {
      team: process.env.STRIPE_PRICE_TEAM,
      organization: process.env.STRIPE_PRICE_ORG,
    };

    const { tier, seats: seatsInput } = req.body || {};

    if (!tier || !PRICE_MAP[tier]) {
      return res.status(400).json({
        error: `Invalid tier. Must be one of: ${Object.keys(PRICE_MAP).join(', ')}`,
      });
    }

    // Validation: Coerce seats to a positive integer and clamp (min 1)
    const seats = Math.max(1, parseInt(seatsInput || (tier === 'team' ? 5 : 25), 10));

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
    console.error('Checkout error:', err.message || err);
    return res.status(500).json({ error: 'Failed to create checkout session. Email hello@ragvault.net' });
  }
}
