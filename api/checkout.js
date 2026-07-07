import Stripe from 'stripe';

// tier + billing period → Stripe lookup key (canonical keys set on the prices
// in Stripe; survive price rotation because new prices inherit the lookup key)
const LOOKUP_KEYS = {
  team: { annual: 'team_annual', perpetual: 'team_perpetual' },
  organization: { annual: 'org_annual', perpetual: 'org_perpetual' },
};

// STRIPE_PRICE_* env vars act as explicit overrides; lookup-key resolution is
// the default mechanism when the override is unset
const PRICE_ENV_OVERRIDES = {
  team_annual: 'STRIPE_PRICE_TEAM_ANNUAL',
  team_perpetual: 'STRIPE_PRICE_TEAM_PERPETUAL',
  org_annual: 'STRIPE_PRICE_ORG_ANNUAL',
  org_perpetual: 'STRIPE_PRICE_ORG_PERPETUAL',
};

// Module-scope cache so warm serverless invocations skip the prices.list
// call; entries expire after a TTL so a price rotation is picked up without
// a redeploy
const PRICE_CACHE_TTL_MS = 10 * 60 * 1000;
const priceCache = {};

/**
 * Resolve the Stripe price for a lookup key.
 * Returns `{ id, price }` — `price` is the full Stripe price object when it
 * came from prices.list, or null when an env override supplied only the ID.
 * Returns null when no active price exists for the lookup key.
 */
async function resolvePrice(stripe, lookupKey) {
  const override = process.env[PRICE_ENV_OVERRIDES[lookupKey]];
  if (override) {
    return { id: override, price: null };
  }
  const cached = priceCache[lookupKey];
  if (cached && Date.now() - cached.fetchedAt < PRICE_CACHE_TTL_MS) {
    return { id: cached.price.id, price: cached.price };
  }
  const { data } = await stripe.prices.list({ lookup_keys: [lookupKey], active: true });
  if (!data || data.length === 0) {
    return null;
  }
  priceCache[lookupKey] = { price: data[0], fetchedAt: Date.now() };
  return { id: data[0].id, price: data[0] };
}

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

    const { tier: tierInput, seats: seatsInput, billing: billingInput } = req.body || {};

    // Normalize tier: org -> organization
    const tier = (tierInput === 'org') ? 'organization' : tierInput;

    // Normalize billing: default to annual for backward compat
    const billing = (billingInput === 'perpetual') ? 'perpetual' : 'annual';

    if (!tier || !LOOKUP_KEYS[tier]) {
      return res.status(400).json({
        error: `Invalid tier. Must be one of: ${Object.keys(LOOKUP_KEYS).join(', ')}`,
      });
    }

    // Validation: Coerce seats to a positive integer and clamp (min 1, max 500)
    let seats = parseInt(seatsInput || (tier === 'team' ? 5 : 25), 10);
    seats = Number.isSafeInteger(seats) ? Math.min(500, Math.max(1, seats)) : (tier === 'team' ? 5 : 25);

    const resolved = await resolvePrice(stripe, LOOKUP_KEYS[tier][billing]);
    if (!resolved) {
      return res.status(500).json({
        error: `Price not configured for tier: ${tier}, billing: ${billing}. Contact hello@ragvault.net`,
      });
    }
    const priceId = resolved.id;

    // Mode Detection: Auto-detect if price is recurring, reusing the price
    // object from lookup-key resolution when available
    const price = resolved.price || await stripe.prices.retrieve(priceId);
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
