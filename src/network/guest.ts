import Peer, { type DataConnection } from 'peerjs'
import type { NetworkMessage } from './types'
import type { GameState, GameAction } from '../game/engine'

export type GuestCallbacks = {
  onConnected: () => void
  onDisconnected: () => void
  onError: () => void
  onSnapshot: (state: GameState) => void
}

export class GameGuest {
  private peer: Peer | null = null
  private conn: DataConnection | null = null
  private callbacks: GuestCallbacks

  constructor(callbacks: GuestCallbacks) {
    this.callbacks = callbacks
  }

  connect(roomCode: string) {
    this.peer = new Peer()
    this.peer.on('open', () => {
      const conn = this.peer!.connect(roomCode)
      this.conn = conn

      conn.on('open', () => {
        this.callbacks.onConnected()
      })

      conn.on('data', (raw: unknown) => {
        const msg = raw as NetworkMessage
        if (msg.type === 'STATE_SNAPSHOT') {
          this.callbacks.onSnapshot(msg.state)
        }
      })

      conn.on('close', () => {
        this.callbacks.onDisconnected()
      })

      conn.on('error', () => {
        this.callbacks.onError()
      })
    })

    this.peer.on('error', () => {
      this.callbacks.onError()
    })
  }

  sendIntent(action: GameAction) {
    if (this.conn?.open) {
      const msg: NetworkMessage = { type: 'ACTION_INTENT', action }
      this.conn.send(msg)
    }
  }

  destroy() {
    this.peer?.destroy()
    this.peer = null
    this.conn = null
  }
}
