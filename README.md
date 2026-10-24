# PocketFile

Thai-first personal image/PDF utilities: https://title5656.github.io/PocketFile/
All file processing stays in the browser. The site and source are public; this is not access-controlled storage.

## Eight tools

Compress images, convert images, batch resize/convert with ZIP download, ID photos with DPI, merge PDFs, organize PDF pages, visible PDF signatures, and A4 N-up print layouts.
OCR and image privacy/redaction were removed at the owner's request on 2026-10-24, including their dependencies and OCR worker/model requests. The supplied PocketFile Logo Kit is used for the header, hero, favicon and app icons. The interface is dark-only and Thai-only; theme/language/settings controls are removed.

## Run and verify (Node.js 24)

~~~sh
npm ci
npm run dev
npm test
npm run typecheck
npm run build
npx playwright install chromium --only-shell
npm run test:e2e
npm audit --audit-level=high
~~~

E2E starts the production preview on http://127.0.0.1:4275/PocketFile/, drives isolated Chromium, downloads files and reopens PNG/JPEG/ZIP/PDF output. It compares signature ink in the editor and actual rendered PDF, including rotations and CropBox offsets. It also covers keyboard navigation, a narrow viewport and cached offline conversion. Restricted Windows sandboxes need browser write permissions and an accessible persistent PLAYWRIGHT_BROWSERS_PATH. Test artifacts are ignored by Git.

## Practical limits

- Images: 25 MB each, 40 megapixels, 12,000 px per side. Common PNG/JPEG/extended WebP dimension headers are checked before decode, and every decoded image is checked. HEIC/other variants may expose dimensions only after decoding; low-memory safety is not guaranteed for every file.
- Image batches: 20 files, 100 MB total input and 100 MB total generated blobs. ZIP generation is serialized and errors are visible. Transient decode/archive buffers still consume memory.
- PDFs: 50 MB each, 150 pages. Merge: 10 files, 100 MB combined input, 150 combined output pages. Large 500-page workloads are deliberately rejected.
- ID photo custom size: 0.2–8 inches per side, subject to pixel caps. DPI metadata plus corresponding pixel dimensions do not override physical printer settings. Background replacement is not provided.
- Cancellation is cooperative: discard results and stop at the next checkpoint. A native decode, canvas encode or PDF library operation already started may finish first. Controls remain locked until it settles; a new conflicting job cannot start in that workspace.
- HEIC/HEIF depends on native decoding or the bundled fallback; some variants must be converted to JPG first. Physical Safari/iPhone/Android device coverage is not certified.
- Quick Sign embeds a visible image stamp, not a certificate-backed digital signature. Drawing needs a pointer; placed marks can also move with arrow keys. Typed or uploaded signature authoring was not added.
- Encrypted/damaged PDFs fail with guidance. Copying/embedding may not preserve all interactive forms, annotations, bookmarks or links; inspect important output before relying on those features.

## Privacy and offline

Only recent tool IDs persist in local storage; any legacy theme choice is ignored. Removed-tool IDs are filtered. User files stay in memory and are not uploaded or cached by the PWA. The app shell and static engines are cached after the first online visit; cached image/PDF features can work offline subject to browser storage. Production source maps are disabled. PDF and HEIC engines remain lazy chunks. No accounts, backend, database, cloud processing, telemetry, analytics, advertising or subscriptions.

## GitHub Pages: zero hosting cost

Keep the public repository, exact /PocketFile/ base, Settings → Pages → GitHub Actions, and standard ubuntu-latest runners. Pushes to main run unit tests, typecheck, build, dependency audit and Chromium E2E before deploying dist/. No paid runners, custom domain or external hosting are needed.

GitHub documents this free configuration in https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages and https://docs.github.com/en/actions/concepts/billing-and-usage .

See [the personal QA matrix](docs/QA-2026-10-24.md). Historical specs/plans describe earlier requirements; this README and the latest owner request define current behavior.
