import { describe, it, expect } from 'vitest';
import {
  normalizeTier,
  resolveTier,
  resolveSeats,
  validateDays,
  getSubscriptionPeriodEnd,
  computeExpiryDays,
  checkIdempotency,
  isTransientError,
} from './webhook-logic.js';

// ---------------------------------------------------------------------------
// normalizeTier
// ---------------------------------------------------------------------------
describe('normalizeTier', () => {
  it('converts "org" to "organization"', () => {
    expect(normalizeTier('org')).toBe('organization');
  });

  it('passes through "team" unchanged', () => {
    expect(normalizeTier('team')).toBe('team');
  });

  it('passes through "organization" unchanged', () => {
    expect(normalizeTier('organization')).toBe('organization');
  });

  it('passes through unknown tiers unchanged', () => {
    expect(normalizeTier('enterprise')).toBe('enterprise');
  });
});

// ---------------------------------------------------------------------------
// resolveTier
// ---------------------------------------------------------------------------
describe('resolveTier', () => {
  it('prefers session metadata', () => {
    expect(resolveTier({ tier: 'org' }, { tier: 'team' }, { tier: 'team' })).toBe('organization');
  });

  it('falls back to customer metadata', () => {
    expect(resolveTier({}, { tier: 'org' }, { tier: 'team' })).toBe('organization');
  });

  it('falls back to subscription metadata', () => {
    expect(resolveTier({}, {}, { tier: 'team' })).toBe('team');
  });

  it('defaults to "team" when no metadata', () => {
    expect(resolveTier({}, {}, {})).toBe('team');
  });

  it('defaults to "team" when all sources are null/undefined', () => {
    expect(resolveTier(null, null, null)).toBe('team');
  });
});

// ---------------------------------------------------------------------------
// resolveSeats
// ---------------------------------------------------------------------------
describe('resolveSeats', () => {
  it('parses valid integer string', () => {
    expect(resolveSeats('10', 'team')).toBe(10);
  });

  it('clamps to minimum 1', () => {
    expect(resolveSeats('0', 'team')).toBe(1);
    expect(resolveSeats('-5', 'team')).toBe(1);
  });

  it('clamps to maximum 500', () => {
    expect(resolveSeats('999', 'team')).toBe(500);
  });

  it('defaults to 5 for team when invalid', () => {
    expect(resolveSeats(undefined, 'team')).toBe(5);
    expect(resolveSeats('abc', 'team')).toBe(5);
    expect(resolveSeats(NaN, 'team')).toBe(5);
  });

  it('defaults to 25 for organization when invalid', () => {
    expect(resolveSeats(undefined, 'organization')).toBe(25);
    expect(resolveSeats('abc', 'organization')).toBe(25);
  });

  it('handles numeric input (not just strings)', () => {
    expect(resolveSeats(15, 'team')).toBe(15);
  });
});

// ---------------------------------------------------------------------------
// validateDays
// ---------------------------------------------------------------------------
describe('validateDays', () => {
  it('returns number for valid numeric input', () => {
    expect(validateDays(365)).toBe(365);
    expect(validateDays('365')).toBe(365);
    expect(validateDays(3650)).toBe(3650);
  });

  it('returns 90 for NaN', () => {
    expect(validateDays(NaN)).toBe(90);
  });

  it('returns 90 for undefined', () => {
    expect(validateDays(undefined)).toBe(90);
  });

  it('returns 90 for null (0 is not a valid license duration)', () => {
    expect(validateDays(null)).toBe(90);
  });

  it('returns 90 for non-numeric string', () => {
    expect(validateDays('abc')).toBe(90);
  });

  it('returns 90 for Infinity', () => {
    expect(validateDays(Infinity)).toBe(90);
  });

  it('returns 90 for zero (not a valid license duration)', () => {
    expect(validateDays(0)).toBe(90);
  });

  it('returns 90 for negative values', () => {
    expect(validateDays(-5)).toBe(90);
  });
});

