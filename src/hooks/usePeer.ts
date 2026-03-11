import { useEffect, useRef, useState } from 'react'
import { GameHost } from '../network/host'
import { GameGuest } from '../network/guest'
import { useGameStore } from '../store/gameStore'
import { useUIStore } from '../store/uiStore'
import type { GameAction, PlayerId, GameMode } from '../game/engine'

export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'error'

export type LobbyInfo = {
  gameMode: GameMode
  hostName: string
  guestNames: Partial<Record<PlayerId, string>>
  guestReady: Partial<Record<PlayerId, boolean>>
}

export function usePeer() {
  const [roomCode, setRoomCode] = useState<string | null>(null)
  const [guestsConnected, setGuestsConnected] = useState(0)
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('idle')
  const [connectedGuestNames, setConnectedGuestNames] = useState<Partial<Record<PlayerId, string>>>({})
  const [guestReadyState, setGuestReadyState] = useState<Partial<Record<PlayerId, boolean>>>({})
  const [lobbyInfo, setLobbyInfo] = useState<LobbyInfo | null>(null)

  const hostRef = useRef<GameHost | null>(null)
  const guestRef = useRef<GameGuest | null>(null)
  // Ref to track latest connectedGuestNames without stale closure issues
  const connectedGuestNamesRef = useRef<Partial<Record<PlayerId, string>>>({})
  // Refs for host-side lobby values captured at startHost call time
  const hostNameRef = useRef<string>('Host')
  const gameModeRef = useRef<GameMode>('duo')
  // Ref for latest guestReadyState to avoid stale closures
  const guestReadyRef = useRef<Partial<Record<PlayerId, boolean>>>({})

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

  function startHost(hostName: string, gameMode: GameMode) {
    hostNameRef.current = hostName
    gameModeRef.current = gameMode

    const host = new GameHost({
      onRoomCode: code => setRoomCode(code),
      onGuestConnected: (playerId: PlayerId, name: string, sendSnapshot, sendLobbySnapshot) => {
        // Update ref synchronously before broadcasting
        const updatedNames = { ...connectedGuestNamesRef.current, [playerId]: name }
        connectedGuestNamesRef.current = updatedNames
        setGuestsConnected(n => n + 1)
        setConnectedGuestNames(updatedNames)
        // Send lobby snapshot to the new guest specifically
        sendLobbySnapshot(gameModeRef.current, hostNameRef.current, updatedNames, guestReadyRef.current)
        // Also broadcast to all existing guests so they see the new player
        hostRef.current?.broadcastLobbySnapshot(gameModeRef.current, hostNameRef.current, updatedNames, guestReadyRef.current)
        // Immediately push current game state to the newly connected guest
        sendSnapshot(useGameStore.getState().game)
      },
      onGuestDisconnected: (playerId: PlayerId) => {
        setGuestsConnected(n => Math.max(0, n - 1))
        // Clear ready state for disconnected guest
        setGuestReadyState(prev => {
          const next = { ...prev }
          delete next[playerId]
          guestReadyRef.current = next
          return next
        })
        // Remove from connected names
        const updatedNames = { ...connectedGuestNamesRef.current }
        delete updatedNames[playerId]
        connectedGuestNamesRef.current = updatedNames
        setConnectedGuestNames(updatedNames)
      },
      onGuestReadyChange: (playerId: PlayerId, ready: boolean) => {
        setGuestReadyState(prev => {
          const next = { ...prev, [playerId]: ready }
          guestReadyRef.current = next
          // Broadcast updated ready state to all guests
          hostRef.current?.broadcastLobbySnapshot(gameModeRef.current, hostNameRef.current, connectedGuestNamesRef.current, next)
          return next
        })
      },
      onActionIntent: (action: GameAction, fromPlayerId: PlayerId) => {
        const currentGame = useGameStore.getState().game
        // VOTE_NEXT_ROUND is allowed from any human player during ROUND_END
        if (action.type === 'VOTE_NEXT_ROUND' || currentGame.currentTurn === fromPlayerId) {
          dispatch(action)
        }
      },
      onError: () => setConnectionStatus('error'),
    })
    hostRef.current = host
    host.init()
  }

  function joinAsGuest(code: string, name: string) {
    // Destroy any prior guest instance before creating a new one
    guestRef.current?.destroy()
    guestRef.current = null
    setConnectionStatus('connecting')
    const guest = new GameGuest({
      onConnected: () => setConnectionStatus('connected'),
      onAssigned: (playerId: PlayerId) => setRole(playerId as 'guest' | 'guest2'),
      onDisconnected: () => setConnectionStatus('idle'),
      onError: () => setConnectionStatus('error'),
      onSnapshot: snapshot => syncFromHost(snapshot),
      onLobbySnapshot: (gameMode, hostName, guestNames, guestReady) => {
        setLobbyInfo({ gameMode, hostName, guestNames, guestReady })
      },
    })
    guestRef.current = guest
    guest.connect(code, name)
  }

  function sendIntent(action: GameAction) {
    guestRef.current?.sendIntent(action)
  }

  function sendReady(ready: boolean) {
    const currentRole = useUIStore.getState().role
    if (!currentRole || currentRole === 'host') return
    guestRef.current?.sendReady(currentRole, ready)
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
    guestReadyState,
    lobbyInfo,
    connectionStatus,
    startHost,
    joinAsGuest,
    sendIntent,
    sendReady,
  }
}
