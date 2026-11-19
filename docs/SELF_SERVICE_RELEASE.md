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

Owner authorized production publication on November 18, 2026, conditional on restoring
the original license's AS IS warranty disclaimer, consequential-damage liability exclusion,
Florida governing law, and the quote/invoice contact line. Those changes are included.
The original template had no monetary direct-liability cap; none has been invented.
Owner clarification, November 18, 2026: a live purchase test was authorized ONLY if it
cost nothing. A refunded paid test still incurs processing fees (owner estimate: about
USD 15 for the Team purchase), so NO paid test is authorized. Do not make any payment
or charge any card. Live automatic delivery remains UNVERIFIED BY OWNER DECISION.

Tax decision, November 18, 2026: preserve current behavior; Stripe Tax and automatic tax
collection remain OFF. Billing-address collection remains REQUIRED. Review tax collection
if sales in any one state approach USD 100,000 or 200 transactions, or if non-business
foreign buyers appear. These are owner-selected review triggers, not assertions of uniform
legal thresholds. This release does not implement automated tax monitoring.

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
   Use only no-payment checks. No paid checkout or purchase-and-refund test is authorized.
   Live automatic delivery remains unverified by owner decision.
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


## Production status and no-payment checks — November 18, 2026 (Central)

PR #2 was merged as 0946824d4cddb464a0b42a1bd9d1c7ca64537d33.
Vercel production deployment dpl_BiKszjWSwXDW7XddrEspuKeBM1ie serves www.ragvault.net.
Release head 932f093 passed 192 local tests and the production build.
Live Team and Organization checkout creation was verified without payment:
USD 499 / 5 seats and USD 1,299 / 25 seats, required billing address and terms consent,
automatic_tax.enabled=false. No card was charged.

1. LIVE Stripe endpoint we_1T8ROORc9V96VoFQ8OApFOWQ is enabled at
   https://www.ragvault.net/api/webhook. Confirmed enabled events:
   checkout.session.completed, checkout.session.async_payment_succeeded,
   checkout.session.async_payment_failed, and invoice.paid.
2. Current Vercel production LICENSE_PRIVATE_KEY derives the same RSA public key as
   PUBLIC_KEY_DEFAULT in shipped release v2.17.2 license.py, Git blob
   2993befa15cbcf437f19097bca4cc80a9e7495e1. RSA-SHA256 sign/verify of a non-license
   diagnostic message passed; no license was issued.
   Public SPKI DER SHA-256:
   88f8074f76074ccc699bbd061e33ba0d503ed59ad445e2f16c8f6bd716c3b044.
   This verifies release-source key compatibility; the MSI was not independently unpacked.
3. ALERT GAP: automatic failure email is NOT confirmed for self-service purchases.
   The one_time_v1 catch in api/webhook.js only logs and returns HTTP 500 for Stripe
   retry; it does not call sendFulfilmentAlert. Existing alert tests cover legacy
   fulfillment, not this path. The existing helper uses ALERT_EMAIL or falls back to
   SMTP_USER (production SMTP_USER is hello@ragvault.net). Delivery to the owner's
   personal inbox is not verified. If SMTP itself fails, the same SMTP alert route
   can fail too. Until fixed, check Stripe delivery failures and Vercel logs manually
   for the first sale; do not rely on an alert arriving.
4. Fresh production POST /api/checkout returned HTTP 410.

Live automatic payment-to-webhook-to-license-email delivery remains UNVERIFIED BY
OWNER DECISION. The checks above do not replace an end-to-end paid test.

## First sale: send a key manually

1. In LIVE Stripe, locate the actual customer's Checkout session and successful
   completed/async-success event. Confirm payment_status=paid, the payment was not
   refunded, the purchased line item/quantity, customer email, accepted terms, and
   offer version 2026-11-18. Never issue from an unpaid verification session.
2. Check session fulfillment metadata and delivery logs first. If already delivered,
   resend the same key when available. If recovering a failure, use the original
   successful event snapshot, not mutable customer metadata or today's date.
3. On the trusted owner machine, use the production RSA signer and the existing
   oneTimePurchase(snapshot) payload. Claims must remain:
   edition=team/organization; seats=5/25; org=original buyer name or email;
   iat=session.created; exp=session.created + 3650*86400;
   jti="checkout:" + session.id; renewal_count=0.
   Sign with RS256 and verify against the shipped app public key before sending.
   Do not use a generator that invents a new UUID, start date, or expiry.
   Never paste the private key into email, GitHub, or logs.
4. Send the verified license from hello@ragvault.net to the verified purchase email.
   Include edition, seats, exact expiry, installation instructions, the versioned
   terms URL, self-service exclusions, and the 14-day full-refund policy.
   Windows key path: %APPDATA%/PGVectorRAGIndexer/license.key.
   Linux/macOS key path: ~/.pgvector-license/license.key.
5. Only after successful email submission, merge fulfillment_v1_complete=true and
   issuanceRecord(...) fields into that Checkout session's metadata, preserving
   other metadata. Record manual delivery time and mail receipt/message ID.
   If submission is ambiguous, check sent-mail/provider logs before resending;
   keep the same claims/key so retries cannot create additional rights.
   A completion receipt suppresses subsequent webhook delivery, so never set it
   before the email has been submitted successfully.

This is an operator procedure, not a new automated recovery command. No manual
license was generated or sent during these no-payment checks.
