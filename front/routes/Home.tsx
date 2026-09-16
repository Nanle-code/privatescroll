import { useEffect, useState } from 'react'
import { Link, useNavigate, useOutletContext } from 'react-router-dom'
import { createDocument, DocumentSummary, listDocuments } from '../services/midnight'
import type { AppOutletContext } from '../App'

export default function Home() {
  const { userAddress } = useOutletContext<AppOutletContext>()
  const [documents, setDocuments] = useState<DocumentSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    if (!userAddress) return
    setLoading(true)
    listDocuments(userAddress).then((docs) => {
      setDocuments(docs)
      setLoading(false)
    })
  }, [userAddress])

  const handleCreate = async () => {
    if (!userAddress) return
    setCreating(true)
    const id = await createDocument(userAddress, 'Untitled')
    setCreating(false)
    if (id) navigate(`/document/${id}`)
  }

  if (!userAddress) {
    return <p>Connecting to your identity…</p>
  }

  return (
    <div>
      <div className="page-header">
        <h1>My Documents</h1>
        <button onClick={handleCreate} disabled={creating}>
          {creating ? 'Creating…' : 'New Document'}
        </button>
      </div>

      {loading && <p>Loading…</p>}
      {!loading && documents.length === 0 && <p>No documents yet — create your first one.</p>}

      <ul className="document-list">
        {documents.map((doc) => (
          <li key={doc._id}>
            <Link to={`/document/${doc._id}`}>{doc.documentTitle}</Link>
            <span className={doc.blockchain_verified ? 'badge badge-live' : 'badge badge-dev'}>
              {doc.blockchain_verified ? 'On-chain verified' : 'Not yet saved'}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
