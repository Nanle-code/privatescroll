import { useEffect, useRef, useState } from 'react'
import { useOutletContext, useParams } from 'react-router-dom'
import {
  AccessLevel,
  DocumentRecord,
  aesDecryptMessage,
  appendDocument,
  getDocument,
  getOrCreateDocumentKey,
  proveAuthorship,
  proveChangeByAuthor,
  sha256Hex,
  shareDocument,
} from '../services/midnight'
import type { AppOutletContext } from '../App'

export default function DocumentEditor() {
  const { documentId } = useParams<{ documentId: string }>()
  const { userAddress } = useOutletContext<AppOutletContext>()

  const [record, setRecord] = useState<DocumentRecord | null>(null)
  const [content, setContent] = useState('')
  const [documentHash, setDocumentHash] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const writeCount = useRef(0)
  const pasteCount = useRef(0)

  const [recipientSharingCode, setRecipientSharingCode] = useState('')
  const [accessLevel, setAccessLevel] = useState<AccessLevel>('read')
  const [shareResult, setShareResult] = useState<string | null>(null)
  const [sharing, setSharing] = useState(false)

  useEffect(() => {
    if (!documentId || !userAddress) return
    setLoading(true)
    getDocument(documentId, userAddress).then(async (doc) => {
      if (doc) {
        setRecord(doc)
        setDocumentHash(doc.documentHash ?? null)
        if (doc.content) {
          const key = getOrCreateDocumentKey(documentId)
          try {
            setContent(await aesDecryptMessage(doc.content, key))
          } catch {
            setContent('')
          }
        }
      }
      setLoading(false)
    })
  }, [documentId, userAddress])

  const handleSave = async () => {
    if (!documentId || !userAddress) return
    setSaving(true)
    try {
      let hash = documentHash
      if (!hash) {
        hash = await sha256Hex(content)
        const registered = await proveAuthorship(userAddress, hash)
        if (!registered) return
        setDocumentHash(hash)
      } else {
        // Not the first save — also prove this specific edit transition
        // on-chain, binding it to the author's identity via
        // document_change.compact. Complementary to proveWorkHistory
        // (which proves "this save is genuine authored effort" without
        // revealing the write count): this proves "this exact content
        // transition happened, and I made it" — a real on-chain edit
        // history, not just a work-history counter.
        const previousModifiedHash = record?.midnight_proofs?.at(-1)?.modifiedHash
        if (previousModifiedHash) {
          const newModifiedHash = await sha256Hex(content)
          if (previousModifiedHash !== newModifiedHash) {
            await proveChangeByAuthor(previousModifiedHash, newModifiedHash, userAddress)
          }
        }
      }
      const key = getOrCreateDocumentKey(documentId)
      const updated = await appendDocument(userAddress, key, documentId, content, hash, writeCount.current, pasteCount.current)
      if (updated) {
        setRecord(updated)
      }
    } finally {
      setSaving(false)
    }
  }

  const handleShare = async () => {
    if (!documentId || !userAddress || !documentHash || !recipientSharingCode) return
    setSharing(true)
    const documentEncryptionKey = getOrCreateDocumentKey(documentId)
    const result = await shareDocument(documentId, documentHash, userAddress, recipientSharingCode, accessLevel, documentEncryptionKey)
    setSharing(false)
    if (result) setShareResult(result.shareId)
  }

  if (loading) return <p>Loading document…</p>
  if (!record) return <p>Document not found.</p>

  return (
    <div className="editor">
      <div className="page-header">
        <h1>{record.documentTitle}</h1>
        <span className={record.blockchain_verified ? 'badge badge-live' : 'badge badge-dev'}>
          {record.blockchain_verified ? 'On-chain verified' : 'Not yet saved'}
        </span>
      </div>

      <textarea
        className="editor-textarea"
        value={content}
        onChange={(e) => {
          writeCount.current += 1
          setContent(e.target.value)
        }}
        onPaste={() => {
          pasteCount.current += 1
        }}
        rows={16}
        placeholder="Start writing…"
      />

      <div className="editor-actions">
        <button onClick={handleSave} disabled={saving || !content}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        <span className="hint">
          writes: {writeCount.current}, pastes: {pasteCount.current}
        </span>
      </div>

      {record.midnight_proofs?.length > 0 && (
        <details>
          <summary>{record.midnight_proofs.length} on-chain proof(s) recorded</summary>
          <ul>
            {record.midnight_proofs.map((proof, index) => (
              <li key={index}>
                <code>{proof.modifiedHash.slice(0, 16)}…</code> at {new Date(proof.verifiedAt).toLocaleString()}
              </li>
            ))}
          </ul>
        </details>
      )}

      <section className="share-panel">
        <h2>Share</h2>
        {!documentHash && <p>Save the document at least once before sharing it.</p>}
        {documentHash && (
          <>
            <input
              placeholder="Recipient's sharing code (from their 'Copy my sharing code' button)"
              value={recipientSharingCode}
              onChange={(e) => setRecipientSharingCode(e.target.value)}
            />
            <select value={accessLevel} onChange={(e) => setAccessLevel(e.target.value as AccessLevel)}>
              <option value="read">Read</option>
              <option value="read_verify">Read + verify</option>
              <option value="full">Full</option>
            </select>
            <button onClick={handleShare} disabled={sharing || !recipientSharingCode}>
              {sharing ? 'Sharing…' : 'Share'}
            </button>
          </>
        )}
        {shareResult && (
          <p className="share-result">
            Share created — send this id to the recipient: <code>{shareResult}</code>
          </p>
        )}
      </section>
    </div>
  )
}
