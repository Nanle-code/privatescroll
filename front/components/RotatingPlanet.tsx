export type PlanetCorner = 'top-right' | 'bottom-left'
export type PlanetVariant = 'violet' | 'cyan'

interface RotatingPlanetProps {
  corner: PlanetCorner
  variant?: PlanetVariant
}

/**
 * Purely decorative — an ambient rotating planet anchoring a corner,
 * matching the dark Web3 theme. Fixed position, behind all real content
 * (z-index: -1) and non-interactive (pointer-events: none), so it can
 * never sit in the way of anything real. All motion is plain CSS
 * @keyframes (see App.css), not Framer Motion, so it's automatically
 * covered by the existing global prefers-reduced-motion override instead
 * of needing its own reduced-motion handling. Two instances (opposite
 * corners, swapped hues) anchor the page rather than one lone accent.
 */
export default function RotatingPlanet({ corner, variant = 'violet' }: RotatingPlanetProps) {
  return (
    <div className={`planet-decoration planet-decoration--${corner} planet-decoration--${variant}`} aria-hidden="true">
      <div className="planet-sphere" />
      <div className="planet-ring-wrap">
        <div className="planet-ring" />
      </div>
      <div className="planet-moon" />
    </div>
  )
}
