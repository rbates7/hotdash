import type { DiagramVariant } from "@/lib/chlk/fixtures"

const INK = "#1f1f1f"
const RED = "#e5322d"
const GREEN = "#2e9e5b"

/**
 * Simplified whiteboard diagram used by the Playbook Library cards. Drawn as
 * SVG so labels come from the fixture and the art stays crisp at any width.
 * Geometry is traced from the Figma raster (viewBox 225×125 ≈ 186×103 card).
 */
export function PlayDiagram({
  labels,
  variant,
}: {
  labels: [string, string]
  variant: DiagramVariant
}) {
  const id = `arrow-${variant}`

  return (
    <svg
      viewBox="0 0 225 125"
      className="block size-full"
      role="img"
      aria-label={`${labels[0]} / ${labels[1]} diagram`}
    >
      <defs>
        <marker
          id={id}
          viewBox="0 0 8 8"
          refX="6"
          refY="4"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M0 0.5 L7 4 L0 7.5 Z" fill={INK} />
        </marker>
      </defs>

      <rect width="225" height="125" fill="#ffffff" />

      <text
        x="13"
        y="18"
        fontSize="7.5"
        fontWeight="700"
        letterSpacing="1"
        fill="#3f3f3f"
      >
        {labels[0].toUpperCase()}
      </text>
      <text
        x="186"
        y="18"
        textAnchor="end"
        fontSize="7.5"
        fontWeight="700"
        letterSpacing="1"
        fill="#3f3f3f"
      >
        {labels[1].toUpperCase()}
      </text>

      <line x1="112.5" y1="8" x2="112.5" y2="125" stroke="#b3b3b3" strokeWidth="1" strokeDasharray="3 3" />

      <Routes variant={variant} marker={`url(#${id})`} />

      {/* Offensive line + back */}
      <g stroke={INK} strokeWidth="1.5" fill="#ffffff">
        <circle cx="97" cy="88" r="4.5" />
        <circle cx="108" cy="88" r="4.5" />
        <rect x="114" y="83.5" width="9" height="9" />
        <circle cx="129" cy="88" r="4.5" />
        <circle cx="140" cy="88" r="4.5" />
        <circle cx="118.5" cy="104" r="4.5" />
      </g>

      {/* Skill players */}
      <circle cx="58" cy="86" r="4.5" fill={RED} />
      <circle cx="69" cy="93" r="4.5" fill={RED} />
      <circle cx="168" cy="86" r="4.5" fill={GREEN} />
    </svg>
  )
}

function Routes({ variant, marker }: { variant: DiagramVariant; marker: string }) {
  const stroke = { stroke: INK, strokeWidth: 1.4, fill: "none", markerEnd: marker } as const

  if (variant === "crossers") {
    return (
      <g>
        <path d="M69 93 L160 64" {...stroke} />
        <path d="M168 86 L86 58" {...stroke} />
      </g>
    )
  }

  if (variant === "verticals") {
    return (
      <g>
        <path d="M58 86 L78 46" {...stroke} />
        <path d="M168 86 L150 46" {...stroke} />
        <path d="M96 60 L96 54 L102 54" stroke={INK} strokeWidth="1.4" fill="none" />
        <path d="M134 60 L134 54 L128 54" stroke={INK} strokeWidth="1.4" fill="none" />
      </g>
    )
  }

  return (
    <g>
      <path d="M58 86 L58 68 L38 68" {...stroke} />
      <path d="M69 93 L69 72 L92 72" {...stroke} />
      <path d="M168 86 L168 66 L192 66" {...stroke} />
    </g>
  )
}
