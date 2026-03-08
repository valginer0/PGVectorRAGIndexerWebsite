import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';

// ---------------------------------------------------------------------------
// Generate a fresh RSA key pair for license signing in tests
// ---------------------------------------------------------------------------
const { privateKey: TEST_PRIVATE_KEY, publicKey: TEST_PUBLIC_KEY } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

// ---------------------------------------------------------------------------
// Stripe mock — intercepts `new Stripe(...)` and all API calls
// ---------------------------------------------------------------------------
const mockSendMail = vi.fn().mockResolvedValue({ messageId: 'test-msg-id' });
const mockCustomerMetadata = {};
const mockSubscriptionMetadata = {};

// Track all stripe.customers.update / subscriptions.update calls
const mockCustomersRetrieve = vi.fn();
const mockCustomersUpdate = vi.fn();
const mockSubscriptionsRetrieve = vi.fn();
const mockSubscriptionsUpdate = vi.fn();
const mockConstructEvent = vi.fn();

function createStripeMock() {
  return {
    webhooks: { constructEvent: mockConstructEvent },
    customers: {
      retrieve: mockCustomersRetrieve,
      update: mockCustomersUpdate,
    },
    subscriptions: {
      retrieve: mockSubscriptionsRetrieve,
      update: mockSubscriptionsUpdate,
    },
  };
}

vi.mock('stripe', () => {
  // Must use `function` (not arrow) so it works with `new Stripe(...)`
  function MockStripe() {
    return createStripeMock();
  }
  return { default: MockStripe };
});

vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(() => ({ sendMail: mockSendMail })),
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a fake Vercel req (async iterable with raw body + headers). */
function fakeReq(body, { method = 'POST', headers = {} } = {}) {
  const buf = Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
  return {
    method,
    headers: { 'stripe-signature': 'sig_test', ...headers },
    [Symbol.asyncIterator]() {
      let done = false;
      return {
        next() {
          if (done) return Promise.resolve({ done: true });
          done = true;
          return Promise.resolve({ value: buf, done: false });
        },
      };
    },
  };
}

/** Create a fake Vercel res with chainable status().json(). */
function fakeRes() {
  const res = {
    _status: null,
    _json: null,
    _ended: false,
    status(code) { res._status = code; return res; },
    json(data) { res._json = data; return res; },
    end() { res._ended = true; return res; },
  };
  return res;
}

/** Build a checkout.session.completed event payload for one-time payment. */
function makePaymentSession(overrides = {}) {
  return {
    type: 'checkout.session.completed',
    id: 'evt_test_1',
    data: {
      object: {
        id: 'cs_test_1',
        mode: 'payment',
        customer: 'cus_test_1',
        subscription: null,
        customer_details: {
          email: 'buyer@example.com',
          name: 'Test Buyer',
        },
        metadata: { tier: 'team', seats: '5' },
        ...overrides,
      },
    },
  };
}

/** Build a checkout.session.completed event for a subscription. */
function makeSubscriptionSession(overrides = {}) {
  return {
    type: 'checkout.session.completed',
    id: 'evt_test_sub_1',
    data: {
      object: {
        id: 'cs_test_sub_1',
        mode: 'subscription',
        customer: 'cus_test_sub',
        subscription: 'sub_test_1',
        customer_details: {
          email: 'subscriber@example.com',
          name: 'Sub Buyer',
        },
        metadata: { tier: 'organization', seats: '25' },
        ...overrides,
      },
    },
  };
}

