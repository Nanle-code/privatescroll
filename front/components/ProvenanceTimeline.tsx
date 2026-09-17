import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import '../routes/Landing.css'

function shorten(value: string): string {
  return value.length > 20 ? `${value.slice(0, 10)}…${value.slice(-8)}` : value
}

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
}

const item = {
  hidden: { opacity: 0, x: -12 },
  show: { opacity: 1, x: 0 },
}

interface ProvenanceTimelineProps {
  documentHash: string
  proofs: { modifiedHash: string; verifiedAt: string }[]
}

/**
 * A real audit trail for a document, not just a list — every entry here
 * is something a visitor can independently re-check on /verify, using the
 * exact same public ledger read this component itself doesn't even need
 * to make (the proof records already came back verified from the backend,
 * which independently re-checked them against the relayer before ever
 * persisting them — see back/src/router.ts).
 */
export default function ProvenanceTimeline({ documentHash, proofs }: ProvenanceTimelineProps) {
  if (proofs.length === 0) return null

  return (
    <motion.div className="provenance" initial="hidden" animate="show" variants={container}>
      <span className="landing-eyebrow">On-chain provenance</span>

      <motion.div className="provenance-entry" variants={item} transition={{ duration: 0.3, ease: 'easeOut' }}>
        <span className="provenance-dot provenance-dot-root" />
        <div className="provenance-entry-body">
          <strong>Authorship registered</strong>
          <Link to={`/verify?documentHash=${encodeURIComponent(documentHash)}`} className="provenance-verify-link">
            Verify →
          </Link>
        </div>
      </motion.div>

      {proofs.map((proof, index) => (
        <motion.div key={proof.modifiedHash + proof.verifiedAt} className="provenance-entry" variants={item} transition={{ duration: 0.3, ease: 'easeOut' }}>
          <span className="provenance-dot" />
          <div className="provenance-entry-body">
            <strong>Version {index + 1}</strong>
            <span className="provenance-timestamp">{new Date(proof.verifiedAt).toLocaleString()}</span>
            <code title={proof.modifiedHash}>{shorten(proof.modifiedHash)}</code>
            <Link
              to={`/verify?documentHash=${encodeURIComponent(documentHash)}&modifiedHash=${encodeURIComponent(proof.modifiedHash)}`}
              className="provenance-verify-link"
            >
              Verify →
            </Link>
          </div>
        </motion.div>
      ))}
    </motion.div>
  )
}
