import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  AccessLevel,
  SharedWithMeEntry,
  decryptSharedContent,
  SharedDocumentResult,
  getSharedDocument,
  listMySharedDocuments,
  reshareSharedDocument,
} from '../services/midnight'
import type { AppOutletContext } from '../App'

const listVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
}

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0 },
}

/**
 * Sharing codes and share ids are both opaque strings, easy to paste into
 * the wrong field. A sharing code is base64(JSON) with keyHash +
 * encryptionPublicKey; a share id is a plain hex string. Detect the mix-up
 * before hitting the network so the error is actually helpful.
 */
function looksLikeSharingCode(value: string): boolean {
  try {
    const parsed = JSON.parse(atob(value.trim()))
    return typeof parsed?.keyHash === 'string' && typeof parsed?.encryptionPublicKey === 'string'
  } catch {
    return false
  }
}

export default function SharedWithMe() {
  const { userAddress } = useOutletContext<AppOutletContext>()
  const [shareId, setShareId] = useState('')
  const [result, setResult] = useState<SharedDocumentResult | null>(null)
  const [plaintext, setPlaintext] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const [subRecipientCode, setSubRecipientCode] = useState('')
  const [subAccessLevel, setSubAccessLevel] = useState<AccessLevel>('read')
  const [resharing, setResharing] = useState(false)
  const [reshareResult, setReshareResult] = useState<string | null>(null)

  const [shares, setShares] = useState<SharedWithMeEntry[]>([])
  const [sharesLoading, setSharesLoading] = useState(false)

  useEffect(() => {
    if (!userAddress) return
    setSharesLoading(true)
    listMySharedDocuments().then((list) => {
      setShares(list)
      setSharesLoading(false)
    })
  }, [userAddress])

  const handleLoad = async (overrideShareId?: string) => {
    const targetShareId = overrideShareId ?? shareId
    if (!userAddress || !targetShareId) return
    setShareId(targetShareId)
    setResult(null)
    setPlaintext(null)
    setReshareResult(null)
    if (looksLikeSharingCode(targetShareId)) {
      setLoadError(
        "That's your own sharing code (what you give to others), not a share id (what you get back after someone shares a document with you). Paste the share id instead.",
      )
      return
    }
    setLoadError(null)
    setLoading(true)
    const loaded = await getSharedDocument(targetShareId)
    setResult(loaded)
    setPlaintext(loaded ? await decryptSharedContent(loaded) : null)
    setLoading(false)
  }

  const handleReshare = async () => {
    if (!userAddress || !result || !subRecipientCode) return
    setResharing(true)
    const shared = await reshareSharedDocument(shareId, result, userAddress, subRecipientCode, subAccessLevel)
    setResharing(false)
    if (shared) setReshareResult(shared.shareId)
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, ease: 'easeOut' }}>
      <h1>Shared With Me</h1>
      <p>Documents shared with you appear below automatically, or paste a share id directly if you have one.</p>

      {sharesLoading && <p>Loading…</p>}
      {!sharesLoading && shares.length === 0 && (
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>
          Nothing shared with you yet.
        </motion.p>
      )}

      <motion.ul className="document-list" variants={listVariants} initial="hidden" animate="show">
        <AnimatePresence>
          {shares.map((share) => (
            <motion.li key={share.shareId} layout variants={itemVariants} exit={{ opacity: 0, y: -10 }}>
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault()
                  handleLoad(share.shareId)
                }}
              >
                {share.documentTitle}
              </a>
              <span className="badge badge-dev">{share.accessLevel.replace('_', ' ')}</span>
            </motion.li>
          ))}
        </AnimatePresence>
      </motion.ul>

      <div className="share-load">
        <input placeholder="Share id" value={shareId} onChange={(e) => setShareId(e.target.value)} />
        <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.96 }} onClick={() => handleLoad()} disabled={loading || !shareId}>
          {loading ? 'Loading…' : 'Load'}
        </motion.button>
      </div>

      <AnimatePresence>
        {loadError && (
          <motion.p
            className="warning"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {loadError}
          </motion.p>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {result && (
          <motion.div
            className="shared-document"
            initial={{ opacity: 0, y: 14, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          >
            <h2>{result.document.documentTitle}</h2>
            <p>
              Access level: <strong>{result.accessLevel}</strong>
            </p>
            {plaintext !== null ? (
              <>
                <motion.p
                  className="success-note"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.15 }}
                >
                  Decrypted with your own key — only you can do this.
                </motion.p>
                <pre className="plaintext">{plaintext}</pre>
              </>
            ) : (
              <>
                <p className="warning">
                  Couldn't decrypt this in your browser — either this share predates key-wrapping support, or this
                  browser genuinely isn't the intended recipient. Showing ciphertext rather than pretending to
                  decrypt it.
                </p>
                <pre className="ciphertext">{result.document.content}</pre>
              </>
            )}

            {plaintext !== null && result.accessLevel === 'full' && (
              <motion.section
                className="share-panel"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.1 }}
              >
                <h2>Share this further</h2>
                <p>
                  Your access level lets you re-share this document — enforced on-chain, not just by this button
                  existing.
                </p>
                <input
                  placeholder="Recipient's sharing code"
                  value={subRecipientCode}
                  onChange={(e) => setSubRecipientCode(e.target.value)}
                />
                <select value={subAccessLevel} onChange={(e) => setSubAccessLevel(e.target.value as AccessLevel)}>
                  <option value="read">Read</option>
                  <option value="read_verify">Read + verify</option>
                  <option value="full">Full</option>
                </select>
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.96 }}
                  onClick={handleReshare}
                  disabled={resharing || !subRecipientCode}
                >
                  {resharing ? 'Sharing…' : 'Share'}
                </motion.button>
                <AnimatePresence>
                  {reshareResult && (
                    <motion.p
                      className="share-result"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.25 }}
                    >
                      Share created — send this id to the recipient: <code>{reshareResult}</code>
                    </motion.p>
                  )}
                </AnimatePresence>
              </motion.section>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
