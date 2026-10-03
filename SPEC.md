# OpenGrasp — Specification

> Status: **Draft v0.7** (2026-10-03). Derived from the initial naming/architecture brainstorm. This is a living document; open questions are tracked at the end.

## 1. Overview

OpenGrasp is an open-source, local-first Progressive Web App (PWA) for reading PDFs, built for deep technical study (e.g. C++ books, language standards, whitepapers, documentation). It runs in any modern desktop browser (v1), with mobile support planned later. It remembers exactly where you left off in each document, lets you take notes and highlight passages, and is designed so AI-assisted exploration and note-taking can be added later.

**Short description** (GitHub "About", PWA manifest):

> OpenGrasp is an open-source, lightning-fast PWA PDF reader built for deep technical study, featuring local-first metadata storage (IndexedDB), seamless progress tracking, and an extensible architecture designed for AI-powered document exploration.

### 1.1 Name

- **OpenGrasp**: "grasp" means understanding a hard concept and also holding on to your place and notes. "Open" reflects that the project is open source and gives open access to knowledge.
- Repository: `github.com/markosankovic/opengrasp` (no hyphen, so it matches the single-word brand).
- Possible future package scope: `@opengrasp/*` (e.g. `@opengrasp/core`, `@opengrasp/sync`).
- Hosting for v1: GitHub Pages at `markosankovic.github.io/opengrasp`.
- A custom domain comes later. Candidates (availability not checked yet): `opengrasp.app`, `opengrasp.dev`, `opengrasp.ai`.

### 1.2 Target users

- Developers, engineers and students who read dense technical PDFs over many sessions.
- Primary motivating use case: studying C++ from books and references.

### 1.3 Guiding principles

1. **Local-first and private.** PDFs never leave the device. There is no backend in v1.
2. **Store metadata, not files.** Only reading state, notes and highlights are persisted.
3. **Minimal, unobtrusive and fast.** The PDF is the interface: controls stay out of the way, nothing animates for its own sake, and every interaction feels instant. No ads or trackers (see §8 and §9).
4. **Cross-platform.** One installable PWA. v1 targets **desktop** browsers (Chromium, Firefox, Safari on macOS); mobile and tablet support come later.
5. **AI-ready.** Notes and highlights keep their text context and location, so they can be passed to an LLM later without re-parsing whole books.

## 2. Scope

### 2.1 MVP (v1)

| # | Feature | Description |
|---|---------|-------------|
| F1 | Open PDF | Open a **local** PDF through the file picker or drag-and-drop. Local files only. |
| F2 | Render | A custom React viewer on PDF.js (§4.7) with **continuous vertical scroll**, the only reading mode in v1. It covers page navigation, zoom, and a text layer so text can be selected. |
| F3 | Document identification | Compute a stable ID for each opened file so its metadata can be matched when the file is reopened (see §4.2). |
| F4 | Resume position | Save page, position within the page, and zoom automatically, and restore them when the same document is reopened. |
| F5 | Recent documents | A library or home view listing previously opened documents, sorted by last opened, with progress shown. The user has to re-select the file to read it, because files aren't stored. |
| F6 | Notes | Basic notes: a plain-text Markdown `<textarea>` with no preview. A note belongs to a document and optionally to a page. |
| F7 | Highlights | Basic highlights: select text and highlight it in one of four fixed colors (§5.3), with an optional plain-text note. The stored data includes the selected text, the page and the position. |
| F8 | PWA | Installable app (manifest, standalone display) that works offline through a service worker. |
| F9 | Hosting | A static build deployed to GitHub Pages by GitHub Actions on every push to `main`. |
| F10 | Export / import | Export all metadata to a JSON file and import it on another device or browser. This is the v1 answer for backups and for moving between devices (see §4.6). |
| F11 | Links and outline | Internal and external links in the PDF work, and the table of contents opens as a popover (§4.7). |
| F12 | Find in document | A find bar that jumps between matches (§4.7). |

### 2.2 Later

