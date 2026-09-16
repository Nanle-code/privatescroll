import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import RotatingPlanet from '../components/RotatingPlanet'
import './Landing.css'

const fadeUp = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0 },
}

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12 } },
}

const slideLeft = {
  hidden: { opacity: 0, x: -48 },
  show: { opacity: 1, x: 0 },
}

const heroStagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.3, delayChildren: 0.1 } },
}

const heroLines = [
  { kicker: 'What PrivateScroll is', text: 'A zero-knowledge document editor on Midnight Network.' },
  { kicker: 'The problem', text: 'Private tools ask you to trust a server operator with everything that matters.' },
  { kicker: 'The solution', text: 'PrivateScroll proves it instead — real Compact circuits, not a promise.' },
]

const proofCards = [
  {
    title: 'Prove who wrote it',
    body: "A document's content hash is bound to a pseudonymous identity by a real Compact circuit — permanently, the first time. No operator has to vouch for it.",
  },
  {
    title: 'Prove it wasn’t pasted',
    body: 'Every save proves writes outnumber pastes — without ever revealing the write count. A real predicate over private data, not a self-reported flag.',
  },
  {
    title: 'Prove who’s allowed to read it',
    body: "Sharing is gated by an on-chain, ownership-verified circuit. Only the document's real author can authorize access — enforced in-circuit, not by application code.",
  },
]

const features = [
  'Selective disclosure of identity',
  'On-chain edit history',
  'End-to-end encrypted sharing',
  'Real wallet integration',
  'Works without a wallet too',
  'Stateless relayer — secrets never leave your browser',
]

export default function Landing() {
  return (
    <div className="landing">
      <RotatingPlanet corner="top-right" variant="violet" />
      <RotatingPlanet corner="bottom-left" variant="cyan" />

      <header className="landing-topbar">
        <span className="landing-brand">PrivateScroll</span>
        <Link to="/app" className="landing-topbar-link">
          Launch app →
        </Link>
      </header>

      <section className="landing-hero">
        <motion.div initial="hidden" animate="show" variants={heroStagger}>
          <motion.h1 variants={slideLeft} transition={{ duration: 0.55, ease: 'easeOut' }}>
            Prove it. Don’t trust it.
          </motion.h1>

          <div className="hero-lines">
            {heroLines.map((line) => (
              <motion.div
                key={line.kicker}
                className="hero-line"
                variants={slideLeft}
                transition={{ duration: 0.5, ease: 'easeOut' }}
              >
                <span className="hero-line-kicker">{line.kicker}</span>
                <p>{line.text}</p>
              </motion.div>
            ))}
          </div>

          <motion.div variants={slideLeft} transition={{ duration: 0.45, ease: 'easeOut' }}>
            <Link to="/app" className="landing-cta">
              Get started
            </Link>
          </motion.div>
        </motion.div>
      </section>

      <section className="landing-section">
        <motion.div
          className="landing-section-inner"
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.45, ease: 'easeOut' }}
        >
          <span className="landing-eyebrow">The problem</span>
          <h2>Private document tools ask you to trust someone</h2>
          <p>
            A normal private editor asks you to trust a server operator: trust them not to peek at your content,
            trust them not to get breached, trust them not to quietly fake an audit trail. That trust is invisible
            until it breaks — and for the claims that matter most (who wrote this, is it genuine, who's allowed to
            read it) there's usually no way to check it was honored at all.
          </p>
        </motion.div>
      </section>

      <section className="landing-section landing-section--alt">
        <motion.div
          className="landing-section-inner"
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.45, ease: 'easeOut' }}
        >
          <span className="landing-eyebrow">The solution</span>
          <h2>Prove the claims that matter, instead of asking for trust</h2>
          <p>
            PrivateScroll replaces that trust requirement with real zero-knowledge circuits, written in Compact and
            run against Midnight's own dual-ledger model. Every save is independently verifiable — not by trusting
            PrivateScroll either, but by checking the proof.
          </p>
          <motion.div className="proof-grid" variants={stagger} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-60px' }}>
            {proofCards.map((card) => (
              <motion.div key={card.title} className="proof-card" variants={fadeUp} transition={{ duration: 0.4, ease: 'easeOut' }}>
                <h3>{card.title}</h3>
                <p>{card.body}</p>
              </motion.div>
            ))}
          </motion.div>
        </motion.div>
      </section>

      <section className="landing-section">
        <motion.div
          className="landing-section-inner"
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.45, ease: 'easeOut' }}
        >
          <span className="landing-eyebrow">Why Midnight</span>
          <h2>Built on Midnight's dual-ledger model</h2>
          <p>
            Every Midnight contract splits cleanly into two domains: a <strong>public ledger</strong> — the on-chain,
            verifiable transcript anyone can check — and <strong>private local state</strong>, which runs on your own
            machine and is never transmitted anywhere. <code>disclose()</code> is the only bridge between the two,
            enforced by the compiler itself. That split is what makes selective disclosure a first-class feature
            here rather than a workaround: the same secret can register publicly, prove a match while disclosing
            only one boolean bit, or opt in to revealing your identity — three disclosure policies, one underlying
            proof.
          </p>
        </motion.div>
      </section>

      <section className="landing-section landing-section--alt">
        <motion.div
          className="landing-section-inner"
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.45, ease: 'easeOut' }}
        >
          <span className="landing-eyebrow">What it can do today</span>
          <motion.ul
            className="landing-feature-list"
            variants={stagger}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: '-60px' }}
          >
            {features.map((feature) => (
              <motion.li key={feature} variants={fadeUp} transition={{ duration: 0.35, ease: 'easeOut' }}>
                <span className="landing-feature-dot" />
                {feature}
              </motion.li>
            ))}
          </motion.ul>
        </motion.div>
      </section>

      <section className="landing-final-cta">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.45, ease: 'easeOut' }}
        >
          <h2>Try it yourself</h2>
          <p>No wallet needed to start — a local dev identity keeps every proof, save, and share flow fully testable.</p>
          <Link to="/app" className="landing-cta">
            Get started
          </Link>
        </motion.div>
      </section>
    </div>
  )
}
