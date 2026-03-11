import { useState, useCallback } from 'react'
import type { usePeer } from '../hooks/usePeer'
import { useUIStore } from '../store/uiStore'
import { useGameStore } from '../store/gameStore'
import type { GameMode, PlayerId } from '../game/engine'

type Props = {
  peer: ReturnType<typeof usePeer>
}

type View = 'home' | 'hosting-setup' | 'hosting-waiting' | 'joining' | 'joining-waiting'

// Badge shown next to a player slot
function ReadyBadge() {
  return (
    <span className="ml-2 px-2 py-0.5 bg-green-700 text-green-200 text-xs font-semibold rounded-full">
      Ready
    </span>
  )
}

// A single row in the player slot list
function PlayerSlot({ name, isReady, isYou }: { name: string; isReady: boolean; isYou?: boolean }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-green-900 rounded-xl border border-green-700 w-72">
      <div className="w-8 h-8 rounded-full bg-green-700 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
        {name[0]?.toUpperCase() ?? '?'}
      </div>
      <span className="text-white font-medium flex-1">
        {name}{isYou ? <span className="text-gray-400 font-normal text-sm"> (You)</span> : null}
      </span>
      {isReady
        ? <ReadyBadge />
        : <span className="text-gray-500 text-xs italic">waiting…</span>
      }
    </div>
  )
}