- **AI exploration**: ask questions about a highlight, a page or a page range; explain code snippets; summarize; turn notes into study material. Users bring their own provider: a local LLM (e.g. Ollama) or a cloud API key.
- **A better notes editor:** Markdown live preview, code blocks with syntax highlighting, LaTeX/math rendering.
- **Highlight refinements:** custom or editable colors, editing a highlight's range, and possibly merging highlight notes and standalone notes into one concept.
- Search across all notes and highlights.
- Export notes and highlights as Markdown (per document), for reading them outside the app.
- Optional cross-device sync, e.g. a user-owned GitHub Gist, WebDAV, a file in a synced folder, or a paid hosted "open core" add-on.
- More reading modes: single page, two-page spread, and possibly horizontal scrolling.
- Keyboard-driven navigation (Vim-style keybindings).
- **Mobile and tablet support:**
  - touch text selection for highlights
  - pinch zoom
  - a bottom-sheet notes panel
  - larger touch targets
- Opening PDFs from a URL (limited by CORS on many hosts).
- A custom domain.
- A plugin or extension architecture.

### 2.3 Non-goals (for now)

- Storing or uploading PDF files.
- User accounts or a backend server.
- Ads. They conflict with the privacy and focus principles, and technical users mostly block them anyway.
- Editing PDFs or writing annotations back into the PDF file.
- In v1: opening PDFs from URLs, and mobile or touch devices (both planned later, §2.2).

## 3. Tech stack

| Concern | Choice | Notes |
|---------|--------|-------|
| Language | **TypeScript** (strict) | Decided. `strict: true`, no `any` in the data layer. |
| Runtime (tooling) | **Node.js ≥ 22.13** | `.nvmrc` pins 22. This is required by `pdfjs-dist` 6. |
| Build tool | **Vite** | Fast HMR; static output. |
| UI | **React** + **Tailwind CSS** (v4) | Design tokens are defined as CSS variables in Tailwind's `@theme` (see §5.3). |
| PDF engine | **PDF.js** (`pdfjs-dist`) | Bundle the worker with Vite, matched to the installed version, so parsing runs off the main thread. Load it lazily, only when a document is opened. |
| Persistence | **IndexedDB** via **idb** | Decided; the comparison is in §3.1. |
| Icons | **Lucide** (`lucide-react`) | See §5.5. |
| PWA | **vite-plugin-pwa** (Workbox) | Generates the manifest and service worker. |
| Hosting | **GitHub Pages** + **GitHub Actions** | `.github/workflows/deploy.yml`: `npm run build` → deploy `dist/`. Vite `base` has to be `/opengrasp/` unless a custom domain is used. |
| License | **MIT** | Already in the repo. |

### 3.1 Storage library: Dexie.js vs idb

| | **idb** (Jake Archibald) | **Dexie.js** |
|---|---|---|
| What it is | A thin layer that adds Promises to the native IndexedDB API | A full database layer over IndexedDB (query builder, hooks, live queries) |
| Size (min+gzip) | ~1–2 KB | ~25–30 KB, plus `dexie-react-hooks` |
| TypeScript | Very good: one `DBSchema` interface types every store, key and index | Good: typed tables (`EntityTable<T, 'id'>`) |
| Querying | Native: get by key, by index, by key range; compound indexes work | Expressive chaining (`where().between().and()…`), `or`, sorting, offset and limit helpers |
| Schema migrations | Native `upgrade(db, oldVersion)` callback; you write each step | Declarative `db.version(n).stores({...}).upgrade(...)` |
| Reactive UI | Not built in; components refresh after a write | `useLiveQuery()` re-renders components automatically when data changes, even across tabs |
| Full-text search over notes | No | No (only prefix matches on indexes). Either way it needs an in-memory filter or a search library. |
| Sync and cloud | No | Dexie Cloud (paid add-on) |
| Learning curve | You have to understand the IndexedDB model | Low |

**What OpenGrasp actually needs:**
- Four small stores (`documents`, `highlights`, `notes`, `fileHandles`).
- Queries:
  - recent documents (index on `lastOpenedAt`)
  - everything for one document (index on `documentId`)
  - everything on one page (compound index `[documentId+pageNumber]`)
  - get or put by `id`
- Data measured in kilobytes per user. Searching all notes means scanning a few thousand records in memory, which takes milliseconds.

