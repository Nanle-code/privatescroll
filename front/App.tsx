import { useState } from 'react'
import { Link, Outlet } from 'react-router-dom'
import { useMidnightUser } from './hooks/useMidnightUser'

export type AppOutletContext = {
  userAddress: string | null
  walletConnected: boolean
}

function shorten(value: string): string {
  return value.length > 16 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value
}

export default function App() {
  const { userAddress, sharingCode, walletConnected, loading, connecting, connectWallet } = useMidnightUser()
  const [copied, setCopied] = useState(false)

  const handleCopySharingCode = async () => {
    if (!sharingCode) return
    await navigator.clipboard.writeText(sharingCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <Link to="/" className="brand">
          PrivateScroll
        </Link>
        <nav>
          <Link to="/">My Documents</Link>
          <Link to="/shared">Shared With Me</Link>
        </nav>
        <div className="identity">
          {loading ? (
            <span>Connecting…</span>
          ) : (
            <>
              <span className={walletConnected ? 'badge badge-live' : 'badge badge-dev'}>
                {walletConnected ? 'Wallet connected' : 'Dev identity'}
              </span>
              <code title={userAddress ?? ''}>{userAddress ? shorten(userAddress) : '—'}</code>
              {sharingCode && (
                <button onClick={handleCopySharingCode} className="link-button" title={sharingCode}>
                  {copied ? 'Copied!' : 'Copy my sharing code'}
                </button>
              )}
              {!walletConnected && (
                <button onClick={connectWallet} className="link-button" disabled={connecting}>
                  {connecting ? 'Check your wallet…' : 'Connect wallet'}
                </button>
              )}
            </>
          )}
        </div>
      </header>
      <main className="app-main">
        <Outlet context={{ userAddress, walletConnected } satisfies AppOutletContext} />
      </main>
    </div>
  )
}
