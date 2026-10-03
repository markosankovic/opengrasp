/** The "Brace" mark from public/logo.svg, inline so it follows the theme. */
export function LogoMark({ className = '' }: { className?: string }) {
  return (
    // viewBox is cropped to the glyph (incl. stroke) so it aligns with the text without extra padding.
    <svg viewBox="64 64 368 384" className={`w-auto text-accent ${className}`} aria-hidden>
      <g fill="none" stroke="currentColor" strokeWidth="48" strokeLinecap="round" strokeLinejoin="round">
        <path d="M196 88 C148 88 136 108 136 156 L136 212 C136 240 120 256 88 256 C120 256 136 272 136 300 L136 356 C136 404 148 424 196 424" />
        <path d="M248 168 H408 M248 256 H368 M248 344 H408" />
      </g>
    </svg>
  )
}

/** The mark plus the wordmark (SPEC.md §5.6). */
export default function Logo({ className = '' }: { className?: string }) {
  return (
    <span className={`flex items-center gap-2 ${className}`}>
      <LogoMark className="h-5" />
      <span className="text-trim text-[17px] tracking-tight">
        Open<span className="font-semibold">Grasp</span>
      </span>
    </span>
  )
}