Native IndexedDB handles all of these queries. Dexie's real advantages are the reactive `useLiveQuery`, declarative migrations, and a query builder for complex queries that OpenGrasp doesn't have.

**Recommendation: idb.**
- It matches the "very simple, very fast" goal: an extra ~1 KB instead of ~30 KB in the app shell, and no abstraction between the code and IndexedDB.
- Its `DBSchema` typing works well with strict TypeScript.
- Reactivity stays simple. All writes go through one small repository module (`src/db/`) that updates app state after each write. Changes made in other tabs can come later through a `BroadcastChannel` if needed.
- It's easy to undo. Components never import `idb` directly, only the repository functions such as `getDocument`, `saveProgress` and `listHighlights(documentId, page?)`. Switching to Dexie later would change one folder.

**When to revisit:** if the queries become complex (many filters or joins), or if live updates across many components start to feel like a lot of boilerplate, move to Dexie and `useLiveQuery`.

## 4. Architecture

### 4.1 High-level flow

1. The user opens OpenGrasp and selects or drops a PDF.
2. The app reads the file into memory (`File` → `ArrayBuffer`).
3. It computes the document ID (§4.2) and looks up metadata in IndexedDB.
4. PDF.js renders the document. If metadata exists, the app restores the page, zoom and scroll position, and loads the notes and highlights.
5. While the user reads, the app saves progress with a debounce (and on `visibilitychange` / `pagehide`).
6. The PDF stays in memory only and is discarded when it is closed.

### 4.2 Document identification

The app stores no PDFs, so it has to recognize a file when the user opens it again. Options:

| Option | Pros | Cons |
|--------|------|------|
| SHA-256 of the full file (Web Crypto) | Robust, content-based, works across devices | Costs a little time on large files. `crypto.subtle.digest` isn't streaming, so the whole buffer is needed (it's already in memory for PDF.js anyway). |
| SHA-256 of the first N MB + file size | Fast | A small risk of collisions between revisions of the same book. |
| PDF.js `pdfDocument.fingerprints` (from the PDF trailer `/ID`) | Free, available after load | Not every PDF has `/ID`, and the value can be identical across edits or different files from the same generator. |
| `name + size + lastModified` | Instant | `lastModified` and the name change across devices and copies, so it's fragile. |

**Decision:** the document `id` is the **SHA-256 of the full file**, hex-encoded and computed with `crypto.subtle.digest`. The app also stores `fingerprints`, `fileName` and `fileSize` as secondary hints.

Any change to the file's contents produces a new `id`, for example a new revision of the book or a PDF re-saved by another tool. The app then looks for an existing document with the same `fingerprints`, or the same `fileName` and a similar size, and offers to **re-link** the old notes and highlights to the new `id`. It never does this silently. The re-link UX is minimal in v1: one inline prompt.

### 4.3 Reopening files

- **Baseline (all browsers):** clicking a library item opens the file picker. The item shows the expected file name to help.
- **Progressive enhancement (Chromium, implemented):** files opened through the picker (`showOpenFilePicker`) or by drag-and-drop (`DataTransferItem.getAsFileSystemHandle()`) keep a `FileSystemFileHandle` in the `fileHandles` store.
  - Clicking the library item reopens the file directly. If read permission has lapsed (e.g. after a browser restart), the click triggers a one-line browser prompt. Chrome can remember the grant ("Allow on every visit"), especially for the installed PWA.
  - If the file was moved, renamed or deleted, the stale handle is removed, a one-line message is shown and the picker opens.
  - A handle is device-specific and is never exported (§4.6).
- **PWA file handling (Chromium desktop, later):** a `file_handlers` entry in the manifest registers OpenGrasp as an app that can open `.pdf` files from the operating system.

### 4.4 Data model (IndexedDB)

This is a normalized design rather than one nested document per PDF. It makes it straightforward to query notes and highlights across all documents (search, and later AI).

