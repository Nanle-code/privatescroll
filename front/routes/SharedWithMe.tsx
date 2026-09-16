import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { decryptSharedContent, SharedDocumentResult, getSharedDocument } from '../services/midnight'
import type { AppOutletContext } from '../App'

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

  const handleLoad = async () => {
    if (!userAddress || !shareId) return
    setResult(null)
    setPlaintext(null)
    if (looksLikeSharingCode(shareId)) {
      setLoadError(
        "That's your own sharing code (what you give to others), not a share id (what you get back after someone shares a document with you). Paste the share id instead.",
      )
      return
    }
    setLoadError(null)
    setLoading(true)
    const loaded = await getSharedDocument(shareId)
    setResult(loaded)
    setPlaintext(loaded ? await decryptSharedContent(loaded) : null)
    setLoading(false)
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, ease: 'easeOut' }}>
      <h1>Shared With Me</h1>
      <p>
        There's no "list my shares" view yet — paste a share id someone sent you (the sender gets it back from the
        Share panel on their document, after they've used your sharing code there).
      </p>
      <div className="share-load">
        <input placeholder="Share id" value={shareId} onChange={(e) => setShareId(e.target.value)} />
        <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.96 }} onClick={handleLoad} disabled={loading || !shareId}>
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
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
