# OpenGrasp

OpenGrasp is an open-source, lightning-fast PWA PDF reader built for deep technical study, featuring local-first metadata storage (IndexedDB), seamless progress tracking, and an extensible architecture designed for AI-powered document exploration.

Your PDFs never leave your device. OpenGrasp stores only metadata: reading position, notes and highlights.

**App:** https://markosankovic.github.io/opengrasp/ · **Spec:** [SPEC.md](SPEC.md)

## Development

Requires Node.js 22.13 or newer (see `.nvmrc`).

```bash
npm install
npm run dev        # start the dev server
npm run build      # type-check and build into dist/
npm run preview    # serve the production build locally
npm run lint
npm run icons      # regenerate PNG/ICO icons from public/logo*.svg
```

## Tech stack

TypeScript, React, Tailwind CSS, Vite, PDF.js (`pdfjs-dist`), IndexedDB via `idb`, `vite-plugin-pwa`. Deployed to GitHub Pages by GitHub Actions.

## License

[MIT](LICENSE)