```ts
// Store: documents   (primary key: id)
interface DocumentMeta {
  id: string;              // SHA-256 of file content (hex)
  fingerprints?: string[]; // PDF.js fingerprints
  fileName: string;
  fileSize: number;
  title?: string;          // from PDF metadata, else fileName
  pageCount: number;
  createdAt: number;       // first opened
  lastOpenedAt: number;    // indexed, for the recent list
  progress: {
    pageNumber: number;
    pageOffset: number;    // 0–1: how far down the page the viewport top is (zoom-independent)
    zoom: number | 'page-width' | 'page-fit';
    updatedAt: number;
  };
}

// Store: highlights  (primary key: id; indexes: documentId, [documentId+pageNumber])
interface Highlight {
  id: string;              // uuid
  documentId: string;
  pageNumber: number;
  selectedText: string;    // context for search and AI
  rects: Array<{ x: number; y: number; w: number; h: number }>; // in PDF page coordinates (scale-independent)
  color: string;
  note?: string;           // markdown
  createdAt: number;
  updatedAt: number;
}

// Store: notes  (primary key: id; indexes: documentId, [documentId+pageNumber])
interface Note {
  id: string;              // uuid
  documentId: string;
  pageNumber?: number;     // undefined = document-level note
  content: string;         // markdown
  createdAt: number;
  updatedAt: number;
}

// Store: fileHandles (Chromium only; primary key: documentId)
interface FileHandleEntry {
  documentId: string;
  handle: FileSystemFileHandle;
}
```

Highlight rects are stored in PDF page coordinates, not screen pixels, so they render correctly at any zoom level and on any device.

### 4.5 AI-readiness (design constraints for v1)

v1 has no AI features, but it should keep the following true:

- Every highlight and note carries its `pageNumber`, and highlights carry their `selectedText`, so a prompt can be assembled from a snippet plus the user's note without ingesting the whole book.
- Text extraction (`page.getTextContent()`) sits behind a small module, so it can later supply page or page-range context to an LLM.
- AI providers are pluggable: a local endpoint (Ollama) or a user-supplied cloud API key, called directly from the browser. There is no OpenGrasp backend in between.

### 4.6 Export / import (v1)

There is no sync in v1. Moving data between devices or browsers, and backing it up, is done manually.

- **Export:** a button in Library settings downloads `opengrasp-export-YYYY-MM-DD.json`:
  ```ts
  interface ExportFile {
    format: 'opengrasp-export';
    version: 1;              // export format version, independent of the DB schema version
    exportedAt: number;
    documents: DocumentMeta[];
    highlights: Highlight[];
    notes: Note[];
    // fileHandles are device-specific and are never exported
  }
  ```
- **Import:**
  - Select a file, then validate `format` and `version`. Unknown future versions are rejected with a clear message.
  - Records are merged by `id`. If a record exists on both sides, the one with the newer `updatedAt` wins; for documents the comparison uses `progress.updatedAt`, and `lastOpenedAt` keeps the maximum of the two.
  - Nothing is ever deleted by an import.
  - Afterwards the app shows a one-line summary (e.g. "Imported 3 documents, 41 highlights, 12 notes").
- PDFs aren't part of the export. Because the IDs are content hashes, metadata reattaches automatically when the same PDF is opened on the other device.

### 4.7 Viewer (custom React)

**Decision:** OpenGrasp has its own React viewer built on the **core `pdfjs-dist` API**. It doesn't use the stock PDF.js viewer (`pdfjs-dist/web/pdf_viewer`) or wrappers such as `react-pdf`. This gives full control over the look, the performance and the interaction (highlights, the selection popover, and later AI).

**PDF.js APIs used:**
- `getDocument()` to load the document
- `page.render()` to draw a page onto a `<canvas>`
- `TextLayer` to build the selectable text layer
- `page.getAnnotations()` to read links
- `pdf.getOutline()` to read the table of contents

**Component structure:**
```
<Reader>                     document, zoom, progress, keyboard shortcuts
  <TopBar/>
  <PageList>                 scroll container + virtualization
    <Page n>                 fixed-size box (placeholder until rendered)
      <canvas/>              page drawing
      <TextLayer/>           transparent, selectable text (pdf.js TextLayer)
      <HighlightLayer/>      our own highlight overlays
      <LinkLayer/>           our own <a> overlays for internal and external links
  <SelectionPopover/>
  <NotesPanel/>
```

