import { useState } from 'react'
import { Link, Outlet } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useMidnightUser } from './hooks/useMidnightUser'
import RotatingPlanet from './components/RotatingPlanet'

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
      <RotatingPlanet corner="top-right" variant="violet" />
      <RotatingPlanet corner="bottom-left" variant="cyan" />
      <motion.header
        className="app-header"
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
      >
        <Link to="/app" className="brand">
          PrivateScroll
        </Link>
        <nav>
          <Link to="/app">My Documents</Link>
          <Link to="/app/shared">Shared With Me</Link>
        </nav>
      </motion.header>

      <section className="identity-bar">
        <AnimatePresence mode="wait" initial={false}>
          {loading ? (
            <motion.span
              key="connecting"
              className="identity-pill"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              Connecting…
            </motion.span>
          ) : (
            <motion.div
              key="identity"
              className="identity-pill"
              initial={{ opacity: 0, y: 8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
            >
              <span className={walletConnected ? 'badge badge-live' : 'badge badge-dev'}>
                {walletConnected ? 'Wallet connected' : 'Dev identity'}
              </span>
              <code title={userAddress ?? ''}>{userAddress ? shorten(userAddress) : '—'}</code>
              {sharingCode && (
                <motion.button whileTap={{ scale: 0.95 }} onClick={handleCopySharingCode} className="link-button" title={sharingCode}>
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.span
                      key={copied ? 'copied' : 'copy'}
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 4 }}
                      transition={{ duration: 0.15 }}
                      style={{ display: 'inline-block' }}
                    >
                      {copied ? 'Copied!' : 'Copy my sharing code'}
                    </motion.span>
                  </AnimatePresence>
                </motion.button>
              )}
              {!walletConnected && (
                <motion.button whileTap={{ scale: 0.95 }} onClick={connectWallet} className="link-button" disabled={connecting}>
                  {connecting ? 'Check your wallet…' : 'Connect wallet'}
                </motion.button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      <main className="app-main">
        <Outlet context={{ userAddress, walletConnected } satisfies AppOutletContext} />
      </main>
    </div>
  )
}
