import Peer, { type DataConnection } from 'peerjs'
import type { NetworkMessage } from './types'
import type { GameState, GameAction, PlayerId, GameMode } from '../game/engine'
import { peerIdFromCode, isValidCode } from './roomCode'

export type GuestCallbacks = {
  onConnected: () => void
  onAssigned: (playerId: PlayerId) => void
  onDisconnected: () => void
  onError: () => void
  onSnapshot: (state: GameState) => void
  onLobbySnapshot: (gameMode: GameMode, hostName: string, guestNames: Partial<Record<PlayerId, string>>, guestReady: Partial<Record<PlayerId, boolean>>) => void
}

const CONNECTION_TIMEOUT_MS = 15000

export class GameGuest {
  private peer: Peer | null = null
  private conn: DataConnection | null = null
  private callbacks: GuestCallbacks
  private connectTimer: ReturnType<typeof setTimeout> | null = null

  constructor(callbacks: GuestCallbacks) {
    this.callbacks = callbacks
  }

  private clearConnectTimer() {
    if (this.connectTimer !== null) {
      clearTimeout(this.connectTimer)
      this.connectTimer = null
    }
  }

  connect(roomCode: string, name: string) {
    const normalized = roomCode.toUpperCase().trim()
    if (!isValidCode(normalized)) {
      this.callbacks.onError()
      return
    }
    const fullPeerId = peerIdFromCode(normalized)
    this.peer = new Peer()
    this.peer.on('open', () => {
      const conn = this.peer!.connect(fullPeerId)
      this.conn = conn

      // Timeout if the data channel never opens (e.g. NAT traversal failure)
      this.connectTimer = setTimeout(() => {
        this.connectTimer = null
        this.destroy()
        this.callbacks.onError()
      }, CONNECTION_TIMEOUT_MS)

      conn.on('open', () => {
        this.clearConnectTimer()
        // Immediately send our name so host can assign us a slot
        const msg: NetworkMessage = { type: 'PLAYER_JOIN', name }
        conn.send(msg)
        this.callbacks.onConnected()
      })

      conn.on('data', (raw: unknown) => {
        const msg = raw as NetworkMessage
        if (msg.type === 'PLAYER_ASSIGNMENT') {
          this.callbacks.onAssigned(msg.playerId)
        } else if (msg.type === 'STATE_SNAPSHOT') {
          this.callbacks.onSnapshot(msg.state)
        } else if (msg.type === 'LOBBY_SNAPSHOT') {
          this.callbacks.onLobbySnapshot(msg.gameMode, msg.hostName, msg.guestNames, msg.guestReady)
        }
      })

      conn.on('close', () => {
        this.callbacks.onDisconnected()
      })

      conn.on('error', () => {
        this.clearConnectTimer()
        this.callbacks.onError()
      })
    })

    this.peer.on('error', () => {
      this.clearConnectTimer()
      this.callbacks.onError()
    })
  }

  sendIntent(action: GameAction) {
    if (this.conn?.open) {
      const msg: NetworkMessage = { type: 'ACTION_INTENT', action }
      this.conn.send(msg)
    }
  }

  sendReady(playerId: PlayerId, ready: boolean) {
    if (this.conn?.open) {
      const msg: NetworkMessage = { type: 'GUEST_READY', playerId, ready }
      this.conn.send(msg)
    }
  }

  destroy() {
    this.clearConnectTimer()
    this.peer?.destroy()
    this.peer = null
    this.conn = null
  }
}