**Virtualization:**
- Written by us with no virtualization library. Page sizes are known, so the layout is a simple prefix sum of page heights.
- **Layout:**
  - Every page's size (`getViewport({ scale: 1 })`) is read after loading, so the total scroll height is exact and the scrollbar is honest.
  - Placeholder sizes start from page 1's size and are corrected as the remaining sizes load.
- **Mounting:**
  - Pages are mounted while they're in view or within a buffer of about one screen, tracked with an `IntersectionObserver` or a calculation on scroll.
  - Pages further away are unmounted: their canvas is released and their render is cancelled with `renderTask.cancel()`.
- **Render queue** (one render at a time, in this order):
  1. the visible pages
  2. the next page
  3. the previous page
  4. the rest of the buffer

**Rendering:**
- **Canvas size:**
  - Canvases are rendered at `scale × devicePixelRatio`.
  - The canvas area is capped (e.g. ≤ 16 M pixels per canvas). Above the cap, render at a lower resolution and let CSS scale it up.
- **Zoom:**
  - Zooming applies a CSS `transform: scale()` immediately, which is instant but slightly blurry.
  - About 150 ms after the last zoom input, the visible pages re-render sharply at the new scale.
  - The point under the cursor stays fixed (`Ctrl` + wheel / trackpad pinch).
- **Text layers:** built only for mounted pages, and after the canvas has drawn.

**Coordinates:**
- Highlights and links are stored and handled in **PDF page coordinates**.
- `viewport.convertToViewportRectangle()` maps them onto the screen at any zoom level.
- When creating a highlight, the selection's `Range.getClientRects()` are converted back with `viewport.convertToPdfPoint()`, clipped to each page, and merged per line.

**Progress and restoring:**
- The app tracks the page at the top of the viewport (`pageNumber`) and how far down it the top edge is (`pageOffset`, 0–1). It doesn't use pixel offsets, so the position survives zoom changes and different screen sizes.
- On open, the app sets the scroll position from `pageNumber` and `pageOffset` *before* rendering, so the target page is the first one drawn and no other page flashes on screen first.

**Links and outline (MVP):**
- Internal links (e.g. table-of-contents entries and cross-references) scroll to their target.
- External links open in a new tab with `rel="noopener noreferrer"`.
- The outline from `getOutline()` opens as a popover (§5.2).

**Find in document (MVP):**
- `/` opens a small find bar.
- Each page's text comes from `page.getTextContent()`, extracted lazily and kept in memory. This uses the same text-extraction module as §4.5.
- Matches are drawn in the `HighlightLayer` style, and `Enter` / `Shift+Enter` jump to the next / previous match.

## 5. Design guide

> Direction: **minimal, unobtrusive, very simple, very fast.** OpenGrasp should feel like a quiet sheet of paper with a few tools that appear only when you reach for them.

### 5.1 Principles

1. **The content comes first.** While reading, almost all of the screen is the PDF. App controls take up no more than one thin bar and should be easy to forget.
2. **One screen, no navigation tree.** There are two places: the **Library** (recent documents) and the **Reader**. Notes open in a panel inside the Reader, not on a separate page.
3. **Quiet by default.**
   - No toasts for routine actions. Saving happens automatically and silently.
   - No onboarding tours, modals or confirmations except for destructive actions.
   - Empty states are a single line of text plus one action.
4. **Fast beats pretty.**
   - No decorative animation.
   - Transitions run 150 ms or less, and only on panels opening and closing.
   - Respect `prefers-reduced-motion`.
5. **Keyboard first.**
   - Every action has a shortcut (see §5.7).
   - Mouse targets are at least 28×28 px.
   - Touch-friendly sizing comes with mobile support (§2.2).
6. **Restraint in color.** Neutral grays plus **one** accent color. Highlight colors are the only other colors on screen.

### 5.2 Layout

