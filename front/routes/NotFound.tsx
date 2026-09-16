import { Link } from 'react-router-dom'
import './Landing.css'

export default function NotFound() {
  return (
    <div className="not-found">
      <p className="landing-eyebrow">404</p>
      <h1>That page doesn't exist</h1>
      <p>The link might be old, or the address was mistyped.</p>
      <Link to="/" className="landing-cta">
        Take me home
      </Link>
    </div>
  )
}
