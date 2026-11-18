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
- Concurrent sends and injected exceptions are covered with provider doubles. Real SMTP delivery and deliberate receipt-loss replay were also verified as recorded below; a real process-kill recovery test was not performed.
- Retry counts are not enforced atomically. No exact bound on duplicate notifications is claimed.
- After Stripe's retries are exhausted, an owner must inspect and redeliver the original completed event. No new background reconciliation service is introduced.
- The frozen invoice acceptance in PivaroFoundry PR #196 remains unchanged.

## Acceptance and release stopping point

Tests exercise the real webhook and RS256 signer using a temporary key: paid claims, old purchase replay after another purchase, concurrency, SMTP accepted/lost response, post-send receipt failure, receipt-success/response-loss, unpaid sessions, mismatched line item, and missing purchase terms.

Before EXP-001 launch:
1. Review the local repair and approved offer copy; preserve existing customer terms.
2. Use the explicitly approved, recipient-restricted preview test configuration; never treat it as a general isolation boundary for unreviewed code.
3. Complete sandbox checkout and deployed fulfillment validation (done via an authenticated event relay; see evidence below).
4. Release under owner control and verify the production commit. Source inspection alone does not identify Vercel's deployed revision.

Rollback: revert the repair before accepting v1 purchases. Once v1 purchases exist, preserve their replay handler and signing key; reverting to legacy random issuance would violate their recovery contract.

## Validation evidence (November 17, 2026, America/Chicago)

- Tested code commit: f0026d09b476ccf19b088a3b5e5505bf5a90a8ec; website base: 247760690dbdb503542202f63a18a758221edf35.
- npm test: 163 passed across 6 files; npm run build passed. GitHub content-checks and Vercel build passed.
- Regression: a generated RSA key with inconsistent public/private components reproduced delivery of an unverifiable token before the fix. The signer now verifies its output before sending or recording completion.
- App validator sources: license.py blob 2993befa15cbcf437f19097bca4cc80a9e7495e1; license_utils.py blob 546598a4c4ffbbb5f79762dd71a3b2e989ed5c96. Python environment: PyJWT 2.10.1, cryptography 46.0.3.
- Actual browser checkout in Stripe Sandbox completed a $499 Team payment. Session: cs_test_b0mRVFnkDVYMG0U4Xmg4j8wFrLeKT4UygHeJh1MdfKA5mfCU2gu7utkvFt. Completed event: evt_1Ud0XJRc9V96VoFQeG8Nub4u. No real-money charge.
- The actual Stripe event was fetched by API and signed locally for relay to the protected preview. This validates deployed fulfillment and real SMTP delivery, not automatic Stripe-to-preview webhook transport.
- Final tested deployment: dpl_HLFamoUWdB1JgmXekPXnL24vWdpZ, Node 24.x, code f0026d0.
- Real Zoho emails reached the approved owner mailbox. The initial preview key produced an invalid signature, including when locally signing and verifying with its own public key. A fresh test-only key is now scoped to this branch; production signing credentials were not modified.
- For the same paid sandbox purchase, the test deliberately removed its completion marker, delivered the event, removed the marker again to simulate a missing post-send receipt, and delivered again. The two final emails contained byte-identical tokens. The actual application validator accepted the emailed token with the preview public key: Team, five seats, matching purchase ID, exactly 3,650 days; tampering was rejected.
- A third delivery with the completion marker intact returned HTTP 200 / Duplicate session. This was controlled receipt-loss simulation, not a real process crash.
- The test-mode endpoint we_1T1iYTRc9V96VoFQsMUbhDn5 targets production. It was paused only during the sandbox payment, then restored and verified enabled at its original URL. The existing live-mode endpoint was not changed.
- All temporary one-hour preview access links created for testing were revoked.

## Preview configuration and release limits

- Branch-specific test prices now match the advertised offer: Team $499 (price_1Ud0V3Rc9V96VoFQ8vPo658U) and Organization $1,299 (price_1Ud0V4Rc9V96VoFQzbdeYYN4), with 3,650-day product descriptions. No live prices were changed.
- Preview email requires a test-mode Stripe key and exactly PREVIEW_EMAIL_RECIPIENT=valginer0@gmail.com, with no CC/BCC. The owner explicitly authorized use of the existing Zoho credential for this controlled test. This code guard is not a general credential boundary against unreviewed code.
- The preview checkout's existing SITE_URL points to production, so its success redirect also went there; this browser reported Site Unavailable. Stripe API independently confirmed paid status. A working customer-facing success redirect was not established by this test.
- Production was last verified at deployment dpl_HdoP4R9T3uXp4roK9sACQAagkopm / commit 247760690dbdb503542202f63a18a758221edf35. No production merge or deployment was performed.
- Before production release, verify live price descriptions/amounts, signing-key compatibility with the shipped app, and the customer success page. The preview public key is deliberately different from the shipped application's production key.
- No paid model calls or new database/email provider were introduced.

## Production release checks (November 17, 2026)

- Production RSA private-key mathematical validation passed. Its public key matches PUBLIC_KEY_DEFAULT in the actual shipped v2.17.2 license.py (Git blob 2993befa15cbcf437f19097bca4cc80a9e7495e1). No production key was changed and no production license was issued.
- Production environment overrides select active live one-time USD prices: Team price_1Tq1olRc9V96VoFQMZItlOmj = $499; Organization price_1Tq1oxRc9V96VoFQ7iwcWjQk = $1,299. Products describe five and 25 users respectively; no conflicting one-year term appears in their customer-facing descriptions. Internal price nicknames retain the historical word Perpetual; lookup keys remain unchanged for compatibility.
- Production SITE_URL is https://www.ragvault.net. GET /index.html from the owner's desktop returned HTTP 200 and included the purchase-success modal. Source displays it on DOMContentLoaded for #purchase-success. The cloud browser continued to show Site Unavailable, so visual verification on that browser remains unavailable; this is not evidence that the public site is down.
- No live price, production environment variable, production deployment or live payment was changed during these checks.
- The remaining owner decision is approval to merge website PR #1 and allow its normal production deployment. After release, verify the deployed commit and public offer. No real-money checkout is included in that approval request.