```
Library                              Reader
┌────────────────────────────────┐   ┌──────────────────────────────────┬───────────┐
│ OpenGrasp            [Open PDF]│   │ ‹  Effective Modern C++  142/334 │  Notes    │
├────────────────────────────────┤   ├──────────────────────────────────┤           │
│                                │   │                                  │ p.142     │
│  Effective Modern C++    42%   │   │          ┌────────────┐          │ ───────── │
│  2 h ago                       │   │          │            │          │ Review    │
│                                │   │          │    PDF     │          │ move sem… │
│  C++ Concurrency in Action 8%  │   │          │    page    │          │           │
│  yesterday                     │   │          │            │          │ + note    │
│                                │   │          └────────────┘          │           │
│     drop a PDF anywhere        │   │                                  │           │
└────────────────────────────────┘   └──────────────────────────────────┴───────────┘
```

- **Library:**
  - A plain list with the title, progress percentage and relative last-opened time.
  - Dropping a PDF anywhere in the window opens it.
  - Selecting a document whose file isn't available prompts for the file and shows its expected name.
- **Reader top bar:**
  - Height 40 px or less, containing back, title, page `n / total`, zoom, and a notes toggle.
  - It hides automatically after a few seconds of scrolling and comes back on mouse movement near the top or on `Esc`.
- **Notes panel:**
  - On the right, resizable, closed by default, and its open/closed state is remembered.
  - On narrow windows it overlays the page instead of shrinking it.
- **Selection popover:** a small floating bar above selected text with the highlight colors, a note button and a copy button (later also *Ask AI*).
- **No sidebars by default.** Page thumbnails and the outline (table of contents) are one shortcut away, not shown permanently.

### 5.3 Color

All colors are CSS custom properties defined once in Tailwind v4's `@theme`. Components use semantic tokens (e.g. `bg-surface`, `text-muted`), never raw palette values. The neutral grays and the blue accent are **approved**. The exact values may still be tuned during implementation.

| Token | Light | Dark | Use |
|-------|-------|------|-----|
| `--color-bg` | `#ffffff` | `#18181b` | App background |
| `--color-surface` | `#f4f4f5` | `#27272a` | Bars, panels, popovers |
| `--color-border` | `#e4e4e7` | `#3f3f46` | Hairline dividers (1 px) |
| `--color-text` | `#18181b` | `#f4f4f5` | Primary text |
| `--color-muted` | `#71717a` | `#a1a1aa` | Secondary text, icons at rest |
| `--color-accent` | `#2563eb` | `#60a5fa` | Focus rings, active state, primary action (used sparingly) |
| `--color-danger` | `#dc2626` | `#f87171` | Destructive actions only |
| `--color-reader-bg` | `#e4e4e7` | `#09090b` | Area behind PDF pages |

- **Themes:**
  - Light and dark follow `prefers-color-scheme`, with a manual override (system / light / dark).
  - **Reading themes (MVP):**
    - **Sepia:** a warm background and slightly darker page tint, for long reading sessions.
    - **Dim pages:** an optional filter for dark mode (e.g. `filter: invert(1) hue-rotate(180deg)` on page canvases, but not on images if that can be detected) so white pages don't glare.
  - The theme picker offers system / light / dark / sepia, plus a separate "dim pages" toggle.
- **Highlight colors:**
  - Four fixed colors (yellow, green, blue, pink), drawn semi-transparently over the text (e.g. `mix-blend-mode: multiply` in light mode).
  - Store a *name* (`"yellow"`), not a hex value, so themes can render each one differently.
- **Contrast:** text meets WCAG AA (4.5:1). The focus ring is always visible when navigating by keyboard (`:focus-visible`).

### 5.4 Typography

- **UI font:** the system font stack (`ui-sans-serif, system-ui, …`). No web fonts, so there's nothing to download and no layout shift.
- **Monospace** (notes, code): `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`.
- **Scale:** 12 / 14 / 16 px only. The UI text is 14 px, and notes are 14–16 px.
- **Weights:** 400 and 600 only.

### 5.5 Icons

- **Lucide** (`lucide-react`):
  - consistent 1.5–2 px stroke and a minimal look
  - only the icons in use end up in the bundle
  - ISC license
- **Rules:**
  - Icons are 16 px, colored `--color-muted` at rest and `--color-text` on hover or when active.
  - Icon-only buttons need an `aria-label` and a tooltip that shows the shortcut (e.g. "Notes (N)").
