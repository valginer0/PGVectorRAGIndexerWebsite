import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ list: vi.fn(), retrieve: vi.fn(), create: vi.fn() }));
vi.mock('stripe', () => ({ default: function Stripe() { return {
  prices: { list: mock.list, retrieve: mock.retrieve },
  checkout: { sessions: { create: mock.create } },
}; } }));
import handler from './self-service-checkout.js';
import legacyHandler from './checkout.js';
const valid = { tier: 'team', termsAccepted: true, offerVersion: '2026-11-18' };
function price(tier = 'team', changes = {}) {
  return { id: 'price_self_service', active: true, currency: 'usd',
    unit_amount: tier === 'team' ? 49900 : 129900, recurring: null,
    metadata: { tier, offer_family: 'self_service', offer_version: '2026-11-18' }, ...changes };
}
async function call(body = valid, method = 'POST', run = handler) {
  const response = { code: null, body: null,
    setHeader() {}, status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; } };
  await run({ method, body }, response);
  return response;
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('SELF_SERVICE_ENABLED', 'true');
  vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_fixture');
  vi.stubEnv('SITE_URL', 'https://preview.example/');
  vi.stubEnv('VERCEL_ENV', 'preview');
  vi.stubEnv('VERCEL_URL', 'preview.example');
  vi.stubEnv('STRIPE_PRICE_TEAM_SELF_SERVICE', '');
  vi.stubEnv('STRIPE_PRICE_ORG_SELF_SERVICE', '');
  mock.list.mockResolvedValue({ data: [price()] });
  mock.create.mockResolvedValue({ url: 'https://checkout.stripe.com/fixture' });
});
afterEach(() => vi.unstubAllEnvs());
describe('self-service checkout', () => {
  it.each(['team', 'organization'])('freezes approved %s offer, seats and consent', async tier => {
    mock.list.mockResolvedValue({ data: [price(tier)] });
    expect((await call({ ...valid, tier, seats: 900, amount: 1 })).code).toBe(200);
    const options = mock.create.mock.calls[0][0];
    expect(options.mode).toBe('payment');
    expect(options.billing_address_collection).toBe('required');
    expect(options.automatic_tax?.enabled).not.toBe(true);
    expect(options.line_items).toEqual([{ price: 'price_self_service', quantity: 1 }]);
    expect(options.metadata).toEqual({
      tier, seats: tier === 'team' ? '5' : '25', fulfillment_version: 'one_time_v1',
      purchase_price_id: 'price_self_service', offer_family: 'self_service',
      offer_version: '2026-11-18', terms_accepted: '2026-11-18',
    });
    expect(options.consent_collection).toEqual({ terms_of_service: 'required' });
    expect(options.custom_text.terms_of_service_acceptance.message)
      .toContain('https://preview.example/self-service-terms-2026-11-18.html');
    expect(options.success_url).toBe('https://preview.example/index.html#purchase-success');
  });
  it.each([{}, { ...valid, termsAccepted: false }, { ...valid, termsAccepted: 'true' },
    { ...valid, offerVersion: 'old' }, { ...valid, tier: 'constructor' }])
    ('rejects invalid or unaccepted offer %j before provider calls', async body => {
      expect((await call(body)).code).toBe(400);
      expect(mock.list).not.toHaveBeenCalled();
      expect(mock.create).not.toHaveBeenCalled();
    });
  it.each([{ active: false }, { currency: 'eur' }, { unit_amount: 29900 },
    { recurring: { interval: 'year' } }, { metadata: {} },
    { metadata: { tier: 'organization', offer_family: 'self_service', offer_version: '2026-11-18' } }])
    ('rejects misconfigured price %j', async change => {
      mock.list.mockResolvedValue({ data: [price('team', change)] });
      expect((await call()).code).toBe(503);
      expect(mock.create).not.toHaveBeenCalled();
    });
  it('does not fall back to a legacy price', async () => {
    vi.stubEnv('STRIPE_PRICE_TEAM_PERPETUAL', 'price_legacy');
    mock.list.mockResolvedValue({ data: [] });
    expect((await call()).code).toBe(503);
    expect(mock.retrieve).not.toHaveBeenCalled();
    expect(mock.create).not.toHaveBeenCalled();
  });
  it('validates an explicit price override too', async () => {
    vi.stubEnv('STRIPE_PRICE_TEAM_SELF_SERVICE', 'price_wrong');
    mock.retrieve.mockResolvedValue(price('team', { unit_amount: 1 }));
    expect((await call()).code).toBe(503);
    expect(mock.create).not.toHaveBeenCalled();
  });
  it('cannot use live Stripe credentials in a preview', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_live_fixture');
    expect((await call()).code).toBe(503);
    expect(mock.create).not.toHaveBeenCalled();
  });
  it('stays closed until configured', async () => {
    vi.stubEnv('SELF_SERVICE_ENABLED', '');
    expect((await call()).code).toBe(503);
    expect(mock.list).not.toHaveBeenCalled();
  });
  it('does not allow new legacy purchases when self-service is enabled', async () => {
    expect((await call({ tier: 'team', billing: 'annual' }, 'POST', legacyHandler)).code).toBe(410);
    expect(mock.create).not.toHaveBeenCalled();
  });
  it('rejects GET', async () => {
    expect((await call(valid, 'GET')).code).toBe(405);
    expect(mock.create).not.toHaveBeenCalled();
  });
});
