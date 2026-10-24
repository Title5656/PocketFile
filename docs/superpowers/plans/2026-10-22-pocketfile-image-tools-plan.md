# PocketFile Image Tools Implementation Plan

> **For agentic workers:** This is being executed natively in the current session as the user explicitly requested implementation. Follow the TDD skill for behavior code; configuration and static assets may be created directly.

**Goal:** Implement all six local image tools with real previews and downloadable outputs.

**Architecture:** `src/lib/images.ts` owns browser image decode, format conversion, resize, quality targeting, and export. Tool components own their settings and state. OCR and HEIC are loaded on demand; metadata inspection uses exifr and re-encoding removes metadata.

**Tech Stack:** Canvas API, browser image decoding, JSZip, Tesseract.js, heic2any, exifr, React, TypeScript, and Vitest.

**Spec:** `docs/superpowers/specs/2026-10-22-pocketfile-design.md`

## Execution status

All six image tools are implemented. Unit tests, typecheck, and production build pass. Generated image export paths are exercised with browser API test doubles; live browser, OCR model download, and clipboard/download flows remain unverified in this environment.

## Global Constraints

- No user file leaves the browser; keep only UI preferences in local storage.
- Preserve source files; export new outputs. Release workers and object URLs on reset and unmount.
- Support JPG, PNG, and WebP for common image tools; HEIC/HEIF conversion is best-effort and reports decoder limitations.
- Show original/result sizes and real output previews; report when a size target cannot be reached.
- OCR uses Thai and English Tesseract models in a browser worker; explain the first-use model download and browser caching.
- Do not provide ID-photo background replacement without actual local foreground segmentation.

## Review Focus

- Transparent PNG converted to JPG needs an explicit matte color; test that the exported canvas background uses it.
- Non-square resize must preserve the aspect ratio when requested; test the output dimension calculator.
- Image target size cannot always be met; test that the UI reports this instead of claiming success.
- HEIC decode support varies; test the error path with unsupported input and report successful fallback only when a real output is produced.
- Privacy export must strip inspected EXIF and redaction must paint actual opaque pixels; verify the resulting Blob, not just the preview.

---

### Task 1: Image operation helpers

**Files:**
- Create: `src/lib/images.ts`, `src/lib/images.test.ts`, `src/lib/download.ts`, `src/lib/format.ts`
- Modify: `package.json`

**Interfaces:**
- `fitDimensions(sourceWidth: number, sourceHeight: number, width: number, height: number, preserveAspect: boolean): { width: number; height: number }`
- `compressionReduction(before: number, after: number): number`
- `decodeImage(file: File): Promise<{ image: CanvasImageSource; width: number; height: number; release(): void }>`
- `exportImage(file: File, options: ImageExportOptions): Promise<Blob>`
- `compressTowardTarget(file: File, options: CompressionOptions, onProgress: (progress: number) => void, signal?: AbortSignal): Promise<CompressionResult>`

- [x] Write failing tests for aspect-ratio sizing, reduction percentages, invalid dimensions, and target-not-reached reporting.
- [x] Run those tests and confirm they fail because the helpers do not exist yet.
- [x] Implement canvas decode/encode, HEIC fallback, JPG background matte, bounded quality/scale target search, progress, cancellation, and explicit target status.
- [x] Run unit tests and exercise generated image outputs with browser API test doubles.
- [ ] Verify generated image outputs in a real browser.

### Task 2: Compressor, converter, and batch tool

**Files:**
- Create: `src/tools/ImageCompressor.tsx`, `src/tools/ImageConverter.tsx`, `src/tools/BatchImageTool.tsx`
- Modify: `src/App.tsx`, `src/data/tools.ts`, `src/styles.css`
- Test: `src/tools/image-tools.test.tsx`

**Interfaces:**
- Each tool exports a default React component and uses the shared `ToolWorkspace` contract.
- Batch processing tracks each file as `queued | processing | done | error | cancelled`; ZIP output is generated from successful files only.

- [ ] Add full UI tests for invalid-file feedback, per-file batch status, remove/cancel, and ZIP availability after success.
- [ ] Verify failing UI tests before implementation.
- [x] Implement the 100 KB / 200 KB / 500 KB / 1 MB / custom target presets, quality slider, width/height, conversion format/matte options, multi-file processing, individual downloads, and ZIP download.
- [x] Run all tests.
- [ ] Verify actual downloaded MIME types and names in a real browser.

### Task 3: ID photo maker

**Files:**
- Create: `src/tools/IdPhotoMaker.tsx`, `src/lib/idPhoto.ts`, `src/lib/idPhoto.test.ts`
- Modify: `src/App.tsx`, `src/data/tools.ts`, `src/styles.css`

**Interfaces:**
- `getPhotoPixelSize(widthInches: number, heightInches: number, dpi: number): { width: number; height: number }`
- `renderIdPhoto(file: File, crop: CropTransform, size: PhotoSize, dpi: number, format: 'image/jpeg' | 'image/png'): Promise<Blob>`

- [x] Write failing tests for inch-to-pixel output dimensions at 300 DPI and for custom sizes.
- [x] Verify tests fail before implementation.
- [x] Implement presets for 1, 1.5, and 2 inch photos, custom physical dimensions, crop position, zoom, DPI, and JPG/PNG export.
- [ ] Verify the preview and saved file use the same crop in a real browser.
- [x] Verify exported files embed the selected DPI and pixel dimensions.

### Task 4: OCR and privacy cleaner

**Files:**
- Create: `src/tools/ImageToText.tsx`, `src/tools/PrivacyCleaner.tsx`, `src/lib/ocr.ts`, `src/lib/privacy.ts`, `src/lib/privacy.test.ts`
- Modify: `src/App.tsx`, `src/data/tools.ts`, `src/styles.css`

**Interfaces:**
- `recognizeImageText(file: File, onProgress: (progress: number, status: string) => void, signal?: AbortSignal): Promise<string>`
- `inspectImageMetadata(file: File): Promise<MetadataItem[]>`
- `cleanImage(file: File, redactions: RedactionRect[]): Promise<Blob>`
- `verifyMetadataRemoved(file: Blob): Promise<boolean>`

- [x] Write failing tests for new clean output, bounded redaction rectangles, metadata inspection, and pixel-level redaction.
- [x] Verify the privacy-helper tests fail before implementation.
- [x] Implement lazy Tesseract worker loading, Thai + English selection, progress/cancel, editable output, copy and TXT download; terminate workers on cancellation/unmount.
- [x] Implement EXIF/GPS/camera/date display, redaction controls, pixel-level black redaction, canvas re-encode, and post-export metadata status.
- [x] Run all tests.
- [ ] Verify OCR model download status, clipboard, and download flows in a real browser.