/** Build an invoice.paid event payload. */
function makeInvoicePaid(overrides = {}) {
  return {
    type: 'invoice.paid',
    id: 'evt_inv_1',
    data: {
      object: {
        id: 'in_test_1',
        subscription: 'sub_renew_1',
        customer: 'cus_renew_1',
        customer_email: 'renewer@example.com',
        customer_name: 'Renew User',
        billing_reason: 'subscription_cycle',
        metadata: {},
        lines: { data: [] },
        ...overrides,
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Set env vars
// ---------------------------------------------------------------------------
beforeEach(() => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_fake';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_fake';
  process.env.LICENSE_PRIVATE_KEY = TEST_PRIVATE_KEY;
  process.env.SMTP_USER = 'test@example.com';
  process.env.SMTP_PASSWORD = 'smtp_pass';
  process.env.SITE_URL = 'https://test.example.com';

  // Reset all mocks
  vi.clearAllMocks();

  // Default customer retrieve: fresh customer with no idempotency markers
  mockCustomersRetrieve.mockResolvedValue({
    id: 'cus_test_1',
    email: 'buyer@example.com',
    name: 'Test Buyer',
    metadata: {},
  });
  mockCustomersUpdate.mockResolvedValue({});

  // Default subscription retrieve (with items expanded)
  const now = Math.floor(Date.now() / 1000);
  mockSubscriptionsRetrieve.mockResolvedValue({
    id: 'sub_test_1',
    metadata: { tier: 'team', seats: '5' },
    items: { data: [{ current_period_end: now + 365 * 86400 }] },
  });
  mockSubscriptionsUpdate.mockResolvedValue({});
});

afterEach(() => {
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_WEBHOOK_SECRET;
  delete process.env.LICENSE_PRIVATE_KEY;
  delete process.env.SMTP_USER;
  delete process.env.SMTP_PASSWORD;
  delete process.env.SITE_URL;
});

// ---------------------------------------------------------------------------
// Import handler (after mocks are set up)
// ---------------------------------------------------------------------------
const { default: handler } = await import('./webhook.js');

// ===========================================================================
// Tests
// ===========================================================================

describe('webhook handler — request validation', () => {
  it('rejects non-POST with 405', async () => {
    const req = fakeReq('{}', { method: 'GET' });
    const res = fakeRes();
    await handler(req, res);
    expect(res._status).toBe(405);
    expect(res._json.error).toMatch(/method not allowed/i);
  });

  it('returns 400 when signature header is missing', async () => {
    const req = fakeReq('{}', { headers: { 'stripe-signature': '' } });
    const res = fakeRes();
    await handler(req, res);
    expect(res._status).toBe(400);
    expect(res._json.error).toMatch(/missing signature/i);
  });

  it('returns 400 when STRIPE_WEBHOOK_SECRET is missing', async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    const req = fakeReq('{}');
    const res = fakeRes();
    await handler(req, res);
    expect(res._status).toBe(400);
  });

  it('returns 400 when constructEvent throws (bad signature)', async () => {
    mockConstructEvent.mockImplementation(() => {
      throw new Error('Signature verification failed');
    });
    const req = fakeReq('{}');
    const res = fakeRes();
    await handler(req, res);
    expect(res._status).toBe(400);
    expect(res._json.error).toMatch(/signature verification failed/i);
  });
});

describe('webhook handler — unhandled event types', () => {
  it('returns 200 for unknown event types', async () => {
    mockConstructEvent.mockReturnValue({ type: 'charge.refunded', id: 'evt_x', data: { object: {} } });
    const req = fakeReq('{}');
    const res = fakeRes();
    await handler(req, res);
    expect(res._status).toBe(200);
    expect(res._json.received).toBe(true);
  });
});

describe('webhook handler — checkout.session.completed (one-time payment)', () => {
  it('generates license and sends email for a one-time payment', async () => {
    const event = makePaymentSession();
    mockConstructEvent.mockReturnValue(event);

    const req = fakeReq('{}');
    const res = fakeRes();
    await handler(req, res);

    expect(res._status).toBe(200);
    // Email was sent
    expect(mockSendMail).toHaveBeenCalledTimes(1);
    const mailArgs = mockSendMail.mock.calls[0][0];
    expect(mailArgs.to).toBe('buyer@example.com');
    expect(mailArgs.subject).toMatch(/team/i);
    expect(mailArgs.html).toContain('Test Buyer'); // customer name in greeting

    // Customer was marked as fulfilled
    expect(mockCustomersUpdate).toHaveBeenCalled();
    const lastUpdate = mockCustomersUpdate.mock.calls[mockCustomersUpdate.mock.calls.length - 1];
    expect(lastUpdate[1].metadata.last_fulfilled_session_id).toBe('cs_test_1');
    expect(lastUpdate[1].metadata.last_processing_session_id).toBe('');
  });

  it('normalizes "org" tier to "organization"', async () => {
    const event = makePaymentSession({ metadata: { tier: 'org', seats: '10' } });
    mockConstructEvent.mockReturnValue(event);

    const req = fakeReq('{}');
    const res = fakeRes();
    await handler(req, res);

    expect(res._status).toBe(200);
    expect(mockSendMail).toHaveBeenCalledTimes(1);
    const mailArgs = mockSendMail.mock.calls[0][0];
    expect(mailArgs.subject).toMatch(/organization/i);
  });

  it('skips duplicate (already fulfilled) sessions', async () => {
    mockCustomersRetrieve.mockResolvedValue({
      id: 'cus_test_1',
      email: 'buyer@example.com',
      metadata: { last_fulfilled_session_id: 'cs_test_1' },
    });
    const event = makePaymentSession();
    mockConstructEvent.mockReturnValue(event);

    const req = fakeReq('{}');
    const res = fakeRes();
    await handler(req, res);

    expect(res._status).toBe(200);
    expect(res._json.info).toBe('Duplicate session');
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it('skips concurrent (recently processing) sessions', async () => {
    const now = Math.floor(Date.now() / 1000);
    mockCustomersRetrieve.mockResolvedValue({
      id: 'cus_test_1',
      email: 'buyer@example.com',
      metadata: {
        last_processing_session_id: 'cs_test_1',
        last_processing_session_at: String(now - 30), // 30s ago
      },
    });
    const event = makePaymentSession();
    mockConstructEvent.mockReturnValue(event);

    const req = fakeReq('{}');
    const res = fakeRes();
    await handler(req, res);

    expect(res._status).toBe(200);
    expect(res._json.info).toBe('Concurrent session');
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it('recovers stale processing sessions (>300s old)', async () => {
    const now = Math.floor(Date.now() / 1000);
    mockCustomersRetrieve.mockResolvedValue({
      id: 'cus_test_1',
      email: 'buyer@example.com',
      metadata: {
        last_processing_session_id: 'cs_test_1',
        last_processing_session_at: String(now - 600), // 10 min ago → stale
      },
    });
    const event = makePaymentSession();
    mockConstructEvent.mockReturnValue(event);

    const req = fakeReq('{}');
    const res = fakeRes();
    await handler(req, res);

    // Should proceed and send email despite stale lock
    expect(res._status).toBe(200);
    expect(mockSendMail).toHaveBeenCalledTimes(1);
  });

  it('handles missing email gracefully', async () => {
    const event = makePaymentSession({
      customer_details: { email: null, name: null },
      customer_email: null,
    });
    mockCustomersRetrieve.mockResolvedValue({
      id: 'cus_test_1',
      email: null,
      metadata: {},
    });
    mockConstructEvent.mockReturnValue(event);

    const req = fakeReq('{}');
    const res = fakeRes();
    await handler(req, res);

    expect(res._status).toBe(200);
    expect(res._json.warning).toBe('No email found');
    expect(mockSendMail).not.toHaveBeenCalled();
  });
});

describe('webhook handler — checkout.session.completed (subscription)', () => {
  it('generates license using subscription period_end', async () => {
    const now = Math.floor(Date.now() / 1000);
    const periodEnd = now + 365 * 86400;

    mockSubscriptionsRetrieve.mockResolvedValue({
      id: 'sub_test_1',
      metadata: { tier: 'organization', seats: '25' },
      items: { data: [{ current_period_end: periodEnd }] },
    });

    const event = makeSubscriptionSession();
    mockConstructEvent.mockReturnValue(event);

    const req = fakeReq('{}');
    const res = fakeRes();
    await handler(req, res);

    expect(res._status).toBe(200);
    expect(mockSendMail).toHaveBeenCalledTimes(1);
    const mailArgs = mockSendMail.mock.calls[0][0];
    expect(mailArgs.to).toBe('subscriber@example.com');
    expect(mailArgs.subject).toMatch(/organization/i);
  });
});

describe('webhook handler — invoice.paid', () => {
  it('fulfills subscription renewal and increments renewal_count', async () => {
    const now = Math.floor(Date.now() / 1000);
    const periodEnd = now + 365 * 86400;

    mockSubscriptionsRetrieve.mockResolvedValue({
      id: 'sub_renew_1',
      metadata: { tier: 'team', seats: '5', renewal_count: '1' },
      items: { data: [{ current_period_end: periodEnd }] },
    });
    mockCustomersRetrieve.mockResolvedValue({
      id: 'cus_renew_1',
      email: 'renewer@example.com',
      name: 'Renew User',
      metadata: {},
    });

    const event = makeInvoicePaid();
    mockConstructEvent.mockReturnValue(event);

    const req = fakeReq('{}');
    const res = fakeRes();
    await handler(req, res);

    expect(res._status).toBe(200);
    expect(mockSendMail).toHaveBeenCalledTimes(1);
    expect(mockSendMail.mock.calls[0][0].to).toBe('renewer@example.com');

    // Final update should bump renewal_count to 2
    const lastSubUpdate = mockSubscriptionsUpdate.mock.calls[mockSubscriptionsUpdate.mock.calls.length - 1];
    expect(lastSubUpdate[1].metadata.renewal_count).toBe('2');
    expect(lastSubUpdate[1].metadata.last_fulfilled_invoice_id).toBe('in_test_1');
  });

  it('skips invoice.paid without a subscription ID', async () => {
    const event = makeInvoicePaid({ subscription: null, lines: { data: [] } });
    mockConstructEvent.mockReturnValue(event);

    const req = fakeReq('{}');
    const res = fakeRes();
    await handler(req, res);

    expect(res._status).toBe(200);
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it('falls back to line item subscription ID', async () => {
    const now = Math.floor(Date.now() / 1000);
    mockSubscriptionsRetrieve.mockResolvedValue({
      id: 'sub_from_line',
      metadata: { tier: 'team', seats: '5' },
      items: { data: [{ current_period_end: now + 365 * 86400 }] },
    });
    mockCustomersRetrieve.mockResolvedValue({
      id: 'cus_renew_1',
      email: 'renewer@example.com',
      name: 'Renew User',
      metadata: {},
    });

    const event = makeInvoicePaid({
      subscription: null,
      lines: { data: [{ subscription: 'sub_from_line' }] },
    });
    mockConstructEvent.mockReturnValue(event);

    const req = fakeReq('{}');
    const res = fakeRes();
    await handler(req, res);

    expect(res._status).toBe(200);
    expect(mockSendMail).toHaveBeenCalledTimes(1);
  });

  it('skips duplicate (already fulfilled) invoices', async () => {
    mockSubscriptionsRetrieve.mockResolvedValue({
      id: 'sub_renew_1',
      metadata: {
        tier: 'team',
        seats: '5',
        last_fulfilled_invoice_id: 'in_test_1',
      },
      items: { data: [{ current_period_end: 0 }] },
    });
    mockCustomersRetrieve.mockResolvedValue({
      id: 'cus_renew_1',
      email: 'renewer@example.com',
      metadata: {},
    });

    const event = makeInvoicePaid();
    mockConstructEvent.mockReturnValue(event);

    const req = fakeReq('{}');
    const res = fakeRes();
    await handler(req, res);

    expect(res._status).toBe(200);
    expect(res._json.info).toBe('Duplicate invoice');
    expect(mockSendMail).not.toHaveBeenCalled();
  });
});

describe('webhook handler — error handling', () => {
  it('returns 500 for transient Stripe errors (triggers Stripe retry)', async () => {
    mockConstructEvent.mockReturnValue(makePaymentSession());
    mockCustomersRetrieve.mockRejectedValueOnce(
      Object.assign(new Error('Rate limit'), { type: 'StripeRateLimitError' })
    );

    const req = fakeReq('{}');
    const res = fakeRes();
    await handler(req, res);

    expect(res._status).toBe(500);
    expect(res._json.error).toMatch(/transient/i);
  });

  it('returns 200 for permanent errors (prevents Stripe retry loop)', async () => {
    mockConstructEvent.mockReturnValue(makePaymentSession());
    mockCustomersRetrieve.mockRejectedValueOnce(
      new Error('Something permanently broken')
    );

    const req = fakeReq('{}');
    const res = fakeRes();
    await handler(req, res);

    expect(res._status).toBe(200);
    expect(res._json.error).toBe('Permanent failure');
  });
});

describe('webhook handler — license key validation', () => {
  it('generated license key is a valid JWT with correct claims', async () => {
    const event = makePaymentSession({ metadata: { tier: 'team', seats: '10' } });
    mockConstructEvent.mockReturnValue(event);

    // Capture the license key from the email HTML
    let capturedHtml = '';
    mockSendMail.mockImplementation((mail) => {
      capturedHtml = mail.html;
      return Promise.resolve({ messageId: 'test' });
    });

    const req = fakeReq('{}');
    const res = fakeRes();
    await handler(req, res);

    expect(res._status).toBe(200);

    // Extract JWT from the HTML (it's in a <code> block)
    const match = capturedHtml.match(/color: #a5b4fc;">(eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)<\/code>/);
    expect(match).toBeTruthy();
    const token = match[1];

    // Verify with the test public key
    const { default: jwt } = await import('jsonwebtoken');
    const decoded = jwt.verify(token, TEST_PUBLIC_KEY, { algorithms: ['RS256'] });

    expect(decoded.edition).toBe('team');
    expect(decoded.seats).toBe(10);
    expect(decoded.renewal_count).toBe(0);
    expect(decoded.jti).toBeTruthy();

    // One-time payment should get 3650 days
    const daysUntilExpiry = Math.ceil((decoded.exp - decoded.iat) / 86400);
    expect(daysUntilExpiry).toBe(3650);
  });
});
