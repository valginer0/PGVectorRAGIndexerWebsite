import { describe, it, expect } from 'vitest';
import { assertPreviewEmail } from './webhook-logic.js';
const env = { VERCEL_ENV:'preview', STRIPE_SECRET_KEY:'sk_test_fixture', PREVIEW_EMAIL_RECIPIENT:'owner@example.com' };
describe('preview delivery restriction', () => {
  it('allows only the configured owner in test mode', () => expect(() => assertPreviewEmail({to:'owner@example.com'}, env)).not.toThrow());
  it('rejects other recipients', () => expect(() => assertPreviewEmail({to:'customer@example.com'}, env)).toThrow());
  it('rejects hidden additional recipients', () => expect(() => assertPreviewEmail({to:'owner@example.com',bcc:'customer@example.com'}, env)).toThrow());
  it('rejects live Stripe credentials', () => expect(() => assertPreviewEmail({to:'owner@example.com'}, {...env,STRIPE_SECRET_KEY:'sk_live_fixture'})).toThrow());
  it('fails closed without an allowlisted address', () => expect(() => assertPreviewEmail({to:'owner@example.com'}, {...env,PREVIEW_EMAIL_RECIPIENT:undefined})).toThrow());
  it('preserves production delivery', () => expect(() => assertPreviewEmail({to:'customer@example.com'}, {VERCEL_ENV:'production'})).not.toThrow());
});
