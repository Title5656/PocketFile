# PocketFile PDF Tools Implementation Plan

> **For agentic workers:** This is being executed natively in the current session as the user explicitly requested implementation. Follow the TDD skill for behavior code; configuration and static assets may be created directly.

**Goal:** Implement local PDF merging, page management, visual signatures, and A4 multi-page print layout.

**Architecture:** PDF.js lazily renders thumbnails and previews; pdf-lib handles binary page operations and exports. A single PDF module owns page selection, ordering, merge, signature embedding, and n-up layout calculations.

**Tech Stack:** PDF.js (`pdfjs-dist`), `pdf-lib`, React, TypeScript, and Vitest.

**Spec:** `docs/superpowers/specs/2026-10-22-pocketfile-design.md`

## Execution status

PDF merge, page management, Quick Sign, and A4 print layout are implemented. Generated-PDF tests, typecheck, and production build pass. The rotated-page print layout regression is covered through the actual generated content stream. Live PDF.js browser preview remains unverified in this environment.

## Global Constraints

- PDF bytes stay in the browser; all edits export a new PDF and preserve the original.
- Support ordering by up/down buttons as well as touch interaction; never require hover or mouse-only drag.
- Reject malformed or encrypted files with a useful message; do not pretend processing succeeded.
- Display page counts and actual PDF.js thumbnails; use progress for large documents.
- Quick Sign embeds a visible drawing and must clearly state that it is not a certificate-backed digital signature.

## Review Focus

- Empty or malformed PDFs must show an error; test load and save behavior with generated documents and invalid bytes.
- Page selection syntax accepts comma-separated values and ranges such as `1–5, 8, 10-12`, validates bounds, and maps to zero-based indices; test all cases.
- Mixed page sizes must remain visible in page manager exports; test page count and page boxes.
- A4 portrait/landscape and 1/2/4/6-up settings must fit pages inside the requested margins without clipping; test layout geometry.
- Signature coordinates are measured in preview CSS pixels but stored in PDF point coordinates; test the conversion at different scale factors.

---

### Task 1: Shared PDF operations and page-range parsing

**Files:**
- Create: `src/lib/pdf.ts`, `src/lib/pdf.test.ts`, `src/lib/pdfPreview.ts`
- Modify: `package.json`, `src/types.ts`

**Interfaces:**
- `parsePageRanges(input: string, pageCount: number): number[]` returns unique zero-based page indices in the input order.
- `mergePdfs(inputs: Uint8Array[], onProgress?: (progress: number) => void): Promise<Uint8Array>`
- `exportPdfPages(input: Uint8Array, indices: number[]): Promise<Uint8Array>`
- `createPrintLayout(input: Uint8Array, options: PrintLayoutOptions): Promise<Uint8Array>`

- [x] Write failing tests for page-range syntax, bounds errors, merging two PDFs, and exporting selected pages in requested order.
- [x] Run tests and confirm they fail on the missing parser and operations.
- [x] Implement validated parsing and pdf-lib copy/embed operations; implement PDF.js rendering with a lazily loaded worker.
- [x] Run tests against real generated PDFs and mixed page dimensions.
- [ ] Add explicit malformed-PDF regression coverage.

### Task 2: Merge and page manager

**Files:**
- Create: `src/tools/MergePdf.tsx`, `src/tools/PdfPageManager.tsx`, `src/components/PdfPageGrid.tsx`
- Modify: `src/App.tsx`, `src/data/tools.ts`, `src/styles.css`
- Test: `src/tools/pdf-tools.test.tsx`

**Interfaces:**
- `PdfPageGrid` accepts `{ pageNumber, thumbnailUrl, selected, onToggle, onMoveUp, onMoveDown }` per page.
- Page manager stores the ordered zero-based selected page list; exports call `exportPdfPages`.

- [ ] Add dedicated UI tests for file counts, thumbnail counts, reordering, selection, and export availability.
- [ ] Verify the expected UI tests fail before implementation.
- [x] Implement merge and page-management flows with reorder controls, page counts/thumbnails, range parser, select/remove/reorder, and PDF downloads.
- [x] Run generated-PDF tests and reopen outputs to check their page order/count.

### Task 3: Quick Sign

**Files:**
- Create: `src/tools/QuickSign.tsx`, `src/lib/signature.ts`, `src/lib/signature.test.ts`
- Modify: `src/App.tsx`, `src/data/tools.ts`, `src/styles.css`

**Interfaces:**
- `SignaturePlacement` stores `{ pageIndex: number; x: number; y: number; width: number; height: number; pageWidth: number; pageHeight: number }` in PDF points.
- `embedSignatures(input: Uint8Array, pngDataUrl: string, placements: SignaturePlacement[]): Promise<Uint8Array>`

- [x] Write failing tests for mapping signature placements from preview coordinates and embedding them into a PDF.
- [x] Verify the tests fail before implementation.
- [x] Implement pointer/touch signature drawing, page preview, placement controls, multiple placements, cancel/reset, and PDF export.
- [x] Run generated-PDF tests and verify the non-digital-signature note is present.
- [ ] Visually inspect the exported PDF.js render in a browser.

### Task 4: Print layout

**Files:**
- Create: `src/tools/PrintLayout.tsx`, `src/lib/printLayout.ts`, `src/lib/printLayout.test.ts`
- Modify: `src/App.tsx`, `src/data/tools.ts`, `src/styles.css`

**Interfaces:**
- `getNUpSlots(pageWidth: number, pageHeight: number, count: 1 | 2 | 4 | 6, margin: number): Rect[]`
- `createPrintLayout(input: Uint8Array, options: PrintLayoutOptions): Promise<Uint8Array>` creates A4 pages with embedded source pages.

- [x] Write failing tests for slot count, bounds, margin compliance, A4 orientation, rotation, and output page counts.
- [x] Verify the geometry tests fail before implementation.
- [x] Implement A4 portrait/landscape, 1/2/4/6 pages per sheet, margin settings, and new PDF output.
- [x] Run the full test suite and verify generated PDF page sizes and embedded page counts.

