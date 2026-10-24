# PocketFile Design

## Intent

PocketFile is a free, Thai-first personal file utility that replaces the need to visit several unrelated conversion and editing sites. A person opens one app, selects a tool, chooses a local file, makes the change, and downloads a new file. The app has no account, backend, cloud storage, advertisements, or paid service. Source files stay on the device.

## Goals

- Deliver ten working tools in one responsive installable web app: image compressor, image converter, batch image processor, ID photo maker, image OCR, privacy cleaner, PDF merge, PDF page manager, Quick Sign, and print layout.
- Make each tool's file selection, preview, settings, processing state, errors, reset, and export clear and usable on touch and desktop.
- Keep all file transformations local. Keep only theme and recent tool IDs in local storage.
- Support a static GitHub Pages deployment at the `/pocketfile/` repository path, with an app manifest and a service worker for app-shell offline use.
- Explain that a placed Quick Sign signature is a visual mark, not a certificate-backed digital signature.

## Non-goals and anti-goals

- No accounts, cloud storage, server, database, payments, subscription, ads, scanner, file validator, or image-to-PDF tool.
- No remote processing of user files. OCR may fetch the Thai and English language models on first use; Tesseract.js caches those model files in browser IndexedDB. The app must say when a model may need to be downloaded.
- No background replacement unless a real local foreground segmentation model is added. The ID-photo tool focuses on crop, framing, size, and DPI.
- Never report success when a browser cannot decode, process, or export the selected file.

## Constraints

- Primary language: Thai. Start in light mode with a saved light/dark preference.
- Static React + TypeScript + Vite app; repository name and Vite base path: `pocketfile`.
- Use browser Canvas APIs for image processing; PDF.js for PDF thumbnails and preview; pdf-lib for PDF edits; JSZip for batch archives; Tesseract.js for on-device OCR; an open-source HEIC decoder fallback; exifr for metadata inspection.
- All package choices must install together on the available Node 24 runtime. Pin the resolved dependency graph in `package-lock.json`.
- Re-encode privacy-cleaned images and verify that the exported file no longer contains the inspected EXIF fields. Redaction must paint opaque pixels into the exported image.
- Preserve original inputs; exports are new files. Revoke object URLs and release PDF/OCR workers when no longer needed.
- The current host is Windows and has no Safari browser. Build and browser checks can cover Chrome; Safari-specific checks must be reported as unavailable unless a Safari-capable environment is connected.

## Design and implementation calls

- Use a single dashboard with searchable tool cards, Image Tools and PDF Tools groups, recent tools, settings, and a shared tool workspace. Keep navigation in app state rather than adding routing complexity.
- Use a custom CSS design system with Lucide icons for a premium utility-app look and minimal runtime styling dependencies.
- Use focused modules under `src/lib` for image and PDF operations, and one React component per tool under `src/tools`. Shared primitives handle file selection, status, preview, and downloads.
- Use up/down controls for reordering PDF pages and files, so the required ordering works on both touch and desktop without depending on drag-only interaction.
- Cache the app shell with the Vite PWA plugin. Lazy-load OCR and HEIC support. Tesseract.js stores language data in IndexedDB after first use; display that first-use model download requirement.

## Success criteria

The production build succeeds, automated tests cover the key transformation logic, all ten tools have end-to-end user flows with real local output files, the dashboard remains usable at phone and desktop widths, and the GitHub Pages workflow builds from the repository root. Limitations are stated in the UI and final handoff.
