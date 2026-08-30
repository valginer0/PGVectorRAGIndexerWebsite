// Pure business logic extracted from webhook.js for testability.
// No external dependencies — no Stripe, no SMTP, no crypto, no env vars.

/**
 * Normalize tier shorthand: 'org' → 'organization', everything else passthrough.
 */
export function normalizeTier(rawTier) {
  return rawTier === 'org' ? 'organization' : rawTier;
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
});

/**
 * Seats a tier is entitled to. Unknown tiers get the most restrictive limit.
 */
export function maxSeatsForTier(tier) {
  return TIER_SEAT_LIMITS[normalizeTier(tier)] ?? TIER_SEAT_LIMITS.team;
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
