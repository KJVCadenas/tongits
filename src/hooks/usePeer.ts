import { useEffect, useRef, useState } from 'react'
import { GameHost } from '../network/host'
import { GameGuest } from '../network/guest'
import { useGameStore } from '../store/gameStore'
import { useUIStore } from '../store/uiStore'
import type { GameAction, PlayerId } from '../game/engine'

export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'error'

export function usePeer() {
  const [roomCode, setRoomCode] = useState<string | null>(null)
  const [guestsConnected, setGuestsConnected] = useState(0)
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('idle')
  // Track guest names as they connect so they can be passed into START_GAME
  const [connectedGuestNames, setConnectedGuestNames] = useState<Partial<Record<PlayerId, string>>>({})

  const hostRef = useRef<GameHost | null>(null)
  const guestRef = useRef<GameGuest | null>(null)

  const dispatch = useGameStore(s => s.dispatch)
  const syncFromHost = useGameStore(s => s.syncFromHost)
  const game = useGameStore(s => s.game)
  const role = useUIStore(s => s.role)
  const setRole = useUIStore(s => s.setRole)

  // Broadcast state to guests whenever game state changes (host only)
  useEffect(() => {
    if (role !== 'host' || !hostRef.current) return
    hostRef.current.broadcastSnapshot(game)
  }, [game, role])

  function startHost() {
    const host = new GameHost({
      onRoomCode: code => setRoomCode(code),
      onGuestConnected: (playerId: PlayerId, name: string, sendSnapshot) => {
        setGuestsConnected(n => n + 1)
        setConnectedGuestNames(prev => ({ ...prev, [playerId]: name }))
        // Immediately push current state to the newly connected guest
        sendSnapshot(useGameStore.getState().game)
      },
      onGuestDisconnected: (_playerId: PlayerId) => {
        setGuestsConnected(n => Math.max(0, n - 1))
      },
      onActionIntent: (action: GameAction, fromPlayerId: PlayerId) => {
        // Validate it's that player's turn before dispatching
        const currentGame = useGameStore.getState().game
        if (currentGame.currentTurn === fromPlayerId) {
          dispatch(action)
        }
      },
      onError: () => setConnectionStatus('error'),
    })
    hostRef.current = host
    host.init()
  }

  function joinAsGuest(code: string, name: string) {
    setConnectionStatus('connecting')
    const guest = new GameGuest({
      onConnected: () => setConnectionStatus('connected'),
      onAssigned: (playerId: PlayerId) => setRole(playerId as 'guest' | 'guest2'),
      onDisconnected: () => setConnectionStatus('idle'),
      onError: () => setConnectionStatus('error'),
      onSnapshot: snapshot => syncFromHost(snapshot),
    })
    guestRef.current = guest
    guest.connect(code, name)
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
    guestConnected: guestsConnected > 0,
    guestsConnected,
    connectedGuestNames,
    connectionStatus,
    startHost,
    joinAsGuest,
    sendIntent,
  }
}