- **Initial set:**

  | Purpose | Lucide icons |
  |---------|--------------|
  | Navigation | `ArrowLeft`, `ChevronLeft`, `ChevronRight` |
  | Open and zoom | `FileUp`, `ZoomIn`, `ZoomOut` |
  | Notes and highlights | `PanelRight` (notes), `Highlighter`, `StickyNote`, `Copy` |
  | Library and outline | `Search`, `List` (outline), `LayoutGrid` (thumbnails) |
  | Settings and actions | `Settings`, `Sun` / `Moon`, `Trash2`, `X` |

### 5.6 App icon and brand

- **Wordmark:** "OpenGrasp" set in the system font at weight 600. No custom logotype for now.
- **App icon (final): "Brace" `{≡`**, a code brace holding lines of text, in the accent color. The source files are final and shouldn't be redrawn:
  - `public/logo.svg` is the master and the SVG favicon. It switches to the dark accent under `prefers-color-scheme: dark`.
  - `public/logo-maskable.svg` is a white glyph on a full accent background, scaled into the 80% safe zone.
- **Generated sizes:** produced by `@vite-pwa/assets-generator` (preset `minimal-2023`) from the two source files, not drawn by hand.
  - `favicon.ico`
  - `apple-touch-icon` 180 px
  - PWA icons at 64, 192 and 512 px
  - a maskable 512 px icon

### 5.7 Keyboard shortcuts (initial)

| Key | Action |
|-----|--------|
| `o` / `Ctrl+O` | Open PDF |
| `j` / `k`, `↓` / `↑` | Scroll |
| `n` / `p`, `→` / `←`, `PgDn` / `PgUp` | Next / previous page |
| `g` | Go to page |
| `+` / `-` / `0` | Zoom in / out / fit width |
| `h` | Highlight the selection |
| `N` (`Shift+n`) | Toggle notes panel |
| `/` | Search (document; later notes) |
| `Esc` | Close popover or panel; show the top bar |
| `?` | Shortcut cheat sheet |

## 6. Performance

"Very fast" is about how fast the app *feels*: startup, opening a document and scrolling. Bundle size is not a target in itself.

| Metric | Target |
|--------|--------|
| Library view interactive (repeat visit, cached by the service worker) | < 300 ms |
| From opening a PDF to the first page visible (300-page book, mid-range laptop) | < 1 s |
| Resuming a known document (scroll restored) | the target page renders first, before any other page |
| Page turn / scroll | 60 fps, no blank pages visible during normal scrolling |

Techniques:
- Load PDF.js and its worker **lazily**, when the first document is opened. Precache them with the service worker so offline use still works.
- **Virtualized rendering** in the custom viewer (§4.7).
- Hash the file (§4.2) while PDF.js parses it, not before rendering starts.
- Debounce progress writes (~500 ms) and write once more on `pagehide`.
- Few dependencies: React, Tailwind, pdfjs-dist, idb, lucide-react. Every new runtime dependency needs a reason.

## 7. PWA requirements

- Manifest: `name: "OpenGrasp"`, `short_name: "OpenGrasp"`, icons (192, 512, maskable), `display: "standalone"`, `start_url` and `scope` matching the Pages base path, theme colors.
- The service worker precaches the app shell and PDF.js worker, so the app works fully offline.
- Update flow: a "new version available — reload" prompt (vite-plugin-pwa `registerType: 'prompt'`).
- Optional: `file_handlers` for `.pdf` (see §4.3).

## 8. Privacy and security

- PDF bytes are never sent over the network.
- No analytics, ads or third-party trackers.
- All metadata lives in the browser's IndexedDB on the user's device. Clearing site data deletes it, and export/import (F10) is the backup path.
- When AI features arrive, sending content to a provider is explicit and opt-in for each action, and the UI shows which provider receives it.
- Consider requesting `navigator.storage.persist()` so the browser doesn't evict the metadata.

## 9. Project and community

- Open source under MIT. Contributions welcome (CONTRIBUTING.md to come).
- Funding, if needed later: GitHub Sponsors, Open Collective, or an optional paid hosted sync or AI layer (open core). No ads.

## 10. Open questions

None right now. New questions are added here as the work goes on.
