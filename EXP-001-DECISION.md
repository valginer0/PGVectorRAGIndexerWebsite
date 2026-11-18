# EXP-001 owner decision and fulfillment repair

Owner approval: November 17, 2026 (America/Chicago), in the project conversation.

## Approved offer and recovery policy

- Pay once for the existing 3,650-day license (approximately ten years), with all updates to the purchased edition included during that term, including major versions.
- No perpetual or major-version-limited license is being introduced.
- A recovery attempt may repeat the email, but must carry the identical license and must not add seats or extend expiry.
- Future offers may change; existing buyers retain their purchased terms.
- No new database or email provider. Stripe remains the purchase record; Zoho SMTP remains notification delivery.
- This approval does not activate unattended engineering agents or authorize model spending.

## Objective and minimum change

Make new one-time website checkouts reproducible after retries, concurrent deliveries and ambiguous SMTP outcomes. The old customer-wide last-session pointer can forget older purchases, and the old signer uses a new UUID and current time on every attempt.

The checkout server now attaches a versioned fulfillment contract and selected price ID. The signed checkout.session.completed event supplies the purchase snapshot: edition, seats, customer details, session ID and creation time. The handler checks paid status and the actual session line item before signing. It never derives these claims from later customer/product/subscription metadata.

The v1 issue time is the session creation timestamp; expiry is exactly 3,650 days later. Emails display that fixed expiry. A checkout session can precede payment, so this is not a promise of ten calendar years measured from card settlement. Public offer copy and the purchase confirmation must disclose the precise term/date before launch.

A session-specific completion receipt suppresses later duplicates. It is not a lock. Simultaneous handlers may both send, but sign identical claims with the same RSA key. A failure before the receipt returns HTTP 500 for Stripe retry. A successful receipt with a lost API response suppresses the next send.

The receipt includes the stable revocation handle. No customer-wide metadata is overwritten. Keep the v1 signing key and claim derivation stable for retries; key rotation requires an explicit compatibility plan.

## Scope and limitations

- Applies to new payment-mode sessions created by this checkout endpoint with fulfillment_version=one_time_v1.
- Existing sessions and subscriptions retain their legacy paths. Known subscription replay defects are NOT fixed by this change.
- The checkout endpoint currently allows cards only. Do not enable delayed payment methods without adding and testing async-payment fulfillment.
- Concurrent sends and injected failures are tested with provider doubles. This is not proof of live SMTP behavior, provider delivery or real process-kill recovery.
- Retry counts are not enforced atomically. No exact bound on duplicate notifications is claimed.
- After Stripe's retries are exhausted, an owner must inspect and redeliver the original completed event. No new background reconciliation service is introduced.
- The frozen invoice acceptance in PivaroFoundry PR #196 remains unchanged.

## Acceptance and release stopping point

Tests exercise the real webhook and RS256 signer using a temporary key: paid claims, old purchase replay after another purchase, concurrency, SMTP accepted/lost response, post-send receipt failure, receipt-success/response-loss, unpaid sessions, mismatched line item, and missing purchase terms.

Before EXP-001 launch:
1. Review the local repair and approved offer copy; preserve existing customer terms.
2. Confirm preview deployments do not expose production credentials before pushing a website branch.
3. Run a Stripe test-mode checkout through the deployed test endpoint and verify the resulting license in the application.
4. Release under owner control and verify the production commit. Source inspection alone does not identify Vercel's deployed revision.

Rollback: revert the repair before accepting v1 purchases. Once v1 purchases exist, preserve their replay handler and signing key; reverting to legacy random issuance would violate their recovery contract.

## Validation evidence

- Website base: 247760690dbdb503542202f63a18a758221edf35.
- npm test -- --reporter=dot: 156 passed across 5 test files (147 existing, 9 new).
- npm run build: passed.
- Cross-language check: tests/validate_one_time_license.py passed using fetched application validator sources, not the older local desktop checkout.
- App license.py Git blob: 2993befa15cbcf437f19097bca4cc80a9e7495e1.
- App license_utils.py Git blob: 546598a4c4ffbbb5f79762dd71a3b2e989ed5c96.
- Cross-language environment: Python virtual environment with PyJWT 2.10.1 and cryptography 46.0.3. A temporary RSA key was generated; no production signing key was used.
- No paid model call, Stripe mutation, SMTP send, push, deployment, or production checkout was performed.
