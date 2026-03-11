import { describe, it, expect } from 'vitest'
import { generateRoomCode, peerIdFromCode, codeFromPeerId, isValidCode } from './roomCode'

const CROCKFORD_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const EXCLUDED_CHARS = ['O', 'I', 'L', 'U']

// ─── generateRoomCode ────────────────────────────────────────────────────────

describe('TC-ROOMCODE-1 — generateRoomCode length', () => {
  it('returns a 6-character string', () => {
    expect(generateRoomCode()).toHaveLength(6)
  })
})

describe('TC-ROOMCODE-2 — generateRoomCode alphabet', () => {
  it('uses only Crockford base-32 characters', () => {
    const code = generateRoomCode()
    for (const char of code) {
      expect(CROCKFORD_ALPHABET).toContain(char)
    }
  })

  it('never contains excluded confusable characters O, I, L, U', () => {
    // Run multiple times to reduce flakiness
    for (let i = 0; i < 20; i++) {
      const code = generateRoomCode()
      for (const excluded of EXCLUDED_CHARS) {
        expect(code).not.toContain(excluded)
      }
    }
  })
})

describe('TC-ROOMCODE-3 — generateRoomCode randomness', () => {
  it('returns different codes on repeated calls', () => {
    const codes = new Set(Array.from({ length: 10 }, () => generateRoomCode()))
    // With 32^6 ≈ 1 billion possibilities, 10 codes should all be unique
    expect(codes.size).toBeGreaterThan(1)
  })
})

// ─── peerIdFromCode ──────────────────────────────────────────────────────────

describe('TC-ROOMCODE-4 — peerIdFromCode', () => {
  it('prepends tongits- prefix to the code', () => {
    expect(peerIdFromCode('ABC123')).toBe('tongits-ABC123')
  })

  it('uppercases lowercase input', () => {
    expect(peerIdFromCode('abc123')).toBe('tongits-ABC123')
  })

  it('trims whitespace from input', () => {
    expect(peerIdFromCode('  AB12CD  ')).toBe('tongits-AB12CD')
  })
})

// ─── codeFromPeerId ──────────────────────────────────────────────────────────

describe('TC-ROOMCODE-5 — codeFromPeerId', () => {
  it('strips the tongits- prefix', () => {
    expect(codeFromPeerId('tongits-ABC123')).toBe('ABC123')
  })

  it('round-trips with peerIdFromCode', () => {
    const code = 'X5T8GZ'
    expect(codeFromPeerId(peerIdFromCode(code))).toBe(code)
  })
})

// ─── isValidCode ─────────────────────────────────────────────────────────────

describe('TC-ROOMCODE-6 — isValidCode accepts valid codes', () => {
  it('accepts a valid 6-char Crockford code', () => {
    expect(isValidCode('ABC123')).toBe(true)
    expect(isValidCode('000000')).toBe(true)
    expect(isValidCode('ZZZZZZ')).toBe(true)
    expect(isValidCode('X5T8GZ')).toBe(true)
  })
})

describe('TC-ROOMCODE-7 — isValidCode rejects wrong length', () => {
  it('rejects codes shorter than 6 characters', () => {
    expect(isValidCode('ABC12')).toBe(false)
    expect(isValidCode('')).toBe(false)
  })

  it('rejects codes longer than 6 characters', () => {
    expect(isValidCode('ABC1234')).toBe(false)
  })
})

describe('TC-ROOMCODE-8 — isValidCode rejects invalid characters', () => {
  it('rejects codes containing excluded letters O, I, L, U', () => {
    expect(isValidCode('OAAAAA')).toBe(false)
    expect(isValidCode('IAAAAA')).toBe(false)
    expect(isValidCode('LAAAAA')).toBe(false)
    expect(isValidCode('UAAAAA')).toBe(false)
  })

  it('rejects lowercase input', () => {
    expect(isValidCode('abc123')).toBe(false)
  })

  it('rejects codes with special characters', () => {
    expect(isValidCode('AB#12!')).toBe(false)
    expect(isValidCode('AB 12C')).toBe(false)
  })
})
