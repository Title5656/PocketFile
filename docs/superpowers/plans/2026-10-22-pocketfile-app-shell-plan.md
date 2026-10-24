# PocketFile App Shell Implementation Plan

> **For agentic workers:** This is being executed natively in the current session as the user explicitly requested implementation. Follow the TDD skill for behavior code; configuration and static assets may be created directly.

**Goal:** Create a Thai-first responsive PocketFile shell with working navigation, settings, PWA installation, and GitHub Pages deployment.

**Architecture:** React and TypeScript render one dashboard and one selected-tool workspace. Focused shared components expose common upload, progress, error, preview, download, cancel, and reset affordances. A custom CSS system supplies mobile and desktop layouts.

**Tech Stack:** React 19, TypeScript, Vite, Lucide React, Vitest, vite-plugin-pwa, PDF.js, pdf-lib, JSZip, Tesseract.js, heic2any, and exifr. The dependency lockfile is authoritative for resolved versions.

**Spec:** `docs/superpowers/specs/2026-10-22-pocketfile-design.md`

## Execution status

Implemented. Verification completed with 42 passing tests across 13 files, `npm run typecheck`, and `npm run build`. The generated manifest and service worker were inspected. Desktop/mobile browser inspection could not be completed in this environment.

## Global Constraints

- No account, backend, database, cloud file storage, ads, payment, or remote file processing.
- Vite base path and package identity use `pocketfile`; deploy as a static GitHub Pages repository site.
- Thai is the primary UI language; light and dark themes are saved locally.
- Persist only theme and recent tool IDs; do not persist selected files.
- Build and test against the available Node 24 runtime; browser-only features must not be falsely reported as supported when unavailable.

## Review Focus

- `/pocketfile/` subpath asset URLs must work after deployment; test the built file references and workflow config.
- Small viewports must not require horizontal scrolling; verify the main responsive breakpoints in browser.
- Theme and recent-tools storage must tolerate malformed or unavailable localStorage; test the pure storage parsing helpers.
- File actions must revoke object URLs and clear transient state on reset or unmount; review shared file helpers.
- Offline OCR is available only after model assets are cached; UI copy must describe first-use model download and avoid a false offline promise.

---

### Task 1: Project foundation and configuration

**Files:**
- Create: `package.json`, `package-lock.json`, `index.html`, `vite.config.ts`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`, `vitest.config.ts`
- Create: `public/pocketfile.svg`, `.github/workflows/deploy.yml`, `.gitignore`
- Create: `src/main.tsx`, `src/App.tsx`, `src/styles.css`, `src/types.ts`, `src/test/setup.ts`

**Interfaces:**
- Exports `ToolId` and `ToolMeta` from `src/types.ts` for the dashboard and tool components.
- `npm run dev`, `npm run build`, `npm test`, and `npm run test:watch` are the project commands.

- [x] Configure React, TypeScript, Vite, Vitest, PWA support, package scripts, and GitHub Pages base path `'/pocketfile/'`.
- [x] Add automated test infrastructure and a smoke test that asserts the app shell mounts with the PocketFile title.
- [x] Run the shell test and production build; verify both commands pass.

### Task 2: Dashboard, shared tool flow, and preferences

**Files:**
- Create: `src/components/AppHeader.tsx`, `src/components/ToolCard.tsx`, `src/components/ToolWorkspace.tsx`, `src/components/FileDropzone.tsx`, `src/components/ResultCard.tsx`, `src/components/ConfirmDialog.tsx`
- Create: `src/lib/preferences.ts`, `src/lib/preferences.test.ts`, `src/data/tools.ts`
- Modify: `src/App.tsx`, `src/styles.css`

**Interfaces:**
- `readPreferences(storage: Storage): Preferences` and `writePreferences(storage: Storage, preferences: Preferences): void` persist theme and recent tool IDs only.
- `ToolWorkspace` accepts a `ToolId`, a title, and a back callback; each tool component owns its actual file processing.

- [x] Write failing tests for defaults, malformed storage, and bounded recent-tool history.
- [x] Run the preference tests and confirm the expected failures before implementation.
- [x] Implement dashboard search, category groups, recent tools, theme toggle, clear confirmation, shared navigation, and responsive card layout.
- [x] Run preference tests and build.
- [ ] Inspect the app shell at narrow and desktop widths in a browser.

### Task 3: PWA and static deployment

**Files:**
- Modify: `vite.config.ts`, `index.html`
- Create: `public/pocketfile-192.png`, `public/pocketfile-512.png`
- Create: `.github/workflows/deploy.yml`

The PWA plugin generates `dist/manifest.webmanifest` from `vite.config.ts`; do not keep a duplicate source manifest in `public/`.

- [x] Configure app name, icons, standalone display, theme colors, workbox static asset precache, and `navigateFallback` for the repository path.
- [x] Configure GitHub Actions to install from lockfile, build, and deploy the `dist` directory to GitHub Pages on the repository's main branch.
- [x] Build and inspect generated manifest, service worker, base-path asset URLs, and workflow permissions.

