import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  AuthorshipStatus,
  LedgerActivity,
  ShareStatus,
  WorkProofStatus,
  getLedgerActivity,
  verifyDocumentAuthorship,
  verifyShareStatus,
  verifyWorkProof,
} from '../services/midnight'
import RotatingPlanet from '../components/RotatingPlanet'
import './Verify.css'

function shorten(value: string): string {
  return value.length > 20 ? `${value.slice(0, 10)}…${value.slice(-8)}` : value
}

const fadeUp = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0 },
}

export default function Verify() {
  const [activity, setActivity] = useState<LedgerActivity | null>(null)

  useEffect(() => {
    getLedgerActivity().then(setActivity)
  }, [])

  return (
    <div className="verify-page">
      <RotatingPlanet corner="top-right" variant="violet" />
      <RotatingPlanet corner="bottom-left" variant="cyan" />

      <header className="landing-topbar">
        <Link to="/" className="landing-brand" style={{ textDecoration: 'none' }}>
          PrivateScroll
        </Link>
        <Link to="/app" className="landing-topbar-link">
          Launch app →
        </Link>
      </header>

      <div className="verify-content">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: 'easeOut' }}>
          <span className="landing-eyebrow">Prove it, don&rsquo;t trust it</span>
          <h1>Check any claim yourself</h1>
          <p className="verify-intro">
            Everything below reads directly from the relayer&rsquo;s public ledger state — the same data a real Midnight
            node would expose. No login, no wallet, no secret key. Don&rsquo;t take PrivateScroll&rsquo;s word for
            it — check it here.
          </p>
        </motion.div>

        <AnimatePresence>
          {activity && (
            <motion.div
              className="verify-activity"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: 'easeOut' }}
            >
              <div>
                <strong>{activity.documentAuthorCount}</strong>
                <span>documents registered</span>
              </div>
              <div>
                <strong>{activity.workProofCount}</strong>
                <span>work-history proofs</span>
              </div>
              <div>
                <strong>{activity.shareCount}</strong>
                <span>shares issued</span>
              </div>
              <div>
                <strong>{activity.versionCount}</strong>
                <span>document versions</span>
              </div>
              <div>
                <strong>{activity.nullifierCount}</strong>
                <span>change nullifiers spent</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <DocumentAuthorshipPanel />
        <WorkProofPanel />
        <ShareStatusPanel />
      </div>
    </div>
  )
}

function ResultBadge({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return <span className={ok ? 'verify-badge verify-badge-yes' : 'verify-badge verify-badge-no'}>{children}</span>
}

function DocumentAuthorshipPanel() {
  const [documentHash, setDocumentHash] = useState('')
  const [result, setResult] = useState<AuthorshipStatus | null>(null)
  const [checking, setChecking] = useState(false)
  const [checked, setChecked] = useState(false)

  const handleCheck = async () => {
    if (!documentHash.trim()) return
    setChecking(true)
    setResult(await verifyDocumentAuthorship(documentHash.trim()))
    setChecked(true)
    setChecking(false)
  }

  return (
    <motion.section className="verify-panel" initial="hidden" whileInView="show" viewport={{ once: true, margin: '-60px' }} variants={fadeUp} transition={{ duration: 0.4 }}>
      <h2>Is this document&rsquo;s authorship registered?</h2>
      <p>Paste a document hash to check whether an author is registered for it on-chain, and see their key hash.</p>
      <div className="verify-form">
        <input
          placeholder="Document hash (hex)"
          value={documentHash}
          onChange={(e) => setDocumentHash(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCheck()}
        />
        <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.96 }} onClick={handleCheck} disabled={checking || !documentHash.trim()}>
          {checking ? 'Checking…' : 'Check'}
        </motion.button>
      </div>
      <AnimatePresence>
        {checked && result && (
          <motion.div className="verify-result" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <ResultBadge ok={result.registered}>{result.registered ? 'Registered' : 'Not registered'}</ResultBadge>
            {result.registered && result.author && (
              <code title={result.author}>author key hash: {shorten(result.author)}</code>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  )
}

function WorkProofPanel() {
  const [documentHash, setDocumentHash] = useState('')
  const [modifiedHash, setModifiedHash] = useState('')
  const [result, setResult] = useState<WorkProofStatus | null>(null)
  const [checking, setChecking] = useState(false)
  const [checked, setChecked] = useState(false)

  const handleCheck = async () => {
    if (!documentHash.trim() || !modifiedHash.trim()) return
    setChecking(true)
    setResult(await verifyWorkProof(documentHash.trim(), modifiedHash.trim()))
    setChecked(true)
    setChecking(false)
  }

  return (
    <motion.section className="verify-panel" initial="hidden" whileInView="show" viewport={{ once: true, margin: '-60px' }} variants={fadeUp} transition={{ duration: 0.4 }}>
      <h2>Was this save genuine, proven work?</h2>
      <p>Paste a document hash and the modified-content hash from a specific save to check whether its work-history proof was actually recorded.</p>
      <div className="verify-form verify-form-stacked">
        <input placeholder="Document hash (hex)" value={documentHash} onChange={(e) => setDocumentHash(e.target.value)} />
        <input placeholder="Modified-content hash (hex)" value={modifiedHash} onChange={(e) => setModifiedHash(e.target.value)} />
        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.96 }}
          onClick={handleCheck}
          disabled={checking || !documentHash.trim() || !modifiedHash.trim()}
        >
          {checking ? 'Checking…' : 'Check'}
        </motion.button>
      </div>
      <AnimatePresence>
        {checked && result && (
          <motion.div className="verify-result" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <ResultBadge ok={result.recorded}>{result.recorded ? 'Proof recorded' : 'No proof recorded'}</ResultBadge>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  )
}

function ShareStatusPanel() {
  const [shareId, setShareId] = useState('')
  const [result, setResult] = useState<ShareStatus | null>(null)
  const [checking, setChecking] = useState(false)
  const [checked, setChecked] = useState(false)

  const handleCheck = async () => {
    if (!shareId.trim()) return
    setChecking(true)
    setResult(await verifyShareStatus(shareId.trim()))
    setChecked(true)
    setChecking(false)
  }

  return (
    <motion.section className="verify-panel" initial="hidden" whileInView="show" viewport={{ once: true, margin: '-60px' }} variants={fadeUp} transition={{ duration: 0.4 }}>
      <h2>Is this share still active?</h2>
      <p>Paste a share id to check whether it exists on-chain, hasn&rsquo;t been revoked, and what access level it grants.</p>
      <div className="verify-form">
        <input
          placeholder="Share id (hex)"
          value={shareId}
          onChange={(e) => setShareId(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCheck()}
        />
        <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.96 }} onClick={handleCheck} disabled={checking || !shareId.trim()}>
          {checking ? 'Checking…' : 'Check'}
        </motion.button>
      </div>
      <AnimatePresence>
        {checked && result && (
          <motion.div className="verify-result" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            {result.exists ? (
              <>
                <ResultBadge ok={!result.revoked}>{result.revoked ? 'Revoked' : 'Active'}</ResultBadge>
                <span className="verify-access-level">{result.accessLevel.replace('_', ' ')}</span>
                <code title={result.documentHash}>document: {shorten(result.documentHash)}</code>
                <code title={result.recipientKeyHash}>recipient: {shorten(result.recipientKeyHash)}</code>
              </>
            ) : (
              <ResultBadge ok={false}>No share found for this id</ResultBadge>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  )
}
