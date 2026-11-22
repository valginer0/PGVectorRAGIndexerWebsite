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
3. Failure-alert gap fixed: the one_time_v1 catch now calls sendFulfilmentAlert
   for checkout.session.completed and checkout.session.async_payment_succeeded.
   The alert includes Checkout session/event IDs and explains that the license may
   already have been sent if recording completion failed. HTTP 500 remains intact
   for Stripe retry, including when the alert itself fails.
   Production ALERT_EMAIL=valginer0@gmail.com was explicitly configured.
   One test message through the production Zoho SMTP settings was accepted with
   SMTP 250 and confirmed in that Gmail inbox on November 18 at 21:12 Central,
   subject "RagVault production alert email test - November 18, 2026".
   This verifies SMTP transport and inbox arrival, not automatic failure detection.
   No live payment or synthetic production webhook was sent. The same SMTP outage can prevent both customer
   mail and operator alerts; Vercel logs and Stripe failures remain the fallback.
   Offline tests cover both event types, operator recipient/fallback, alert failure,
   ambiguous receipt writes, and no alerts on success/duplicates/unpaid sessions.
4. Fresh production POST /api/checkout returned HTTP 410.

Live automatic payment-to-webhook-to-license-email delivery remains UNVERIFIED BY
OWNER DECISION. The checks above do not replace an end-to-end paid test.

## First sale: recover delivery; manual signing only as a last resort

1. Fix the cause, then resend the original event from the Stripe dashboard to
   the production webhook endpoint. Inspect the failure, Vercel logs, completion
   metadata, and sent-mail/provider logs before resending: a license email may
   already have been submitted even if recording completion failed. Use the
   original successful payment event and preserve its purchase snapshot; do not
   create a new payment or substitute a newly constructed event. Confirm the retry
   returns HTTP 200 and that the customer's license email was delivered. If it
   reports a duplicate, check the existing delivery record and resend the same
   key if necessary. Manual signing below is the last resort, only if correcting
   and replaying the original event cannot restore delivery.
2. In LIVE Stripe, locate the actual customer's Checkout session and successful
   completed/async-success event. Confirm payment_status=paid, the payment was not
   refunded, the purchased line item/quantity, customer email, accepted terms, and
   offer version 2026-11-18. Never issue from an unpaid verification session.
3. Check session fulfillment metadata and delivery logs first. If already delivered,
   resend the same key when available. If recovering a failure, use the original
   successful event snapshot, not mutable customer metadata or today's date.
4. On the trusted owner machine, use the production RSA signer and the existing
   oneTimePurchase(snapshot) payload. Claims must remain:
   edition=team/organization; seats=5/25; org=original buyer name or email;
   iat=session.created; exp=session.created + 3650*86400;
   jti="checkout:" + session.id; renewal_count=0.
   Sign with RS256 and verify against the shipped app public key before sending.
   Do not use a generator that invents a new UUID, start date, or expiry.
   Never paste the private key into email, GitHub, or logs.
5. Send the verified license from hello@ragvault.net to the verified purchase email.
   Include edition, seats, exact expiry, installation instructions, the versioned
   terms URL, self-service exclusions, and the 14-day full-refund policy.
   Windows key path: %APPDATA%/PGVectorRAGIndexer/license.key.
   Linux/macOS key path: ~/.pgvector-license/license.key.
6. Only after successful email submission, merge fulfillment_v1_complete=true and
   issuanceRecord(...) fields into that Checkout session's metadata, preserving
   other metadata. Record manual delivery time and mail receipt/message ID.
   If submission is ambiguous, check sent-mail/provider logs before resending;
   keep the same claims/key so retries cannot create additional rights.
   A completion receipt suppresses subsequent webhook delivery, so never set it
   before the email has been submitted successfully.

This is an operator procedure, not a new automated recovery command. No manual
license was generated or sent during these no-payment checks.

## Independent production alert, webhook and key checks — November 20, 2026 (Central)

Evidence below distinguishes connected API reads from owner observations made in the Stripe/Vercel interfaces. No payment, synthetic webhook, credential change, deployment, or settings change was made in these checks.

### Confirmed through connected Vercel and Stripe reads

- Vercel production `ALERT_EMAIL` is `valginer0@gmail.com` (variable ID `FoUxjM3005INXv3M`). The Vercel API returned `createdAt=updatedAt=2026-11-20T01:49:32.679Z`, corresponding to **November 19, 2026 19:49:32.679 CST**. The same timestamp was returned upon recheck November 20.
- Production deployment `dpl_5iQhXwQEjXHwbmJqLfNsK5DJbf2K` was created at `2026-11-20T01:53:11.127Z`, build started `2026-11-20T01:53:12.490Z`, and was READY at `2026-11-20T01:53:27.215Z`. It is a `production` deployment assigned to `www.ragvault.net` with Git SHA `3801349afe1b5e4200995c245050b15feed5647b`. The build started roughly **3 min 40 sec after** the API-recorded creation of `ALERT_EMAIL`. This verifies ordering for that variable record, not successful alert delivery.
- The live Stripe webhook endpoint `we_1T8ROORc9V96VoFQ8OApFOWQ` is enabled at `https://www.ragvault.net/api/webhook` and subscribes to `invoice.paid`, `checkout.session.completed`, `checkout.session.async_payment_succeeded`, and `checkout.session.async_payment_failed`.

### Owner-verified in Stripe and Vercel interfaces — November 20, 2026

- The live Stripe webhook signing secret matched the production Vercel `STRIPE_WEBHOOK_SECRET` in the characters compared by the owner. This is an owner-reported partial comparison, **not** an independent full-value cryptographic comparison. No secret values are recorded here.
- The live webhook endpoint showed **no deliveries on record**. Consequently there is **no delivery HTTP response status to report**, including for `invoice.paid`. Do not characterize this as successful or failed delivery; end-to-end live payment fulfillment remains unverified by owner decision.
- Stripe account email notifications for **“Webhook failures” are enabled**, confirmed by the owner in Stripe's interface. This is separate from the application SMTP operator alerts; the November 18 SMTP test verified inbox arrival, not live automatic failure detection.
- Vercel flagged both `STRIPE_WEBHOOK_SECRET` and `LICENSE_PRIVATE_KEY` as **“Needs Attention”** because of readable/non-Secret environment-variable type. **By explicit owner decision, neither is changed or rotated at this time.** Do not disclose either secret in this document or logs. Do not rotate `LICENSE_PRIVATE_KEY` without the owner's explicit approval and a license-compatibility/migration plan: replacing the current signing key without preserving verification compatibility could invalidate previously issued licenses.
- The Vercel UI displayed `ALERT_EMAIL` as **“Added 2d ago”**, interpreted by the owner as approximately November 18. This conflicts with, or may reflect different UI rounding/semantics from, the exact November 19 19:49:32 CST API-created timestamp above. **Both observations are retained without guessing which date represents the initial configuration. Do not retroactively alter the existing November 18 release record on this basis.**

### Operational disposition

- Stripe failure-notification preference and the empty delivery history are now recorded as **owner verified**; the earlier November 20 note that those items had not yet been checked is superseded.
- No live card charge, purchase/refund, webhook replay, forced delivery, key rotation, or redeployment is authorized or performed here.
- For the first actual sale: inspect the original successful payment event and Vercel logs, fix any failure cause, then resend the **original** Stripe event if necessary; manual signing remains the last resort, as documented above.
