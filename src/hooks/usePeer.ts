import { useEffect, useRef, useState } from 'react'
import { GameHost } from '../network/host'
import { GameGuest } from '../network/guest'
import { useGameStore } from '../store/gameStore'
import { useUIStore } from '../store/uiStore'
import type { GameAction } from '../game/engine'

export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'error'

export function usePeer() {
  const [roomCode, setRoomCode] = useState<string | null>(null)
  const [guestConnected, setGuestConnected] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('idle')

  const hostRef = useRef<GameHost | null>(null)
  const guestRef = useRef<GameGuest | null>(null)

  const dispatch = useGameStore(s => s.dispatch)
  const syncFromHost = useGameStore(s => s.syncFromHost)
  const game = useGameStore(s => s.game)
  const role = useUIStore(s => s.role)

  // Broadcast state to guests whenever game state changes (host only)
  useEffect(() => {
    if (role !== 'host' || !hostRef.current) return
    hostRef.current.broadcastSnapshot(game)
  }, [game, role])

  function startHost() {
    const host = new GameHost({
      onRoomCode: code => setRoomCode(code),
      onGuestConnected: (sendSnapshot) => {
        setGuestConnected(true)
        // Immediately push current state to the newly connected guest
        sendSnapshot(useGameStore.getState().game)
      },
      onGuestDisconnected: () => setGuestConnected(false),
      onActionIntent: (action: GameAction) => {
        // Validate it's the guest's turn
        const currentGame = useGameStore.getState().game
        if (currentGame.currentTurn === 'guest') {
          dispatch(action)
        }
      },
    })
    hostRef.current = host
    host.init()
  }

  function joinAsGuest(code: string) {
    setConnectionStatus('connecting')
    const guest = new GameGuest({
      onConnected: () => setConnectionStatus('connected'),
      onDisconnected: () => setConnectionStatus('idle'),
      onError: () => setConnectionStatus('error'),
      onSnapshot: snapshot => syncFromHost(snapshot),
    })
    guestRef.current = guest
    guest.connect(code)
  }

  function sendIntent(action: GameAction) {
    guestRef.current?.sendIntent(action)
  }

  useEffect(() => {
    return () => {
      hostRef.current?.destroy()
      guestRef.current?.destroy()
    }
  }, [])

  return {
    roomCode,
    guestConnected,
    connectionStatus,
    startHost,
    joinAsGuest,
    sendIntent,
  }
}
