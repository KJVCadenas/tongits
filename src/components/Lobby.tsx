import { useState, useCallback } from 'react'
import type { usePeer } from '../hooks/usePeer'
import { useUIStore } from '../store/uiStore'
import { useGameStore } from '../store/gameStore'

type Props = {
  peer: ReturnType<typeof usePeer>
}

export default function Lobby({ peer }: Props) {
  const [view, setView] = useState<'home' | 'hosting' | 'joining'>('home')
  const [roomCodeInput, setRoomCodeInput] = useState('')
  const setRole = useUIStore(s => s.setRole)
  const dispatch = useGameStore(s => s.dispatch)

  const {
    roomCode,
    guestConnected,
    connectionStatus,
    startHost,
    joinAsGuest,
  } = peer

  function handleHost() {
    setRole('host')
    setView('hosting')
    startHost()
  }

  function handleJoin() {
    setView('joining')
  }

  function handleConnect() {
    setRole('guest')
    joinAsGuest(roomCodeInput.trim())
  }

  const handleCopyCode = useCallback(() => {
    if (roomCode) void navigator.clipboard.writeText(roomCode)
  }, [roomCode])

  function handleStartGame() {
    dispatch({ type: 'START_GAME' })
  }

  if (view === 'home') {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-green-950 gap-8">
        <h1 className="text-5xl font-bold text-white tracking-tight">Tong-its</h1>
        <p className="text-gray-400 text-lg">Filipino card game for 3 players</p>
        <div className="flex gap-4">
          <button
            onClick={handleHost}
            className="px-8 py-4 bg-blue-700 hover:bg-blue-600 text-white font-bold rounded-xl text-lg transition-colors"
          >
            Host Game
          </button>
          <button
            onClick={handleJoin}
            className="px-8 py-4 bg-amber-700 hover:bg-amber-600 text-white font-bold rounded-xl text-lg transition-colors"
          >
            Join Game
          </button>
        </div>
      </div>
    )
  }

  if (view === 'hosting') {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-green-950 gap-8">
        <h1 className="text-3xl font-bold text-white">Hosting Game</h1>

        {roomCode ? (
          <>
            <div className="text-center">
              <p className="text-gray-400 mb-2">Room Code</p>
              <div className="text-5xl font-mono font-bold text-yellow-400 tracking-widest bg-green-900 px-8 py-5 rounded-xl border border-green-700 select-all">
                {roomCode}
              </div>
              <button
                onClick={handleCopyCode}
                className="mt-3 text-gray-400 hover:text-yellow-400 text-sm underline transition-colors"
              >
                Copy code
              </button>
              <p className="text-gray-500 text-sm mt-1">Share with your guest</p>
            </div>

            <div className={`text-lg font-semibold ${guestConnected ? 'text-green-400' : 'text-gray-400'}`}>
              {guestConnected ? '✓ Guest connected!' : 'Waiting for guest…'}
            </div>

            {guestConnected && (
              <button
                onClick={handleStartGame}
                className="px-10 py-4 bg-green-600 hover:bg-green-500 text-white font-bold rounded-xl text-xl transition-colors"
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
        >
          Back
        </button>
      </div>
    )
  }

  // joining
  return (
    <div className="flex flex-col items-center justify-center h-screen bg-green-950 gap-8">
      <h1 className="text-3xl font-bold text-white">Join Game</h1>

      {connectionStatus === 'connected' ? (
        <div className="text-green-400 text-xl font-semibold">
          ✓ Connected! Waiting for host to start…
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-3 items-center">
            <label className="text-gray-400">Enter Room Code</label>
            <input
              type="text"
              value={roomCodeInput}
              onChange={e => setRoomCodeInput(e.target.value.toUpperCase())}
              maxLength={6}
              placeholder="e.g. A3FZ9K"
              className="px-4 py-3 rounded-lg bg-green-900 border border-green-700 text-white text-2xl font-mono text-center w-48 tracking-widest focus:outline-none focus:border-yellow-400"
            />
            <button
              onClick={handleConnect}
              disabled={roomCodeInput.trim().length !== 6}
              className="px-8 py-3 bg-blue-700 hover:bg-blue-600 text-white font-bold rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Connect
            </button>
          </div>

          {connectionStatus === 'connecting' && (
            <div className="text-gray-400 animate-pulse">Connecting…</div>
          )}
          {connectionStatus === 'error' && (
            <div className="text-red-400">Connection failed. Check the room code.</div>
          )}
        </>
      )}

      <button
        onClick={() => setView('home')}
        className="text-gray-500 hover:text-gray-300 text-sm underline"
      >
        Back
      </button>
    </div>
  )
}
