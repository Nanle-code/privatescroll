import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
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
    const loaded = await getSharedDocument(shareId, userAddress)
    setResult(loaded)
    setPlaintext(loaded ? await decryptSharedContent(loaded) : null)
    setLoading(false)
  }

  return (
    <div>
      <h1>Shared With Me</h1>
      <p>
        There's no "list my shares" view yet — paste a share id someone sent you (the sender gets it back from the
        Share panel on their document, after they've used your sharing code there).
      </p>
      <div className="share-load">
        <input placeholder="Share id" value={shareId} onChange={(e) => setShareId(e.target.value)} />
        <button onClick={handleLoad} disabled={loading || !shareId}>
          {loading ? 'Loading…' : 'Load'}
        </button>
      </div>

      {loadError && <p className="warning">{loadError}</p>}

      {result && (
        <div className="shared-document">
          <h2>{result.document.documentTitle}</h2>
          <p>
            Access level: <strong>{result.accessLevel}</strong>
          </p>
          {plaintext !== null ? (
            <>
              <p className="success-note">Decrypted with your own key — only you can do this.</p>
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
        </div>
      )}
    </div>
  )
}
