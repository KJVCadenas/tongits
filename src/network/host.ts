import Peer, { type DataConnection } from 'peerjs'
import type { NetworkMessage } from './types'
import type { GameState, GameAction } from '../game/engine'

export type HostCallbacks = {
  onRoomCode: (code: string) => void
  onGuestConnected: (sendSnapshot: (state: GameState) => void) => void
  onGuestDisconnected: () => void
  onActionIntent: (action: GameAction) => void
}

export class GameHost {
  private peer: Peer | null = null
  private connections: DataConnection[] = []
  private callbacks: HostCallbacks

  constructor(callbacks: HostCallbacks) {
    this.callbacks = callbacks
  }

  init() {
    this.peer = new Peer()
    this.peer.on('open', id => {
      this.callbacks.onRoomCode(id)
    })

    this.peer.on('connection', conn => {
      this.connections.push(conn)
      conn.on('open', () => {
        this.callbacks.onGuestConnected((state: GameState) => {
          const msg: NetworkMessage = { type: 'STATE_SNAPSHOT', state }
          if (conn.open) conn.send(msg)
        })
      })
      conn.on('data', (raw: unknown) => {
        const msg = raw as NetworkMessage
        if (msg.type === 'ACTION_INTENT') {
          this.callbacks.onActionIntent(msg.action)
        }
      })
      conn.on('close', () => {
        this.connections = this.connections.filter(c => c !== conn)
        this.callbacks.onGuestDisconnected()
      })
    })
  }

  broadcastSnapshot(state: GameState) {
    const msg: NetworkMessage = { type: 'STATE_SNAPSHOT', state }
    for (const conn of this.connections) {
      if (conn.open) conn.send(msg)
    }
  }

  destroy() {
    this.peer?.destroy()
    this.peer = null
    this.connections = []
  }
}
