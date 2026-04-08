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

  it('stacking FAQ references $799', () => {
    expect(index).toContain('$799')
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
  it('footer shows version 2.13.0', () => {
    expect(index).toContain('Version 2.13.0')
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
  it('references demo backend URL', () => {
    expect(demo).toContain('demo-pgvectorrag.onrender.com')
  })
})