export default function Lobby({ peer }: Props) {
  const [view, setView] = useState<View>('home')
  const [hostName, setHostName] = useState('Host')
  const [guestName, setGuestName] = useState('Guest')
  const [gameMode, setGameMode] = useState<GameMode>('duo')
  const [roomCodeInput, setRoomCodeInput] = useState('')
  const [isReady, setIsReady] = useState(false)

  const setRole = useUIStore(s => s.setRole)
  const dispatch = useGameStore(s => s.dispatch)
  const assignedRole = useUIStore(s => s.role)

  const {
    roomCode,
    guestsConnected,
    connectedGuestNames,
    guestReadyState,
    lobbyInfo,
    connectionStatus,
    startHost,
    joinAsGuest,
    sendReady,
  } = peer

  const requiredGuests = gameMode === 'trio' ? 2 : 1

  // ── Solo ────────────────────────────────────────────────────────────────────
  function handleSolo() {
    setRole('host')
    dispatch({ type: 'START_GAME', gameMode: 'solo', hostName: hostName || 'You' })
  }

  // ── Host multiplayer ─────────────────────────────────────────────────────────
  function handleCreateRoom() {
    setRole('host')
    setView('hosting-waiting')
    startHost(hostName || 'Host', gameMode)
  }

  const handleCopyCode = useCallback(() => {
    if (roomCode) void navigator.clipboard.writeText(roomCode)
  }, [roomCode])

  function handleStartGame() {
    dispatch({
      type: 'START_GAME',
      gameMode,
      hostName: hostName || 'Host',
      guestNames: connectedGuestNames,
    })
  }

  // ── Join ─────────────────────────────────────────────────────────────────────
  function handleConnect() {
    setView('joining-waiting')
    joinAsGuest(roomCodeInput.trim(), guestName || 'Guest')
  }

  // ── Views ────────────────────────────────────────────────────────────────────

  if (view === 'home') {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-green-950 gap-8">
        <h1 className="text-5xl font-bold text-white tracking-tight">Tong-its</h1>
        <p className="text-gray-400 text-lg">Filipino card game for 3 players</p>

        <div className="flex flex-col gap-3 w-64">
          <div className="flex flex-col gap-1 mb-2">
            <label className="text-gray-400 text-sm text-center">Your name</label>
            <input
              type="text"
              value={hostName}
              onChange={e => setHostName(e.target.value)}
              maxLength={20}
              placeholder="Host"
              className="px-3 py-2 rounded-lg bg-green-900 border border-green-700 text-white text-center focus:outline-none focus:border-yellow-400"
            />
          </div>

          <button
            onClick={handleSolo}
            className="px-8 py-4 bg-green-700 hover:bg-green-600 text-white font-bold rounded-xl text-lg transition-colors"
            data-testid="btn-solo"
          >
            Play Solo
          </button>
          <button
            onClick={() => setView('hosting-setup')}
            className="px-8 py-4 bg-blue-700 hover:bg-blue-600 text-white font-bold rounded-xl text-lg transition-colors"
            data-testid="btn-host-game"
          >
            Host Multiplayer
          </button>
          <button
            onClick={() => setView('joining')}
            className="px-8 py-4 bg-amber-700 hover:bg-amber-600 text-white font-bold rounded-xl text-lg transition-colors"
            data-testid="btn-join-game"
          >
            Join Game
          </button>
        </div>
      </div>
    )
  }

  if (view === 'hosting-setup') {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-green-950 gap-8">
        <h1 className="text-3xl font-bold text-white">Host Multiplayer</h1>

        <div className="flex flex-col gap-5 w-72">
          <div className="flex flex-col gap-1">
            <label className="text-gray-400 text-sm">Your name</label>
            <input
              type="text"
              value={hostName}
              onChange={e => setHostName(e.target.value)}
              maxLength={20}
              placeholder="Host"
              className="px-3 py-2 rounded-lg bg-green-900 border border-green-700 text-white focus:outline-none focus:border-yellow-400"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-gray-400 text-sm">Game mode</label>
            <div className="flex gap-3">
              {(['duo', 'trio'] as GameMode[]).map(m => (
                <button
                  key={m}
                  onClick={() => setGameMode(m)}
                  className={`flex-1 py-3 rounded-xl font-bold text-sm transition-colors border-2 ${
                    gameMode === m
                      ? 'bg-blue-700 border-blue-500 text-white'
                      : 'bg-green-900 border-green-700 text-gray-300 hover:border-blue-600'
                  }`}
                >
                  {m === 'duo' ? 'Duo (2 players)' : 'Trio (3 players)'}
                </button>
              ))}
            </div>
            <p className="text-gray-500 text-xs mt-1">
              {gameMode === 'duo'
                ? '1 real opponent + Bot 2'
                : '2 real opponents, no bots'}
            </p>
          </div>

          <button
            onClick={handleCreateRoom}
            className="px-8 py-4 bg-blue-700 hover:bg-blue-600 text-white font-bold rounded-xl text-lg transition-colors"
            data-testid="btn-create-room"
          >
            Create Room
          </button>
        </div>

        <button
          onClick={() => setView('home')}
          className="text-gray-500 hover:text-gray-300 text-sm underline"
        >
          Back
        </button>
      </div>
    )
  }

  if (view === 'hosting-waiting') {
    // Build slot display based on mode
    const slot2Name: string = guestsConnected >= 1
      ? (connectedGuestNames['guest'] ?? 'Guest')
      : (gameMode === 'solo' ? 'Bot 1' : 'Waiting…')
    const slot2Ready = gameMode === 'solo' || (guestsConnected >= 1 && guestReadyState['guest'] === true)

    const slot3Name: string = gameMode === 'trio'
      ? (guestsConnected >= 2 ? (connectedGuestNames['guest2' as PlayerId] ?? 'Guest 2') : 'Waiting…')
      : 'Bot 2'
    const slot3Ready = gameMode !== 'trio' || (guestsConnected >= 2 && guestReadyState['guest2' as PlayerId] === true)

    const requiredGuestIds: PlayerId[] = gameMode === 'trio' ? ['guest', 'guest2'] : ['guest']
    const canStart = guestsConnected >= requiredGuests && requiredGuestIds.every(id => guestReadyState[id] === true)

    return (
      <div className="flex flex-col items-center justify-center h-screen bg-green-950 gap-8">
        <h1 className="text-3xl font-bold text-white">Hosting Game</h1>

        {roomCode ? (
          <>
            <div className="text-center">
              <p className="text-gray-400 mb-2">Room Code</p>
              <div
                className="text-5xl font-mono font-bold text-yellow-400 tracking-widest bg-green-900 px-8 py-5 rounded-xl border border-green-700 select-all"
                data-testid="room-code-display"
              >
                {roomCode}
              </div>
              <button
                onClick={handleCopyCode}
                className="mt-3 text-gray-400 hover:text-yellow-400 text-sm underline transition-colors"
                data-testid="btn-copy-code"
              >
                Copy code
              </button>
              <p className="text-gray-500 text-sm mt-1">Share with your {gameMode === 'trio' ? 'guests' : 'guest'}</p>
            </div>

            <div className="flex flex-col gap-2">
              <p className="text-gray-400 text-sm text-center mb-1">Players</p>
              <PlayerSlot name={hostName || 'Host'} isReady isYou />
              <PlayerSlot name={slot2Name} isReady={slot2Ready} />
              <PlayerSlot name={slot3Name} isReady={slot3Ready} />
            </div>

            {canStart && (
              <button
                onClick={handleStartGame}
                className="px-10 py-4 bg-green-600 hover:bg-green-500 text-white font-bold rounded-xl text-xl transition-colors"
                data-testid="btn-start-game"
              >
                Start Game
              </button>
            )}
          </>
        ) : (
          <div className="text-gray-400 animate-pulse">Generating room code…</div>
        )}

        <button
          onClick={() => setView('home')}
          className="text-gray-500 hover:text-gray-300 text-sm underline"
          data-testid="btn-back-home"
        >
          Back
        </button>
      </div>
    )
  }

  if (view === 'joining') {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-green-950 gap-8">
        <h1 className="text-3xl font-bold text-white">Join Game</h1>

        <div className="flex flex-col gap-4 items-center w-72">
          <div className="flex flex-col gap-1 w-full">
            <label className="text-gray-400 text-sm">Your name</label>
            <input
              type="text"
              value={guestName}
              onChange={e => setGuestName(e.target.value)}
              maxLength={20}
              placeholder="Guest"
              className="px-3 py-2 rounded-lg bg-green-900 border border-green-700 text-white focus:outline-none focus:border-yellow-400"
            />
          </div>

          <div className="flex flex-col gap-1 w-full">
            <label className="text-gray-400 text-sm">Room Code</label>
            <input
              type="text"
              value={roomCodeInput}
              onChange={e => setRoomCodeInput(e.target.value.toUpperCase())}
              maxLength={6}
              placeholder="e.g. A3FZ9K"
              className="px-4 py-3 rounded-lg bg-green-900 border border-green-700 text-white text-2xl font-mono text-center tracking-widest focus:outline-none focus:border-yellow-400"
              data-testid="input-room-code"
            />
          </div>

          <button
            onClick={handleConnect}
            disabled={roomCodeInput.trim().length !== 6}
            className="w-full px-8 py-3 bg-blue-700 hover:bg-blue-600 text-white font-bold rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            data-testid="btn-connect"
          >
            Connect
          </button>
        </div>

        <button
          onClick={() => setView('home')}
          className="text-gray-500 hover:text-gray-300 text-sm underline"
        >
          Back
        </button>
      </div>
    )
  }

  // joining-waiting
  const mySlotLabel = assignedRole === 'guest2' ? 'Guest 2' : 'Guest'

  // Build lobby slot display from lobbyInfo (synced from host)
  const lobbyGameMode = lobbyInfo?.gameMode ?? 'duo'
  const lobbyHostName = lobbyInfo?.hostName ?? 'Host'
  const lobbyGuestNames = lobbyInfo?.guestNames ?? {}
  const lobbyGuestReady = lobbyInfo?.guestReady ?? {}

  const lobbySlot2Name: string = lobbyGameMode === 'solo'
    ? 'Bot 1'
    : (lobbyGuestNames['guest'] ?? (assignedRole === 'guest' ? guestName : 'Waiting…'))
  const lobbySlot2Ready = lobbyGameMode === 'solo'
    ? true
    : (assignedRole === 'guest' ? isReady : (lobbyGuestReady['guest'] === true))

  const lobbySlot3Name: string = lobbyGameMode === 'trio'
    ? (lobbyGuestNames['guest2' as PlayerId] ?? (assignedRole === 'guest2' ? guestName : 'Waiting…'))
    : 'Bot 2'
  const lobbySlot3Ready = lobbyGameMode === 'trio'
    ? (assignedRole === 'guest2' ? isReady : (lobbyGuestReady['guest2' as PlayerId] === true))
    : true

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-green-950 gap-8">
      <h1 className="text-3xl font-bold text-white">Join Game</h1>

      {connectionStatus === 'connected' || connectionStatus === 'connecting' ? (
        <div className="flex flex-col items-center gap-6">
          {connectionStatus === 'connecting' && (
            <div className="text-gray-400 animate-pulse" data-testid="connection-status" data-status="connecting">
              Connecting…
            </div>
          )}

          {connectionStatus === 'connected' && (
            <>
              <div className="text-green-400 text-lg font-semibold" data-testid="connection-status" data-status="connected">
                ✓ Connected as {mySlotLabel}
              </div>

              <div className="flex flex-col gap-2">
                <p className="text-gray-400 text-sm text-center mb-1">Players</p>
                <PlayerSlot name={lobbyHostName} isReady />
                <PlayerSlot name={lobbySlot2Name} isReady={lobbySlot2Ready} isYou={assignedRole === 'guest'} />
                <PlayerSlot name={lobbySlot3Name} isReady={lobbySlot3Ready} isYou={assignedRole === 'guest2'} />
              </div>

              <button
                onClick={() => {
                  const next = !isReady
                  setIsReady(next)
                  sendReady(next)
                }}
                className={`px-8 py-3 font-bold rounded-xl text-lg transition-colors ${
                  isReady
                    ? 'bg-gray-600 hover:bg-gray-500 text-white'
                    : 'bg-green-600 hover:bg-green-500 text-white'
                }`}
              >
                {isReady ? 'Not Ready' : 'Ready'}
              </button>

              {!isReady && (
                <div className="text-gray-400 animate-pulse text-sm">Waiting for host to start…</div>
              )}
              {isReady && (
                <div className="text-gray-400 text-sm">Waiting for host to start…</div>
              )}
            </>
          )}
        </div>
      ) : connectionStatus === 'error' ? (
        <>
          <div className="text-red-400" data-testid="connection-status" data-status="error">
            Connection failed. Check the room code.
          </div>
          <button
            onClick={() => setView('joining')}
            className="text-gray-500 hover:text-gray-300 text-sm underline"
          >
            Try again
          </button>
        </>
      ) : null}

      <button
        onClick={() => { setIsReady(false); setView('home') }}
        className="text-gray-500 hover:text-gray-300 text-sm underline"
      >
        Back
      </button>
    </div>
  )
}
