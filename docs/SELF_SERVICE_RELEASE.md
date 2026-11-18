# Self-service release — owner approved November 18, 2026

## Approved offer

Team: USD 499 / 5 users. Organization: USD 1,299 / 25 users.
One-time payment, 3,650 days from Checkout session creation, all updates to
the purchased edition during that term (including major versions).
No technical support, setup assistance, onboarding, deployment services, or response-time commitment.
Full refund on request within 14 days of payment; no processing-fee deduction.
Organization keys continue to stack. Existing purchases retain their terms.

Terms: /self-service-terms-2026-11-18.html. Do not edit this version after publication;
future offer changes need a new version and must retain historical terms.

## Configuration and publication

Implementation and isolated preview testing are approved. Production publication
is a separate final review, as recorded in PivaroFoundry PR #207.

1. Create dedicated LIVE products/prices, without changing historical products.
   Price metadata must include offer_family=self_service, offer_version=2026-11-18,
   and tier=team or tier=organization.
   Lookup keys: team_self_service_20261118, org_self_service_20261118.
   Fixed USD amounts: 49900 / 129900 cents, active, non-recurring.
   Optional override names: STRIPE_PRICE_TEAM_SELF_SERVICE / STRIPE_PRICE_ORG_SELF_SERVICE.
2. Keep production SITE_URL=https://www.ragvault.net. Set SELF_SERVICE_ENABLED=true
   for production. This closes new legacy /api/checkout sales with HTTP 410.
   Existing completed checkouts and subscriptions continue through their old handlers.
3. Ensure the production Stripe endpoint retains invoice.paid and checkout.session.completed
   and also subscribes to checkout.session.async_payment_succeeded and
   checkout.session.async_payment_failed. Checkout uses Stripe's configured payment methods.
4. Merge the reviewed commit and verify the Vercel production deployment, terms URL,
   both checkout prices/consent, and rejection of the legacy sales endpoint.
   Creating unpaid checkout sessions is enough for a live smoke check; do not charge
   a real card without explicit authorization.
5. Process refund requests manually in Stripe, for the full original payment.
   A refund does not remotely invalidate the offline key; terms require cessation of use.

Rollback: redeploy the previous production build and remove/disable SELF_SERVICE_ENABLED.
Do not rewrite historical customer metadata or subscription terms. Preserve new self-service
orders and their terms even if the storefront is rolled back.

## Evidence

Implementation commit c7dcb1754437f81b3752e8bd7896691c4cd186da:
191 tests passed, Vite production build passed, git diff --check passed.
Tests include wrong/legacy/recurring price rejection, missing consent, seat tampering,
historical email behavior, delayed payments, concurrent identical tokens, and lost-receipt retries.

Preview deployment dpl_E3YMRw6UeLMRKemARCdwKeabxs8z, branch feature/self-service-offer.
Dedicated test prices:
- Team price_1UdGb6Rc9V96VoFQtOSu83JF
- Organization price_1UdGb7Rc9V96VoFQ6iEwX42Y

Real Stripe sandbox Team checkout:
cs_test_a0EeToxMQKzQRJEmdaJCJsvCTSHIYfxjfQLbQgoeivieLLjOOCPQDvS3BI.
Paid 49900 USD cents; Stripe consent.terms_of_service=accepted.
Real completed event evt_1UdGjCRc9V96VoFQd7Kjysoi was retrieved and replayed into the
protected preview using its signing secret. First delivery HTTP 200; repeated event
HTTP 200 Duplicate session. This verifies the deployed handler against a real paid
event, NOT automatic Stripe-to-preview webhook delivery.
The test-mode endpoint pointing at production was paused during payment and restored
to its original enabled state afterward. No live payment or production setting changed.

Actual Zoho email reached the owner's Gmail inbox November 18 at 15:49 Central,
subject “Your RagVault Team Self-Service License Key”.
RSA verification with the isolated test key passed: team / 5 seats / exactly 3650 days.
Token SHA256: 776edb5a214d3f1ee43e3255115524d2cdf2ca1660c8f61df1d56d2ffc2767ac.
No production-valid license was issued by this preview.
The email includes the support exclusions, full-refund terms, and fixed expiry.
Its production terms link becomes available when this release is published.

Organization checkout against the deployed API returned 129900 USD cents / 25 seats,
required terms consent, and the dedicated test price. The unpaid test session was expired.
Deployed API rejected missing consent (400) and legacy annual checkout (410).

Preview-only limitation: returning from Stripe to the unique deployment URL encounters
Vercel protection when the browser was authenticated on the branch alias. Production is
public and uses SITE_URL, so it does not use that preview return URL.
The protected preview was accessed through a temporary share link; no login was required.