// ---------------------------------------------------------------------------
// getSubscriptionPeriodEnd
// ---------------------------------------------------------------------------
describe('getSubscriptionPeriodEnd', () => {
  it('returns top-level current_period_end (legacy API)', () => {
    const sub = { current_period_end: 1700000000 };
    expect(getSubscriptionPeriodEnd(sub)).toBe(1700000000);
  });

  it('returns item-level current_period_end (new API)', () => {
    const sub = {
      items: { data: [{ current_period_end: 1700000000 }] },
    };
    expect(getSubscriptionPeriodEnd(sub)).toBe(1700000000);
  });

  it('prefers top-level over item-level', () => {
    const sub = {
      current_period_end: 1700000000,
      items: { data: [{ current_period_end: 1800000000 }] },
    };
    expect(getSubscriptionPeriodEnd(sub)).toBe(1700000000);
  });

  it('computes from billing_cycle_anchor for yearly plans', () => {
    const anchor = 1700000000;
    const sub = {
      billing_cycle_anchor: anchor,
      plan: { interval: 'year', interval_count: 1 },
    };
    const expected = anchor + (1 * 365.25 * 86400);
    expect(getSubscriptionPeriodEnd(sub)).toBe(expected);
  });

  it('computes multi-year from billing_cycle_anchor', () => {
    const anchor = 1700000000;
    const sub = {
      billing_cycle_anchor: anchor,
      plan: { interval: 'year', interval_count: 2 },
    };
    const expected = anchor + (2 * 365.25 * 86400);
    expect(getSubscriptionPeriodEnd(sub)).toBe(expected);
  });

  it('does not compute for monthly plans', () => {
    const sub = {
      billing_cycle_anchor: 1700000000,
      plan: { interval: 'month', interval_count: 1 },
    };
    expect(getSubscriptionPeriodEnd(sub)).toBeUndefined();
  });

  it('returns undefined when no data available', () => {
    expect(getSubscriptionPeriodEnd({})).toBeUndefined();
  });

  it('handles empty items array', () => {
    const sub = { items: { data: [] } };
    expect(getSubscriptionPeriodEnd(sub)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// computeExpiryDays
// ---------------------------------------------------------------------------
describe('computeExpiryDays', () => {
  it('computes correct days for a year', () => {
    const now = 1700000000;
    const end = now + 365 * 86400;
    expect(computeExpiryDays(end, now)).toBe(365);
  });

  it('returns at least 1 even for past timestamps', () => {
    const now = 1700000000;
    const end = now - 86400; // 1 day ago
    expect(computeExpiryDays(end, now)).toBe(1);
  });

  it('rounds up partial days', () => {
    const now = 1700000000;
    const end = now + 86400 + 1; // 1 day + 1 second
    expect(computeExpiryDays(end, now)).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// checkIdempotency
// ---------------------------------------------------------------------------
describe('checkIdempotency', () => {
  const now = 1700000000;

  it('returns "skip_fulfilled" when session was already fulfilled', () => {
    expect(checkIdempotency('sess_1', 'sess_1', undefined, 0, now)).toBe('skip_fulfilled');
  });

  it('returns "skip_concurrent" when recently processing', () => {
    // Processing started 60 seconds ago (< 300s stale threshold)
    expect(checkIdempotency('sess_1', undefined, 'sess_1', now - 60, now)).toBe('skip_concurrent');
  });

  it('returns "stale_recovery" when processing is stale', () => {
    // Processing started 600 seconds ago (> 300s stale threshold)
    expect(checkIdempotency('sess_1', undefined, 'sess_1', now - 600, now)).toBe('stale_recovery');
  });

  it('returns "proceed" for a new session', () => {
    expect(checkIdempotency('sess_new', 'sess_old', 'sess_other', now - 10, now)).toBe('proceed');
  });

  it('returns "proceed" when no markers exist', () => {
    expect(checkIdempotency('sess_1', undefined, undefined, 0, now)).toBe('proceed');
  });

  it('respects custom stale threshold', () => {
    // Processing started 100s ago, custom threshold 60s → stale
    expect(checkIdempotency('sess_1', undefined, 'sess_1', now - 100, now, 60)).toBe('stale_recovery');
    // Same but threshold 200s → still concurrent
    expect(checkIdempotency('sess_1', undefined, 'sess_1', now - 100, now, 200)).toBe('skip_concurrent');
  });

  it('fulfilled takes priority over processing', () => {
    // Same ID in both fulfilled and processing — fulfilled wins
    expect(checkIdempotency('sess_1', 'sess_1', 'sess_1', now - 10, now)).toBe('skip_fulfilled');
  });
});

// ---------------------------------------------------------------------------
// isTransientError
// ---------------------------------------------------------------------------
describe('isTransientError', () => {
  it('identifies Stripe rate limit errors', () => {
    expect(isTransientError({ type: 'StripeRateLimitError' })).toBe(true);
  });

  it('identifies Stripe API errors', () => {
    expect(isTransientError({ type: 'StripeAPIError' })).toBe(true);
  });

  it('identifies Stripe connection errors', () => {
    expect(isTransientError({ type: 'StripeConnectionError' })).toBe(true);
  });

  it('identifies ETIMEDOUT errors', () => {
    expect(isTransientError({ code: 'ETIMEDOUT' })).toBe(true);
  });

  it('identifies ECONNRESET errors', () => {
    expect(isTransientError({ code: 'ECONNRESET' })).toBe(true);
  });

  it('identifies ECONNREFUSED errors', () => {
    expect(isTransientError({ code: 'ECONNREFUSED' })).toBe(true);
  });

  it('identifies network connect errors', () => {
    expect(isTransientError({ syscall: 'connect' })).toBe(true);
  });

  it('identifies Nodemailer errors with responseCode', () => {
    expect(isTransientError({ responseCode: 421 })).toBe(true);
  });

  it('identifies SMTP errors by message', () => {
    expect(isTransientError({ message: 'SMTP connection timeout' })).toBe(true);
  });

  it('returns false for permanent errors', () => {
    expect(isTransientError({ message: 'Invalid API key' })).toBe(false);
    expect(isTransientError({ type: 'StripeAuthenticationError' })).toBe(false);
    expect(isTransientError({})).toBe(false);
  });
});
