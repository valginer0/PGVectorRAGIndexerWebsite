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
  return mocks.send.mock.calls.map(([mail]) =>
    mail.html.match(/>(eyJ[A-Za-z0-9_.-]+)<\/code>/)[1]);
}
beforeEach(() => {
  vi.clearAllMocks();
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
    expect(mocks.send).not.toHaveBeenCalled();
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
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });

  it('does not issue for unpaid checkout', async () => {
    expect((await deliver(event(undefined, { payment_status: 'unpaid' }))).code).toBe(200);
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('rejects a mismatched purchased price before sending', async () => {
    mocks.lines.mockResolvedValue({
      has_more: false, data: [{ quantity: 1, price: { id: 'price_other' } }],
    });
    expect((await deliver()).code).toBe(500);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('does not guess missing purchase terms', async () => {
    const input = event();
    delete input.data.object.metadata.seats;
    expect((await deliver(input)).code).toBe(500);
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
