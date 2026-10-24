# PocketFile

PocketFile is a Thai-first, browser-only file utility. Image and PDF contents are processed on the device; the app has no account, upload endpoint, backend, or cloud storage.

## Run locally

Use Node.js 24 and npm:

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. The pre-dev step copies the Tesseract worker and WebAssembly runtime from the installed packages into `public/ocr/`.

## Test and build

```sh
npm test
npm run typecheck
npm run build
npm run preview
```

The production files are written to `dist/`. `npm run build` prepares the OCR runtime before running TypeScript and Vite.

## Deploy to GitHub Pages

The repository is configured for the `PocketFile` repository path (`/PocketFile/`). Push the project to the `main` branch of a GitHub repository named `PocketFile`, then set the repository's Pages source to **GitHub Actions**. The workflow in `.github/workflows/deploy.yml` runs tests and builds the site before deploying `dist/`.

## Tools

- Compress images to a target size, with dimensions and quality controls
- Convert JPG, PNG, WebP, and supported HEIC/HEIF inputs
- Resize and convert multiple images, with individual downloads or a ZIP
- Crop an ID photo to common or custom sizes and embed the selected DPI in JPEG/PNG output
- Recognize Thai and English text locally with Tesseract.js
- Inspect supported EXIF fields, re-encode to remove metadata, and paint opaque redaction boxes into image pixels
- Merge PDFs, reorder/remove/select pages, place image signatures, and create A4 N-up print layouts

## Privacy and offline use

Files remain in the browser during processing. Only theme and recent tool IDs are saved in local storage. OCR language data is stored in browser IndexedDB after download. The Tesseract worker and WASM runtime ship with the app; Thai and English language data must be downloaded the first time OCR runs, so OCR is not available offline until that cache exists. The app shell and static runtime assets are cached by the PWA service worker after the app is first loaded online.

## Limits

- Browser canvas exports are capped at 40 megapixels and 12,000 pixels on either side to reduce memory failures.
- HEIC/HEIF support depends on the browser decoder or the bundled fallback; a specific image may still fail to decode.
- The ID-photo tool crops and sizes an image. It does not replace the background.
- Quick Sign embeds a visible signature image. It is not a certificate-backed digital signature.
- Password-protected or damaged PDFs may not open. PDF.js and pdf-lib support varies by PDF features and browser memory.
- Safari-specific behavior has not been verified in this Windows environment.
