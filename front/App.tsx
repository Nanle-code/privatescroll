import { useState } from 'react'
import { Link, Outlet } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
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
      <motion.header
        className="app-header"
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
      >
        <Link to="/" className="brand">
          PrivateScroll
        </Link>
        <nav>
          <Link to="/">My Documents</Link>
          <Link to="/shared">Shared With Me</Link>
        </nav>
        <div className="identity">
          <AnimatePresence mode="wait" initial={false}>
            {loading ? (
              <motion.span key="connecting" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                Connecting…
              </motion.span>
            ) : (
              <motion.div
                key="identity"
                style={{ display: 'flex', alignItems: 'center', gap: 10 }}
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.25 }}
              >
                <span className={walletConnected ? 'badge badge-live' : 'badge badge-dev'}>
                  {walletConnected ? 'Wallet connected' : 'Dev identity'}
                </span>
                <code title={userAddress ?? ''}>{userAddress ? shorten(userAddress) : '—'}</code>
                {sharingCode && (
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={handleCopySharingCode}
                    className="link-button"
                    title={sharingCode}
                  >
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
        </div>
      </motion.header>
      <main className="app-main">
        <Outlet context={{ userAddress, walletConnected } satisfies AppOutletContext} />
      </main>
    </div>
  )
}
