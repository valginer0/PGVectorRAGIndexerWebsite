import { beforeEach, describe, expect, it, vi } from 'vitest';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';

const mocks = vi.hoisted(() => ({
  retrieve: vi.fn(), lines: vi.fn(), update: vi.fn(), send: vi.fn(),
}));
vi.mock('stripe', () => ({ default: function Stripe() { return {
  webhooks: { constructEvent: body => JSON.parse(body.toString()) },
  checkout: { sessions: {
    retrieve: mocks.retrieve, listLineItems: mocks.lines, update: mocks.update,
  } },
}; } }));
vi.mock('nodemailer', () => ({ default: {
  createTransport: () => ({ sendMail: mocks.send }),
} }));
import handler from './webhook.js';

const keys = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});
const created = Math.floor(Date.now() / 1000) - 86400;
let receipts;
function event(id = 'cs_purchase_a', changes = {}) {
  return { id: 'evt_' + id, type: 'checkout.session.completed', data: { object: {
    id, mode: 'payment', payment_status: 'paid', created,
    customer: 'cus_mutable',
    customer_details: { email: 'buyer@example.com', name: 'Original buyer' },
    metadata: {
      tier: 'team', seats: '5', fulfillment_version: 'one_time_v1',
      purchase_price_id: 'price_team',
    },
    ...changes,
  } } };
}
async function deliver(input = event()) {
  const request = {
    method: 'POST', headers: { 'stripe-signature': 'fixture' },
    async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify(input)); },
  };
  const response = {
    code: null, body: null,
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; },
  };
  await handler(request, response);
  return response;
}
function tokens() {
  return mocks.send.mock.calls.filter(([mail]) => mail.html).map(([mail]) =>
    mail.html.match(/>(eyJ[A-Za-z0-9_.-]+)<\/code>/)[1]);
}
beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.ALERT_EMAIL;
  receipts = new Map();
  process.env.STRIPE_SECRET_KEY = 'sk_test_fixture';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_fixture';
  process.env.SMTP_USER = 'test@example.com';
  process.env.SMTP_PASSWORD = 'fixture';
  process.env.LICENSE_PRIVATE_KEY = keys.privateKey;
  mocks.retrieve.mockImplementation(async id => ({
    metadata: { ...receipts.get(id), tier: 'organization', seats: '500' },
    customer_details: { name: 'Changed customer', email: 'changed@example.com' },
  }));
  mocks.lines.mockResolvedValue({
    has_more: false, data: [{ quantity: 1, price: { id: 'price_team' } }],
  });
  mocks.update.mockImplementation(async (id, { metadata }) => {
    receipts.set(id, metadata); return { id };
  });
  mocks.send.mockResolvedValue({ messageId: 'accepted' });
});

