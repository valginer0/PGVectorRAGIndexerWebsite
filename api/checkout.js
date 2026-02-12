import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Stripe Price IDs — set these in Vercel env vars after creating products in Stripe
const PRICE_MAP = {
  team: process.env.STRIPE_PRICE_TEAM,
  organization: process.env.STRIPE_PRICE_ORG,
};

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

  try {
    const { tier, seats } = req.body;

    if (!tier || !PRICE_MAP[tier]) {
      return res.status(400).json({
        error: `Invalid tier. Must be one of: ${Object.keys(PRICE_MAP).join(', ')}`,
      });
    }

    const priceId = PRICE_MAP[tier];
    if (!priceId) {
      return res.status(500).json({
        error: `Price ID not configured for tier: ${tier}. Contact support.`,
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      metadata: {
        tier,
        seats: String(seats || (tier === 'team' ? 5 : 25)),
      },
      success_url: `${process.env.SITE_URL || 'https://www.ragvault.net'}/index.html#purchase-success`,
      cancel_url: `${process.env.SITE_URL || 'https://www.ragvault.net'}/index.html#pricing`,
      // Collect customer email for license delivery
      customer_email: undefined, // Let Stripe collect it
      billing_address_collection: 'required',
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Checkout error:', err);
    return res.status(500).json({ error: 'Failed to create checkout session' });
  }
}
