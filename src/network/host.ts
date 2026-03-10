import Peer, { type DataConnection } from 'peerjs'
import type { NetworkMessage } from './types'
import type { GameState, GameAction, PlayerId } from '../game/engine'
import { generateRoomCode, peerIdFromCode, codeFromPeerId } from './roomCode'

export type HostCallbacks = {
  onRoomCode: (code: string) => void
  onGuestConnected: (playerId: PlayerId, name: string, sendSnapshot: (state: GameState) => void) => void
  onGuestDisconnected: (playerId: PlayerId) => void
  onActionIntent: (action: GameAction, fromPlayerId: PlayerId) => void
  onError?: (type: string) => void
}

export class GameHost {
  private peer: Peer | null = null
  private connections: DataConnection[] = []
  private connToPlayer: Map<DataConnection, PlayerId> = new Map()
  private callbacks: HostCallbacks

  constructor(callbacks: HostCallbacks) {
    this.callbacks = callbacks
  }

  init() {
    const code = generateRoomCode()
    const peerId = peerIdFromCode(code)
    this.peer = new Peer(peerId)
    this.peer.on('open', id => {
      this.callbacks.onRoomCode(codeFromPeerId(id))
    })
    this.peer.on('error', (err: { type: string }) => {
      if (err.type === 'unavailable-id') {
        this.peer?.destroy()
        this.peer = null
        this.init()
      } else {
        this.callbacks.onError?.(err.type)
      }
    })

    this.peer.on('connection', conn => {
      this.connections.push(conn)

      // Assign the next available guest slot
      const assignedId: PlayerId = this.connToPlayer.size === 0 ? 'guest' : 'guest2'

      conn.on('open', () => {
        // Wait for PLAYER_JOIN to get the guest's name, then assign slot
        // Pre-register the connection so data handler can look it up
        this.connToPlayer.set(conn, assignedId)
      })

      conn.on('data', (raw: unknown) => {
        const msg = raw as NetworkMessage
        if (msg.type === 'PLAYER_JOIN') {
          // Send the player their assigned slot
          const assignment: NetworkMessage = { type: 'PLAYER_ASSIGNMENT', playerId: assignedId }
          if (conn.open) conn.send(assignment)
          this.callbacks.onGuestConnected(assignedId, msg.name, (state: GameState) => {
            const snapshot: NetworkMessage = { type: 'STATE_SNAPSHOT', state }
            if (conn.open) conn.send(snapshot)
          })
        } else if (msg.type === 'ACTION_INTENT') {
          const fromPlayerId = this.connToPlayer.get(conn)
          if (fromPlayerId) {
            this.callbacks.onActionIntent(msg.action, fromPlayerId)
          }
        }
      })

      conn.on('close', () => {
        const playerId = this.connToPlayer.get(conn)
        this.connections = this.connections.filter(c => c !== conn)
        this.connToPlayer.delete(conn)
        if (playerId) {
          this.callbacks.onGuestDisconnected(playerId)
        }
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
    this.connToPlayer.clear()
  }
}