describe('EXP-001 one-time fulfillment through the real handler and signer', () => {
  it('issues the purchased claims and exact expiry, ignoring mutable current metadata', async () => {
    expect((await deliver()).code).toBe(200);
    const claims = jwt.verify(tokens()[0], keys.publicKey, { algorithms: ['RS256'] });
    expect(claims).toEqual({
      edition: 'team', org: 'Original buyer', seats: 5, iat: created,
      exp: created + 3650 * 86400, jti: 'checkout:cs_purchase_a', renewal_count: 0,
    });
    expect(mocks.send.mock.calls[0][0].to).toBe('buyer@example.com');
    expect(receipts.get('cs_purchase_a').licence_jti).toBe(claims.jti);
  });

  it('rejects an inconsistent RSA key before sending or recording completion', async () => {
    const jwk = crypto.createPrivateKey(keys.privateKey).export({ format: 'jwk' });
    // Mismatch the public exponent and private components without a parse error.
    jwk.e = 'Aw';
    process.env.LICENSE_PRIVATE_KEY = crypto.createPrivateKey({
      key: jwk, format: 'jwk',
    }).export({ type: 'pkcs8', format: 'pem' });
    expect((await deliver()).code).toBe(500);
    expect(mocks.send.mock.calls.filter(([mail]) => mail.html)).toHaveLength(0);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('skips an old completed purchase even after a newer purchase', async () => {
    await deliver(); await deliver(event('cs_purchase_b')); await deliver();
    expect(mocks.send).toHaveBeenCalledTimes(2);
    expect(tokens()[0]).not.toBe(tokens()[1]);
  });

  it('concurrent attempts may send twice but carry byte-identical tokens', async () => {
    const responses = await Promise.all([deliver(), deliver()]);
    expect(responses.map(r => r.code)).toEqual([200, 200]);
    expect(tokens()).toHaveLength(2);
    expect(new Set(tokens()).size).toBe(1);
  });

  it('SMTP acceptance followed by a lost response retries the identical license', async () => {
    mocks.send.mockRejectedValueOnce(new Error('SMTP accepted; response lost'));
    expect((await deliver()).code).toBe(500);
    expect(receipts.size).toBe(0);
    expect((await deliver()).code).toBe(200);
    expect(tokens()).toHaveLength(2);
    expect(new Set(tokens()).size).toBe(1);
  });

  it('failure after email and before receipt retries without extending or multiplying rights', async () => {
    mocks.update.mockRejectedValueOnce(new Error('receipt connection failed'));
    expect((await deliver()).code).toBe(500);
    expect((await deliver()).code).toBe(200);
    expect(new Set(tokens()).size).toBe(1);
    expect(tokens()).toHaveLength(2);
  });

  it('ambiguous receipt write that succeeded suppresses the next email', async () => {
    mocks.update.mockImplementationOnce(async (id, { metadata }) => {
      receipts.set(id, metadata); throw new Error('response lost');
    });
    expect((await deliver()).code).toBe(500);
    expect((await deliver()).code).toBe(200);
    expect(tokens()).toHaveLength(1);
    expect(mocks.send.mock.calls.filter(([mail]) => mail.text)).toHaveLength(1);
  });

  it('does not issue for unpaid checkout', async () => {
    expect((await deliver(event(undefined, { payment_status: 'unpaid' }))).code).toBe(200);
    expect(mocks.send.mock.calls.filter(([mail]) => mail.html)).toHaveLength(0);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('rejects a mismatched purchased price before sending', async () => {
    mocks.lines.mockResolvedValue({
      has_more: false, data: [{ quantity: 1, price: { id: 'price_other' } }],
    });
    expect((await deliver()).code).toBe(500);
    expect(mocks.send.mock.calls.filter(([mail]) => mail.html)).toHaveLength(0);
  });

  it('does not guess missing purchase terms', async () => {
    const input = event();
    delete input.data.object.metadata.seats;
    expect((await deliver(input)).code).toBe(500);
    expect(mocks.send.mock.calls.filter(([mail]) => mail.html)).toHaveLength(0);
  });
});

describe('self-service fulfillment preserves the deterministic license contract', () => {
  function purchase() {
    const input = event();
    Object.assign(input.data.object.metadata, {
      offer_family: 'self_service', offer_version: '2026-11-18', terms_accepted: '2026-11-18',
    });
    input.data.object.consent = { terms_of_service: 'accepted' };
    return input;
  }
  it('uses the same claims but sends the purchased support exclusions and refund terms', async () => {
    await deliver();
    const legacyToken = tokens()[0];
    const legacyMail = mocks.send.mock.calls[0][0];
    receipts.clear();
    expect((await deliver(purchase())).code).toBe(200);
    const mail = mocks.send.mock.calls[1][0];
    expect(tokens()[1]).toBe(legacyToken);
    expect(mail.subject).toContain('Team Self-Service');
    expect(mail.html).toContain('no technical support');
    expect(mail.html).toContain('within 14 days of payment');
    expect(mail.html).toContain('self-service-terms-2026-11-18.html');
    expect(mail.html).not.toContain('Need help?');
    expect(legacyMail.html).toContain('Need help?');
    expect(legacyMail.html).not.toContain('no technical support');
  });
  it.each(['missing-consent', 'old-version', 'missing-acceptance', 'wrong-seats'])
    ('rejects %s before sending a license', async scenario => {
      const input = purchase();
      const session = input.data.object;
      if (scenario === 'missing-consent') delete session.consent;
      if (scenario === 'old-version') session.metadata.offer_version = 'old';
      if (scenario === 'missing-acceptance') delete session.metadata.terms_accepted;
      if (scenario === 'wrong-seats') session.metadata.seats = '1';
      expect((await deliver(input)).code).toBe(500);
      expect(mocks.send.mock.calls.filter(([mail]) => mail.html)).toHaveLength(0);
      expect(mocks.update).not.toHaveBeenCalled();
    });
  it('concurrent self-service deliveries carry identical tokens and offer terms', async () => {
    expect((await Promise.all([deliver(purchase()), deliver(purchase())])).map(r => r.code)).toEqual([200, 200]);
    expect(tokens()).toHaveLength(2);
    expect(new Set(tokens()).size).toBe(1);
    for (const [mail] of mocks.send.mock.calls) expect(mail.html).toContain('no technical support');
  });
  it('fulfills delayed payment once paid, not while unpaid or after a failed payment', async () => {
    const input = purchase();
    input.data.object.payment_status = 'unpaid';
    expect((await deliver(input)).code).toBe(200);
    expect(mocks.send.mock.calls.filter(([mail]) => mail.html)).toHaveLength(0);
    input.type = 'checkout.session.async_payment_failed';
    expect((await deliver(input)).code).toBe(200);
    expect(mocks.send.mock.calls.filter(([mail]) => mail.html)).toHaveLength(0);
    input.type = 'checkout.session.async_payment_succeeded';
    input.data.object.payment_status = 'paid';
    expect((await deliver(input)).code).toBe(200);
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect((await deliver(input)).code).toBe(200);
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });
  it('a crash after sending does not extend self-service rights on retry', async () => {
    mocks.update.mockRejectedValueOnce(new Error('receipt lost'));
    expect((await deliver(purchase())).code).toBe(500);
    expect((await deliver(purchase())).code).toBe(200);
    expect(tokens()).toHaveLength(2);
    expect(new Set(tokens()).size).toBe(1);
  });
});

describe('one-time operator alerts retain retry semantics', () => {
  it.each(['checkout.session.completed', 'checkout.session.async_payment_succeeded'])
    ('alerts the configured operator on %s delivery failure', async type => {
      process.env.ALERT_EMAIL = 'owner@example.com';
      mocks.send.mockRejectedValueOnce(new Error('delivery failed'));
      const input = event();
      input.type = type;
      Object.assign(input.data.object.metadata, {
        offer_family: 'self_service', offer_version: '2026-11-18', terms_accepted: '2026-11-18',
      });
      input.data.object.consent = { terms_of_service: 'accepted' };
      expect((await deliver(input)).code).toBe(500);
      const alert = mocks.send.mock.calls[1][0];
      expect(alert.to).toBe('owner@example.com');
      expect(alert.subject).toContain('one-time checkout');
      expect(alert.text).toContain(input.data.object.id);
      expect(alert.text).toContain(input.id);
      expect(alert.text).toContain('Stripe will retry');
      expect(alert.text).not.toContain('has received nothing');
      expect(receipts.size).toBe(0);
    });
  it('still returns 500 if both customer email and alert fail', async () => {
    mocks.send.mockRejectedValueOnce(new Error('SMTP down'))
      .mockRejectedValueOnce(new Error('SMTP still down'));
    expect((await deliver()).code).toBe(500);
    expect(mocks.send).toHaveBeenCalledTimes(2);
    expect(mocks.send.mock.calls[1][0].to).toBe('test@example.com');
    expect(receipts.size).toBe(0);
  });
  it('warns of possible prior delivery when the receipt write fails', async () => {
    mocks.update.mockRejectedValueOnce(new Error('receipt unavailable'));
    expect((await deliver()).code).toBe(500);
    expect(mocks.send.mock.calls[1][0].text).toContain('may already have been sent');
    expect((await deliver()).code).toBe(200);
    expect(tokens()).toHaveLength(2);
    expect(new Set(tokens()).size).toBe(1);
  });
  it('sends no operator alert for success, duplicates, or unpaid sessions', async () => {
    await deliver();
    await deliver();
    await deliver(event('cs_unpaid', { payment_status: 'unpaid' }));
    expect(mocks.send.mock.calls.filter(([mail]) => mail.text)).toHaveLength(0);
  });
});
