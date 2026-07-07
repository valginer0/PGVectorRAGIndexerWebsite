import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Stripe mock — intercepts `new Stripe(...)` and all API calls
// ---------------------------------------------------------------------------
const mockPricesList = vi.fn();
const mockPricesRetrieve = vi.fn();
const mockSessionsCreate = vi.fn();

vi.mock('stripe', () => {
  // Must use `function` (not arrow) so it works with `new Stripe(...)`
  function MockStripe() {
    return {
      prices: { list: mockPricesList, retrieve: mockPricesRetrieve },
      checkout: { sessions: { create: mockSessionsCreate } },
    };
  }
  return { default: MockStripe };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a fake Vercel req with a pre-parsed JSON body. */
function fakeReq(body, { method = 'POST' } = {}) {
  return { method, body, headers: {} };
}

/** Create a fake Vercel res with chainable status().json(). */
function fakeRes() {
  const res = {
    _status: null,
    _json: null,
    _ended: false,
    _headers: {},
    setHeader(name, value) { res._headers[name] = value; },
    status(code) { res._status = code; return res; },
    json(data) { res._json = data; return res; },
    end() { res._ended = true; return res; },
  };
  return res;
}

/**
 * Import a fresh copy of the handler so each test starts with a cold
 * module-scope price cache.
 */
async function freshHandler() {
  vi.resetModules();
  const { default: handler } = await import('./checkout.js');
  return handler;
}

const PRICE_ENV_VARS = [
  'STRIPE_PRICE_TEAM_ANNUAL',
  'STRIPE_PRICE_TEAM_PERPETUAL',
  'STRIPE_PRICE_ORG_ANNUAL',
  'STRIPE_PRICE_ORG_PERPETUAL',
];

// ---------------------------------------------------------------------------
// Set env vars
// ---------------------------------------------------------------------------
beforeEach(() => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_fake';
  process.env.SITE_URL = 'https://test.example.com';
  for (const name of PRICE_ENV_VARS) delete process.env[name];

  vi.clearAllMocks();
  mockSessionsCreate.mockResolvedValue({ url: 'https://checkout.stripe.com/c/pay/cs_test_123' });
});

afterEach(() => {
  vi.useRealTimers();
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.SITE_URL;
  for (const name of PRICE_ENV_VARS) delete process.env[name];
});

// ===========================================================================
// Tests
// ===========================================================================

describe('checkout handler — request validation', () => {
  it('rejects non-POST with 405', async () => {
    const handler = await freshHandler();
    const res = fakeRes();
    await handler(fakeReq({}, { method: 'GET' }), res);
    expect(res._status).toBe(405);
    expect(res._json.error).toMatch(/method not allowed/i);
  });

  it('returns 400 for an unknown tier', async () => {
    const handler = await freshHandler();
    const res = fakeRes();
    await handler(fakeReq({ tier: 'enterprise' }), res);
    expect(res._status).toBe(400);
    expect(res._json.error).toMatch(/invalid tier/i);
    expect(mockPricesList).not.toHaveBeenCalled();
  });
});

describe('checkout handler — lookup-key resolution', () => {
  it('resolves the price via lookup key and creates a subscription session', async () => {
    mockPricesList.mockResolvedValue({
      data: [{ id: 'price_lookup_team_annual', recurring: { interval: 'year' } }],
    });
    const handler = await freshHandler();
    const res = fakeRes();
    await handler(fakeReq({ tier: 'team', billing: 'annual' }), res);

    expect(res._status).toBe(200);
    expect(res._json.url).toMatch(/^https:\/\/checkout\.stripe\.com/);
    expect(mockPricesList).toHaveBeenCalledWith({ lookup_keys: ['team_annual'], active: true });
    // Price object from prices.list is reused — no second retrieve call
    expect(mockPricesRetrieve).not.toHaveBeenCalled();
    expect(mockSessionsCreate).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'subscription',
      line_items: [{ price: 'price_lookup_team_annual', quantity: 1 }],
      subscription_data: { metadata: { tier: 'team', seats: '5' } },
    }));
  });

  it('maps organization/perpetual to org_perpetual and uses payment mode for one-time prices', async () => {
    mockPricesList.mockResolvedValue({
      data: [{ id: 'price_lookup_org_perp', recurring: null }],
    });
    const handler = await freshHandler();
    const res = fakeRes();
    await handler(fakeReq({ tier: 'organization', billing: 'perpetual' }), res);

    expect(res._status).toBe(200);
    expect(mockPricesList).toHaveBeenCalledWith({ lookup_keys: ['org_perpetual'], active: true });
    expect(mockSessionsCreate).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'payment',
      line_items: [{ price: 'price_lookup_org_perp', quantity: 1 }],
    }));
    expect(mockSessionsCreate.mock.calls[0][0]).not.toHaveProperty('subscription_data');
  });

  it('prefers the STRIPE_PRICE_* env var over lookup-key resolution', async () => {
    process.env.STRIPE_PRICE_TEAM_ANNUAL = 'price_env_override';
    mockPricesRetrieve.mockResolvedValue({ id: 'price_env_override', recurring: { interval: 'year' } });
    const handler = await freshHandler();
    const res = fakeRes();
    await handler(fakeReq({ tier: 'team', billing: 'annual' }), res);

    expect(res._status).toBe(200);
    expect(mockPricesList).not.toHaveBeenCalled();
    // Env override supplies only the ID, so recurring detection retrieves it
    expect(mockPricesRetrieve).toHaveBeenCalledWith('price_env_override');
    expect(mockSessionsCreate).toHaveBeenCalledWith(expect.objectContaining({
      line_items: [{ price: 'price_env_override', quantity: 1 }],
    }));
  });

  it('returns 500 naming tier and billing when no active price matches and no env var is set', async () => {
    mockPricesList.mockResolvedValue({ data: [] });
    const handler = await freshHandler();
    const res = fakeRes();
    await handler(fakeReq({ tier: 'team', billing: 'perpetual' }), res);

    expect(res._status).toBe(500);
    expect(res._json.error).toContain('team');
    expect(res._json.error).toContain('perpetual');
    expect(mockSessionsCreate).not.toHaveBeenCalled();
  });

  it('caches lookup-key resolution across warm invocations within the TTL', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-06T12:00:00Z'));
    mockPricesList.mockResolvedValue({
      data: [{ id: 'price_cached', recurring: null }],
    });
    const handler = await freshHandler();

    const res1 = fakeRes();
    await handler(fakeReq({ tier: 'team', billing: 'perpetual' }), res1);
    // 9 minutes later — still inside the 10-minute TTL
    vi.advanceTimersByTime(9 * 60 * 1000);
    const res2 = fakeRes();
    await handler(fakeReq({ tier: 'team', billing: 'perpetual' }), res2);

    expect(res1._status).toBe(200);
    expect(res2._status).toBe(200);
    expect(mockPricesList).toHaveBeenCalledTimes(1);
    expect(mockSessionsCreate).toHaveBeenCalledTimes(2);
    expect(mockSessionsCreate.mock.calls[1][0].line_items).toEqual([
      { price: 'price_cached', quantity: 1 },
    ]);
  });

  it('re-resolves via prices.list once a cached entry is older than the TTL', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-06T12:00:00Z'));
    mockPricesList.mockResolvedValueOnce({
      data: [{ id: 'price_before_rotation', recurring: null }],
    });
    const handler = await freshHandler();

    const res1 = fakeRes();
    await handler(fakeReq({ tier: 'team', billing: 'perpetual' }), res1);

    // 11 minutes later — past the 10-minute TTL; price was rotated meanwhile
    vi.advanceTimersByTime(11 * 60 * 1000);
    mockPricesList.mockResolvedValueOnce({
      data: [{ id: 'price_after_rotation', recurring: null }],
    });
    const res2 = fakeRes();
    await handler(fakeReq({ tier: 'team', billing: 'perpetual' }), res2);

    expect(res1._status).toBe(200);
    expect(res2._status).toBe(200);
    expect(mockPricesList).toHaveBeenCalledTimes(2);
    expect(mockSessionsCreate.mock.calls[0][0].line_items).toEqual([
      { price: 'price_before_rotation', quantity: 1 },
    ]);
    expect(mockSessionsCreate.mock.calls[1][0].line_items).toEqual([
      { price: 'price_after_rotation', quantity: 1 },
    ]);
  });
});
