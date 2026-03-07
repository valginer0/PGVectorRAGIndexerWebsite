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

    // Legacy hardcoded annual price IDs (fallback only)
    const LEGACY_TEAM_ANNUAL = isProduction ? 'price_1T3aT6Rc9V96VoFQxazszs8E' : null;
    const LEGACY_ORG_ANNUAL = isProduction ? 'price_1T1iKDRc9V96VoFQupw5Wlaa' : null;

    const { tier: tierInput, seats: seatsInput, billing: billingInput } = req.body || {};

    // Normalize tier: org -> organization
    const tier = (tierInput === 'org') ? 'organization' : tierInput;

    // Normalize billing: default to annual for backward compat
    const billing = (billingInput === 'perpetual') ? 'perpetual' : 'annual';

    const PRICE_MAP = {
      team: {
        annual:    process.env.STRIPE_PRICE_TEAM_ANNUAL    || process.env.STRIPE_PRICE_TEAM || LEGACY_TEAM_ANNUAL,
        perpetual: process.env.STRIPE_PRICE_TEAM_PERPETUAL || null,
      },
      organization: {
        annual:    process.env.STRIPE_PRICE_ORG_ANNUAL     || process.env.STRIPE_PRICE_ORG  || LEGACY_ORG_ANNUAL,
        perpetual: process.env.STRIPE_PRICE_ORG_PERPETUAL  || null,
      },
    };

    if (!tier || !PRICE_MAP[tier]) {
      return res.status(400).json({
        error: `Invalid tier. Must be one of: ${Object.keys(PRICE_MAP).join(', ')}`,
      });
    }

    // Validation: Coerce seats to a positive integer and clamp (min 1, max 500)
    let seats = parseInt(seatsInput || (tier === 'team' ? 5 : 25), 10);
    seats = Number.isSafeInteger(seats) ? Math.min(500, Math.max(1, seats)) : (tier === 'team' ? 5 : 25);

    const priceId = PRICE_MAP[tier]?.[billing];
    if (!priceId) {
      return res.status(500).json({
        error: `Price ID not configured for tier: ${tier}. Contact hello@ragvault.net`,
      });
    }


    // 4. Mode Detection: Auto-detect if price is recurring
    const price = await stripe.prices.retrieve(priceId);
    const isRecurring = !!price.recurring;
    const checkoutMode = isRecurring ? 'subscription' : 'payment';

    const sessionOptions = {
      mode: checkoutMode,
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
      success_url: `${process.env.SITE_URL || 'https://www.ragvault.net'}/index.html#purchase-success`,
      cancel_url: `${process.env.SITE_URL || 'https://www.ragvault.net'}/index.html#pricing`,
      billing_address_collection: 'required',
      allow_promotion_codes: true,
    };

    // Add subscription-specific data only if in subscription mode
    if (checkoutMode === 'subscription') {
      sessionOptions.subscription_data = {
        metadata: {
          tier,
          seats: String(seats),
        },
      };
    }

    const session = await stripe.checkout.sessions.create(sessionOptions);

    return res.status(200).json({ url: session.url });
  } catch (err) {
    const msg = err.message || err;
    console.error('Checkout error:', msg);
    return res.status(500).json({ error: `Checkout Error: ${msg}. Email hello@ragvault.net` });
  }
}
