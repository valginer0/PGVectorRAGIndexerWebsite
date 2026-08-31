// Pure business logic extracted from webhook.js for testability.
// No external dependencies — no Stripe, no SMTP, no crypto, no env vars.

/**
 * Normalize tier shorthand: 'org' → 'organization', everything else passthrough.
 */
export function normalizeTier(rawTier) {
  // Lowercased and trimmed because tiers also arrive as hand-entered Stripe
  // metadata during manual Enterprise fulfilment, where 'Organization' is at
  // least as likely as 'organization'. Case used to fall through to the
  // default and silently under-provision.
  const raw = typeof rawTier === 'string' ? rawTier.trim().toLowerCase() : rawTier;
  return raw === 'org' ? 'organization' : raw;
}

/**
 * Resolve tier from multiple metadata sources (session, customer, subscription).
 * Falls back to 'team' if none found.
 */
export function resolveTier(sessionMeta, customerMeta, subscriptionMeta) {
  const raw = sessionMeta?.tier || customerMeta?.tier || subscriptionMeta?.tier || 'team';
  return normalizeTier(raw);
}

/**
 * Maximum seats each self-serve tier is entitled to.
 *
 * These are the numbers the pricing page sells and the only ones a paid
 * checkout may mint. Larger deployments stack multiple Organization licences
 * (see docs/LARGE_ORG_LICENSING.md) rather than inflating a single key.
 */
export const TIER_SEAT_LIMITS = Object.freeze({
  team: 5,
  organization: 25,
  // Enterprise is not self-serve: it is quoted, then fulfilled by hand by
  // setting Stripe metadata. It still needs an entry here, because without one
  // a 100-seat Enterprise deal silently minted a 5-seat licence — a valid,
  // signed, wrong licence, which is worse than an error. 500 is the negotiated
  // ceiling, matching the outer bound the code allowed before seats were
  // capped by tier.
  enterprise: 500,
});

/**
 * The `edition` claim to put in a licence for a given commercial tier.
 *
 * These are not the same vocabulary. The product recognizes exactly three
 * editions — license.py rejects anything else outright with
 * "Invalid edition in license key" — while the pricing page sells four tiers.
 * Enterprise is a commercial tier, not an edition: everything it advertises
 * (SSO/SAML, RBAC, retention policies) ships in the Organization edition.
 *
 * Minting `edition: 'enterprise'` therefore produces a correctly signed key
 * that the server refuses to load, so the buyer gets an email containing a
 * licence that cannot work.
 */
export function editionForTier(tier) {
  const normalized = normalizeTier(tier);
  if (normalized === 'enterprise') return 'organization';
  return normalized;
}

/**
 * Seats a tier is entitled to, or undefined if the tier is not recognized.
 */
export function maxSeatsForTier(tier) {
  return TIER_SEAT_LIMITS[normalizeTier(tier)];
}

/**
 * Resolve the seat count for a licence, capped by what the tier actually buys.
 *
 * The raw value originates in the browser and travels through Stripe metadata,
 * so it is attacker-controlled at both ends. It previously was clamped only to
 * [1, 500] with no reference to the tier, which meant a crafted
 * `POST /api/checkout {tier:'team', seats:500}` paid the $299 Team price and
 * minted a 500-seat licence. Cap against the tier, here and at the call site
 * that builds the checkout session — never trust the round trip.
 */
export function resolveSeats(seatsRaw, tier) {
  const limit = maxSeatsForTier(tier);
  if (limit === undefined) {
    // Never guess an entitlement. Falling back to the smallest tier would
    // email a correctly-signed licence carrying the wrong number, and the
    // buyer would have no way to tell. Both webhook call sites run inside a
    // try that logs a permanent failure and returns 200, so this surfaces the
    // mistake without triggering endless Stripe retries.
    throw new Error(
      `Unknown tier "${tier}" — refusing to guess a seat entitlement. ` +
      `Known tiers: ${Object.keys(TIER_SEAT_LIMITS).join(', ')}.`
    );
  }
  const parsed = parseInt(seatsRaw, 10);
  if (Number.isSafeInteger(parsed)) {
    return Math.min(limit, Math.max(1, parsed));
  }
  return limit;
}

/**
 * Validate `days` for license generation.
 * Returns a finite positive number (≥ 1), or 90 as fallback.
 */
export function validateDays(days) {
  const n = Number(days);
  return Number.isFinite(n) && n >= 1 ? n : 90;
}

/**
 * Extract current_period_end from a Stripe subscription object.
 * Newer Stripe API versions (2024+) moved this field from the subscription
 * top-level to the subscription *item* level.
 *
 * @param {object} sub - Stripe subscription object (or partial mock)
 * @returns {number|undefined} Unix timestamp or undefined
 */
export function getSubscriptionPeriodEnd(sub) {
  if (sub.current_period_end) return sub.current_period_end;
  const itemEnd = sub.items?.data?.[0]?.current_period_end;
  if (itemEnd) return itemEnd;
  if (sub.billing_cycle_anchor && sub.plan?.interval === 'year') {
    const years = sub.plan.interval_count || 1;
    return sub.billing_cycle_anchor + (years * 365.25 * 86400);
  }
  return undefined;
}

/**
 * Compute expiry days from a period-end timestamp relative to `now`.
 * Returns at least 1 day.
 */
export function computeExpiryDays(periodEndTimestamp, nowTimestamp) {
  return Math.max(1, Math.ceil((periodEndTimestamp - nowTimestamp) / 86400));
}

/**
 * Idempotency check result.
 * @typedef {'proceed' | 'skip_fulfilled' | 'skip_concurrent' | 'stale_recovery'} IdempotencyAction
 */

/**
 * Determine whether to proceed, skip, or recover based on idempotency markers.
 *
 * @param {string} currentId - The session/invoice ID being processed
 * @param {string|undefined} fulfilledId - Last fulfilled session/invoice ID
 * @param {string|undefined} processingId - Last processing session/invoice ID
 * @param {number} processingAt - Unix timestamp when processing started
 * @param {number} now - Current unix timestamp
 * @param {number} [staleSecs=300] - Seconds after which a processing lock is considered stale
 * @returns {IdempotencyAction}
 */
export function checkIdempotency(currentId, fulfilledId, processingId, processingAt, now, staleSecs = 300) {
  if (fulfilledId === currentId) return 'skip_fulfilled';
  if (processingId === currentId) {
    const diff = now - processingAt;
    if (diff < staleSecs) return 'skip_concurrent';
    return 'stale_recovery';
  }
  return 'proceed';
}

/**
 * Classify an error as transient (should retry) or permanent.
 */
export function isTransientError(err) {
  const transientTypes = ['StripeRateLimitError', 'StripeAPIError', 'StripeConnectionError'];
  if (transientTypes.includes(err.type)) return true;
  if (err.responseCode || err.command || err.response || err.code === 'ETIMEDOUT') return true;
  if (['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT'].includes(err.code) || err.syscall === 'connect') return true;
  if (err.message?.includes('SMTP')) return true;
  return false;
}
