import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { GuestCallbacks } from './guest'

// Mock peerjs before importing GameGuest so the constructor is interceptable
vi.mock('peerjs', () => ({ default: vi.fn() }))

import Peer from 'peerjs'
import { GameGuest } from './guest'

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeCallbacks(overrides: Partial<GuestCallbacks> = {}): GuestCallbacks {
  return {
    onConnected: vi.fn(),
    onAssigned: vi.fn(),
    onDisconnected: vi.fn(),
    onError: vi.fn(),
    onSnapshot: vi.fn(),
    onLobbySnapshot: vi.fn(),
    ...overrides,
  }
}

type MockConn = {
  on: ReturnType<typeof vi.fn>
  send: ReturnType<typeof vi.fn>
  open: boolean
  _handlers: Record<string, (...args: unknown[]) => void>
}

type MockPeerInstance = {
  on: ReturnType<typeof vi.fn>
  connect: ReturnType<typeof vi.fn>
  destroy: ReturnType<typeof vi.fn>
  _handlers: Record<string, (...args: unknown[]) => void>
}

function makeMockConn(): MockConn {
  const conn: MockConn = {
    on: vi.fn(),
    send: vi.fn(),
    open: false,
    _handlers: {},
  }
  conn.on.mockImplementation((event: string, cb: (...args: unknown[]) => void) => {
    conn._handlers[event] = cb
  })
  return conn
}

function makeMockPeer(conn: MockConn): MockPeerInstance {
  const peer: MockPeerInstance = {
    on: vi.fn(),
    connect: vi.fn().mockReturnValue(conn),
    destroy: vi.fn(),
    _handlers: {},
  }
  peer.on.mockImplementation((event: string, cb: (...args: unknown[]) => void) => {
    peer._handlers[event] = cb
  })
  vi.mocked(Peer).mockImplementation(() => peer as unknown as Peer)
  return peer
}

// ─── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.mocked(Peer).mockReset()
})

// TC-GUEST-1 ──────────────────────────────────────────────────────────────────

describe('TC-GUEST-1 — invalid room code triggers onError immediately', () => {
  it('calls onError without constructing a Peer when code is invalid', () => {
    const cbs = makeCallbacks()
    const guest = new GameGuest(cbs)

    guest.connect('bad!code', 'Player')

    expect(cbs.onError).toHaveBeenCalledOnce()
    // Peer constructor should never have been called
    expect(Peer).not.toHaveBeenCalled()
    expect(cbs.onConnected).not.toHaveBeenCalled()
  })
})

// TC-GUEST-2 ──────────────────────────────────────────────────────────────────

describe('TC-GUEST-2 — connection timeout fires after 15 s if conn never opens', () => {
  it('calls onError and destroys peer after 15 s when data channel stalls', () => {
    vi.useFakeTimers()
    try {
      const conn = makeMockConn()
      const peer = makeMockPeer(conn)
      const cbs = makeCallbacks()
      const guest = new GameGuest(cbs)

      guest.connect('ABC123', 'Player')

      // Simulate signaling server acknowledgment (peer 'open')
      peer._handlers['open']?.()

      // Data channel never opens — onConnected and onError should not fire yet
      expect(cbs.onConnected).not.toHaveBeenCalled()
      expect(cbs.onError).not.toHaveBeenCalled()

      // Advance past the 15 s timeout
      vi.advanceTimersByTime(15000)

      expect(cbs.onError).toHaveBeenCalledOnce()
      // destroy() should have been called as part of cleanup
      expect(peer.destroy).toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })
})

// TC-GUEST-3 ──────────────────────────────────────────────────────────────────

describe('TC-GUEST-3 — successful connection clears timeout', () => {
  it('calls onConnected and does not call onError even after 15 s', () => {
    vi.useFakeTimers()
    try {
      const conn = makeMockConn()
      const peer = makeMockPeer(conn)
      const cbs = makeCallbacks()
      const guest = new GameGuest(cbs)

      guest.connect('ABC123', 'Player')

      // Simulate peer 'open' (signaling server responds)
      peer._handlers['open']?.()

      // Simulate data channel opening before the timeout
      conn._handlers['open']?.()

      expect(cbs.onConnected).toHaveBeenCalledOnce()
      // PLAYER_JOIN message should have been sent immediately on open
      expect(conn.send).toHaveBeenCalledOnce()
      const sentMsg = conn.send.mock.calls[0][0] as { type: string; name: string }
      expect(sentMsg.type).toBe('PLAYER_JOIN')
      expect(sentMsg.name).toBe('Player')

      // Advance well past the timeout — onError must NOT fire
      vi.advanceTimersByTime(20000)

      expect(cbs.onError).not.toHaveBeenCalled()
      expect(peer.destroy).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })
})
