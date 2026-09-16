import { useEffect, useState } from 'react'
import { Link, useNavigate, useOutletContext } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { createDocument, DocumentSummary, listDocuments } from '../services/midnight'
import type { AppOutletContext } from '../App'

const listVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
}

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0 },
}

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
    if (id) navigate(`/app/document/${id}`)
  }

  if (!userAddress) {
    return <p>Connecting to your identity…</p>
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, ease: 'easeOut' }}>
      <div className="page-header">
        <h1>My Documents</h1>
        <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.96 }} onClick={handleCreate} disabled={creating}>
          {creating ? 'Creating…' : 'New Document'}
        </motion.button>
      </div>

      {loading && <p>Loading…</p>}
      {!loading && documents.length === 0 && (
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>
          No documents yet — create your first one.
        </motion.p>
      )}

      <motion.ul className="document-list" variants={listVariants} initial="hidden" animate="show">
        <AnimatePresence>
          {documents.map((doc) => (
            <motion.li key={doc._id} layout variants={itemVariants} exit={{ opacity: 0, y: -10 }}>
              <Link to={`/app/document/${doc._id}`}>{doc.documentTitle}</Link>
              <span className={doc.blockchain_verified ? 'badge badge-live' : 'badge badge-dev'}>
                {doc.blockchain_verified ? 'On-chain verified' : 'Not yet saved'}
              </span>
            </motion.li>
          ))}
        </AnimatePresence>
      </motion.ul>
    </motion.div>
  )
}
