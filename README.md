# OpenGrasp

OpenGrasp is an open-source, lightning-fast PWA PDF reader built for deep technical study, featuring local-first metadata storage (IndexedDB), seamless progress tracking, and an extensible architecture designed for AI-powered document exploration.

Your PDFs never leave your device. OpenGrasp stores only metadata: reading position, notes, highlights and AI conversations.

**App:** https://markosankovic.github.io/opengrasp/ · **Spec:** [SPEC.md](SPEC.md)

## Using OpenGrasp

- **Open a PDF** by dropping it anywhere on the library page, or with **Load PDF**.
- **Your place is saved automatically:** page, position on the page and zoom. Reopen the document and you continue where you stopped. The top bar shows the page and how far through you are, e.g. `97 / 193 (50%)`.
- **Zoom** with `+` / `-`, `Ctrl` + wheel or a trackpad pinch. Click the zoom percentage (or press `0`) to fit the page width; it fits the book's typical page, so a smaller cover doesn't throw it off.
- **Private by design:** the PDF itself is never stored or uploaded, only the reading position, in your browser (IndexedDB). In Chromium-based browsers the app keeps a handle to the file, so reopening usually takes one click; elsewhere you pick the file again.
- **Pan a zoomed-in page** by holding `Space` and dragging, dragging with the middle mouse button, or dragging the gray area around the pages.
- **Table of contents:** a panel on the left lists the document's chapters, marks the one you're in, and jumps straight to a heading.
- **Works offline** and can be installed as an app.
- **Ask AI** (optional): select a term or passage and choose **Explain** or **Ask**, or type a question about the page. Answers stream into a panel on the right. Uses Google Gemini with your own API key (free in [Google AI Studio](https://aistudio.google.com/apikey)), or a model on your own computer through [Ollama](https://ollama.com), LM Studio or llama.cpp. Either is called directly from your browser; only your question, the selection and the current page are sent. Conversations are saved per document in your browser, and you can delete them. For Ollama on the published site, start it with `OLLAMA_ORIGINS=https://markosankovic.github.io`.
- **Notes:** the Notes tab next to Ask (`m`) holds Markdown notes for a page or the whole document. Click a note to edit it; `Ctrl+Enter` saves, `Esc` cancels. Any AI answer can be saved as a note with one click.
- Press **`?`** or the **?** button in the top bar for help and all keyboard shortcuts.

Highlights, find in document and export/import are planned for v1 (see [SPEC.md](SPEC.md)).

### Keyboard shortcuts

| Key | Action |
|-----|--------|
| `o` / `Ctrl+O` | Library: load a PDF |
| `1`–`9` | Library: open a document from the list |
| `j` / `k`, `↓` / `↑` | Scroll |
| `Space` / `Shift+Space` | Scroll down / up a screen; hold `Space` and drag to pan |
| `n` / `p`, `→` / `←`, `PgDn` / `PgUp` | Next / previous page |
| `Home` / `End` | First / last page |
| `g` | Go to page |
| `+` / `-` / `0` | Zoom in / out / fit width (also `Ctrl` + wheel) |
| `t` | Table of contents |
| `a` | Ask AI about the selection, or open / close the Ask panel |
| `m` | Notes |
| `b` | Back to the library |
| `Esc` | Close the table of contents or help |
| `?` | Help |

## Support

OpenGrasp is free and has no ads or tracking. If it helps you, you can [buy me a coffee on Ko-fi](https://ko-fi.com/markosankovic); it pays for running costs such as a proper domain.

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

UI conventions for contributors: text buttons, with or without an icon, use the `btn` utility and icon-only buttons use `btn-icon` (both in `src/index.css`), so every button has the same 32 px height, padding and radius and its label sits optically centered. See the design guide in [SPEC.md](SPEC.md) §5.

## Tech stack

TypeScript, React, Tailwind CSS, Vite, PDF.js (`pdfjs-dist`), IndexedDB via `idb`, `vite-plugin-pwa`. Deployed to GitHub Pages by GitHub Actions.

## License

[MIT](LICENSE)
