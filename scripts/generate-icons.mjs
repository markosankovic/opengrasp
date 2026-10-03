// Generates the PNG/ICO icons in public/ from the two source SVGs (SPEC.md §5.6).
// Run with `npm run icons` after changing public/logo.svg or public/logo-maskable.svg.
import { readFile, writeFile } from 'node:fs/promises'
import {
  generateFavicon,
  generateMaskableAsset,
  generateTransparentAsset,
} from '@vite-pwa/assets-generator/api'

const ACCENT = '#2563eb'
const logo = await readFile('public/logo.svg')
const maskable = await readFile('public/logo-maskable.svg')

for (const size of [64, 192, 512]) {
  const image = await generateTransparentAsset('png', logo, { width: size, height: size }, { padding: 0.05 })
  await image.toFile(`public/pwa-${size}x${size}.png`)
}

// The maskable SVG already has a full-bleed background and a safe-zone glyph, so no extra padding.
const opaque = { padding: 0, resizeOptions: { background: ACCENT, fit: 'contain' } }
await (await generateMaskableAsset('png', maskable, { width: 512, height: 512 }, opaque)).toFile(
  'public/maskable-icon-512x512.png',
)
await (await generateMaskableAsset('png', maskable, { width: 180, height: 180 }, opaque)).toFile(
  'public/apple-touch-icon-180x180.png',
)

const favicon48 = await (await generateTransparentAsset('png', logo, { width: 48, height: 48 }, { padding: 0.05 })).toBuffer()
await writeFile('public/favicon.ico', await generateFavicon('png', favicon48))

console.log('Icons written to public/')
