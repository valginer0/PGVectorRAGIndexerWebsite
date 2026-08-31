/**
 * Automated content verification for client-facing website files.
 *
 * Replaces the manual visual-inspection checklist from the release plan.
 * No browser, no network — pure filesystem reads via Node `fs`.  Runs in < 1s.
 *
 * Checks:
 *   index.html : pricing, Smart Search card, test count, version, SSO, teams features
 *   demo.html  : feature cards, responsive CSS grid breakpoints
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

const index = readFileSync(resolve(root, 'index.html'), 'utf-8')
const demo  = readFileSync(resolve(root, 'demo.html'),  'utf-8')

// ── index.html ────────────────────────────────────────────────────────────────

describe('index.html — pricing', () => {
  it('Team annual price is $299', () => {
    expect(index).toContain('data-annual="299"')
  })

  it('Team perpetual price is $499', () => {
    expect(index).toContain('data-perpetual="499"')
  })

  it('Org annual price is $799', () => {
    expect(index).toContain('data-annual="799"')
  })

  it('Org perpetual price is $1299', () => {
    expect(index).toContain('data-perpetual="1299"')
  })

  it('old Team price $199 is gone', () => {
    expect(index).not.toContain('data-annual="199"')
  })

  it('old Org price $599 is gone', () => {
    expect(index).not.toContain('data-annual="599"')
  })

  // Was: expect(index).toContain('$799'), which passed only because the
  // stacking FAQ spelled the price out in prose. That prose was a duplicate of
  // the card's own figure and has been removed, so the assertion now checks
  // the single place the price is declared.
  it('declares the Org price once, on the card', () => {
    expect(index).toContain('id="org-price"')
    expect(index).toContain('data-annual="799"')
    expect((index.match(/data-annual="799"/g) || []).length).toBe(1)
  })
})

describe('index.html — licence stacking is visible on the card', () => {
  // The FAQ always explained stacking, but the pricing card said "Up to 25
  // users" next to an Enterprise card offering "Unlimited users", so a
  // 60-user buyer read a ceiling and went looking for a salesperson.
  it('states the 25-user figure as per-licence, not as a ceiling', () => {
    expect(index).toContain('25 users per licence')
    expect(index).not.toContain('&#10003;</span> Up to 25 users')
  })

  it('does not sell "Unlimited users" as an Enterprise differentiator', () => {
    // Stacking already delivers it to any Organization buyer. Asserted against
    // the feature bullet specifically: a bare substring check also matches the
    // source comment explaining why the bullet went, which would fail for the
    // wrong reason.
    expect(index).not.toContain('&#10003;</span> Unlimited users')
  })

  it('shows the arithmetic on the card', () => {
    expect(index).toContain('id="seat-count"')
    expect(index).toContain('ORG_SEATS_PER_LICENCE = 25')
  })

  // The calculator emits something that reads like a quote, so a second copy
  // of the price could tell a buyer one number while Stripe charges another.
  // It must read the figure off the card, not carry its own.
  it('derives the price from the card instead of hardcoding a second copy', () => {
    expect(index).toContain('id="org-price"')
    expect(index).toMatch(/el\.dataset\[activeBilling\]/)
    expect(index).not.toMatch(/ORG_PRICE\s*=\s*\{/)
  })

  it('does not restate the stacking arithmetic in prose that can drift', () => {
    // The FAQ used to hardcode "50 users = 2 x $799/yr = $1,598/yr".
    expect(index).not.toContain('$1,598')
  })

  it('no longer tells 100+ user buyers that they must contact sales', () => {
    expect(index).not.toContain('Need 100+ users?')
    expect(index).toMatch(/including past 100 users/i)
  })

  it('tells the buyer what to do with several keys', () => {
    expect(index).toMatch(/load every key into your\s+server/i)
  })
})

describe('index.html — features', () => {
  it('feature card says Smart Search, not Hybrid Search', () => {
    expect(index).toContain('Smart Search')
  })

  it('test count is 1,500+', () => {
    expect(index).toMatch(/1[,.]?500\+/)
  })

  it('SSO description mentions Okta', () => {
    expect(index).toContain('Okta and compatible IdPs')
  })

  it('teams section includes per-user document visibility', () => {
    expect(index).toContain('Per-user document visibility')
  })

  it('teams section includes Admin Console with SCIM', () => {
    expect(index).toContain('SCIM')
  })
})

describe('index.html — metadata', () => {
  it('footer version matches package.json', () => {
    const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf-8'))
    expect(index).toContain(`Version ${pkg.version}`)
  })

  it('contact email is hello@ragvault.net', () => {
    expect(index).toContain('hello@ragvault.net')
  })

  it('old personal email is absent', () => {
    expect(index).not.toContain('valginer0@gmail.com')
  })

  it('Windows installer link is .msi', () => {
    expect(index).toContain('PGVectorRAGIndexer.msi')
  })

  it('old .exe installer link is absent', () => {
    expect(index).not.toContain('PGVectorRAGIndexer-Setup.exe')
  })

  it('installer URL is a GitHub releases download link', () => {
    expect(index).toMatch(/releases\/download\/v[\d.]+\/PGVectorRAGIndexer\.msi/)
  })

  it('newsletter signup (Kit) is removed', () => {
    expect(index).not.toMatch(/kit\.com|convertkit|email-signup|newsletter/i)
  })
})

// ── demo.html ─────────────────────────────────────────────────────────────────

describe('demo.html — feature cards', () => {
  it('has "Built for Teams" card', () => {
    expect(demo).toContain('Built for Teams')
  })

  it('has "License Stacking" card', () => {
    expect(demo).toContain('License Stacking')
  })

  it('has "100% Private" card', () => {
    expect(demo).toContain('100% Private')
  })
})

describe('demo.html — responsive layout', () => {
  it('feature grid uses 3-column layout', () => {
    expect(demo).toContain('1fr 1fr 1fr')
  })

  it('has 800px tablet breakpoint', () => {
    expect(demo).toContain('max-width: 800px')
  })

  it('has 500px mobile breakpoint', () => {
    expect(demo).toContain('max-width: 500px')
  })
})

describe('demo.html — metadata', () => {
  // The hosted demo (Render + Neon) was replaced by a recorded walkthrough.
  // Assert that, so a future reviewer doesn't "fix" this by re-adding a
  // cloud backend link to a page selling local-only search.
  it('shows a recorded walkthrough, not a hosted backend', () => {
    expect(demo).toContain('demo-walkthrough.webm')
    expect(demo).not.toContain('onrender.com')
  })
})
