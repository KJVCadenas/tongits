// Crockford base-32 alphabet: removes O, I, L, U (visually confusable)
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const CODE_LENGTH = 6
const PEER_ID_PREFIX = 'tongits-'

export function generateRoomCode(): string {
  const result: string[] = []
  while (result.length < CODE_LENGTH) {
    const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH * 2))
    for (const byte of bytes) {
      if (result.length >= CODE_LENGTH) break
      // Rejection sampling: discard bytes >= 224 to avoid modulo bias (224 = 7 * 32)
      if (byte < 224) result.push(ALPHABET[byte % 32])
    }
  }
  return result.join('')
}

export function peerIdFromCode(code: string): string {
  return `${PEER_ID_PREFIX}${code.toUpperCase().trim()}`
}

export function codeFromPeerId(peerId: string): string {
  return peerId.slice(PEER_ID_PREFIX.length)
}

export function isValidCode(code: string): boolean {
  return code.length === CODE_LENGTH && [...code].every(c => ALPHABET.includes(c))
}
