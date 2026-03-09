import { useState } from 'react'

const STORAGE_KEY = 'tongits_auth'
const REQUIRED = import.meta.env.VITE_ACCESS_PASSWORD

function isAuthenticated(): boolean {
  if (!REQUIRED) return true
  return localStorage.getItem(STORAGE_KEY) === REQUIRED
}

type Props = { children: React.ReactNode }

export default function AuthGate({ children }: Props) {
  const [authed, setAuthed] = useState(isAuthenticated)
  const [input, setInput] = useState('')
  const [error, setError] = useState(false)

  if (authed) {
    return (
      <>
        {children}
        <button
          onClick={() => { localStorage.removeItem(STORAGE_KEY); setAuthed(false) }}
          className="fixed bottom-3 right-3 text-xs text-gray-600 hover:text-gray-400 underline"
          data-testid="btn-logout"
        >
          Log out
        </button>
      </>
    )
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (input === REQUIRED) {
      localStorage.setItem(STORAGE_KEY, input)
      setAuthed(true)
    } else {
      setError(true)
    }
  }

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-green-950 gap-6">
      <h1 className="text-4xl font-bold text-white tracking-tight">Tong-its</h1>
      <form onSubmit={handleSubmit} className="flex flex-col items-center gap-4">
        <input
          type="password"
          value={input}
          onChange={e => { setInput(e.target.value); setError(false) }}
          placeholder="Enter password"
          autoFocus
          className="px-4 py-3 rounded-lg bg-green-900 border border-green-700 text-white text-center focus:outline-none focus:border-yellow-400 w-72"
          data-testid="input-password"
        />
        {error && <p className="text-red-400 text-sm" data-testid="auth-error">Incorrect password.</p>}
        <button
          type="submit"
          disabled={!input}
          className="px-8 py-3 bg-blue-700 hover:bg-blue-600 text-white font-bold rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          data-testid="btn-auth-submit"
        >
          Enter
        </button>
      </form>
    </div>
  )
}
