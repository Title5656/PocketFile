import { describe, expect, it } from 'vitest';
import { PDFArray, PDFDocument, PDFRawStream, decodePDFRawStream, degrees } from 'pdf-lib';
import { addPdfSignatures, createPrintLayoutPdf, exportPdfPages, getPdfSignatureBounds, getPrintLayoutPagePlacement, getSheetLayout, mergePdfBytes, parsePageRanges } from './pdf';

async function makePdf(sizes: Array<[number, number]>): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  sizes.forEach(([width, height]) => document.addPage([width, height]));
  return document.save();
}

async function loadPdf(bytes: Uint8Array): Promise<PDFDocument> {
  return PDFDocument.load(bytes);
}

describe('parsePageRanges', () => {
  it('converts user-facing inclusive page ranges to zero-based indices', () => {
    expect(parsePageRanges('1–5, 8, 10-12', 12)).toEqual([0, 1, 2, 3, 4, 7, 9, 10, 11]);
  });

  it('removes duplicates but rejects empty, reversed, malformed, and out-of-bounds ranges', () => {
    expect(parsePageRanges('1, 1, 2-3', 3)).toEqual([0, 1, 2]);
    expect(parsePageRanges('3, 1-2, 3', 3)).toEqual([2, 0, 1]);
    expect(() => parsePageRanges('', 3)).toThrow();
    expect(() => parsePageRanges('4-2', 5)).toThrow();
    expect(() => parsePageRanges('1, 6', 5)).toThrow();
    expect(() => parsePageRanges('1, nope', 5)).toThrow();
  });
});

describe('getSheetLayout', () => {
  it('creates centered A4 slots for 1, 2, 4, and 6-up portrait and landscape layouts', () => {
    for (const pagesPerSheet of [1, 2, 4, 6] as const) {
      for (const orientation of ['portrait', 'landscape'] as const) {
        const layout = getSheetLayout(pagesPerSheet, orientation, 8);
        expect(layout.slots).toHaveLength(pagesPerSheet);
        expect(layout.width).toBeGreaterThan(0);
        expect(layout.height).toBeGreaterThan(0);
        for (const slot of layout.slots) {
          expect(slot.x).toBeGreaterThanOrEqual(0);
          expect(slot.y).toBeGreaterThanOrEqual(0);
          expect(slot.x + slot.width).toBeLessThanOrEqual(layout.width);
          expect(slot.y + slot.height).toBeLessThanOrEqual(layout.height);
        }
      }
    }
    expect(getSheetLayout(1, 'portrait', 8).height).toBeGreaterThan(getSheetLayout(1, 'portrait', 8).width);
    expect(getSheetLayout(1, 'landscape', 8).width).toBeGreaterThan(getSheetLayout(1, 'landscape', 8).height);
  });

  it('rejects margins that would leave no printable area', () => {
    expect(() => getSheetLayout(4, 'portrait', 200)).toThrow();
  });

  it('fits and rotates a landscape PDF page with a 90-degree page rotation', async () => {
    const slot = getSheetLayout(1, 'portrait', 0).slots[0];
    const placement = getPrintLayoutPagePlacement(slot, 300, 200, 90);

    expect(placement.rotation).toBe(-90);
    expect(placement.width).toBeCloseTo(841.8898);
    expect(placement.height).toBeCloseTo(561.2599);
    expect(placement.x + placement.height / 2).toBeCloseTo(slot.x + slot.width / 2);
    expect(placement.y - placement.width / 2).toBeCloseTo(slot.y + slot.height / 2);

    const source = await PDFDocument.create();
    const sourcePage = source.addPage([300, 200]);
    sourcePage.drawRectangle({ x: 10, y: 20, width: 30, height: 40 });
    sourcePage.setRotation(degrees(90));
    const laidOut = await loadPdf(await createPrintLayoutPdf(await source.save(), {
      pagesPerSheet: 1, orientation: 'portrait', marginMm: 0,
    }));
    const contents = laidOut.getPage(0).node.Contents();
    if (!(contents instanceof PDFArray)) throw new Error('Expected PDF content streams');
    const streamText = Array.from({ length: contents.size() }, (_, index) => {
      const stream = contents.lookup(index, PDFRawStream);
      return new TextDecoder().decode(decodePDFRawStream(stream).decode());
    }).join('\n');
    const rotationMatrix = streamText.split('\n').map((line) => line.trim().split(/\s+/)).find((parts) =>
      parts.length === 7 && parts[1] === '-1' && parts[2] === '1' && parts[5] === '0' && parts[6] === 'cm',
    );
    expect(rotationMatrix).toBeDefined();
    expect(Number(rotationMatrix?.[0])).toBeCloseTo(0);
    expect(Number(rotationMatrix?.[3])).toBeCloseTo(0);
  });
});

describe('PDF file operations', () => {
  it('merges real PDF inputs and reports per-file progress', async () => {
    const inputA = await makePdf([[100, 200], [100, 200]]);
    const inputB = await makePdf([[200, 100]]);
    const progress: number[] = [];
    const output = await loadPdf(await mergePdfBytes([inputA, inputB], (value) => progress.push(value)));

    expect(output.getPageCount()).toBe(3);
    expect(output.getPage(2).getSize()).toEqual({ width: 200, height: 100 });
    expect(progress).toEqual([50, 100]);
  });

  it('exports PDF pages in the requested order and rejects invalid selections', async () => {
    const input = await makePdf([[100, 200], [200, 100], [300, 300]]);
    const output = await loadPdf(await exportPdfPages(input, [2, 0]));

    expect(output.getPageCount()).toBe(2);
    expect(output.getPage(0).getSize()).toEqual({ width: 300, height: 300 });
    expect(output.getPage(1).getSize()).toEqual({ width: 100, height: 200 });
    await expect(exportPdfPages(input, [3])).rejects.toThrow('outside the PDF');
    await expect(exportPdfPages(input, [])).rejects.toThrow('at least one');
  });

  it('creates real A4 N-up PDFs and reaches full progress', async () => {
    const input = await makePdf([[200, 300], [200, 300], [300, 200], [300, 200], [100, 100]]);
    const progress: number[] = [];
    const output = await loadPdf(await createPrintLayoutPdf(input, { pagesPerSheet: 4, orientation: 'landscape', marginMm: 8 }, (value) => progress.push(value)));

    expect(output.getPageCount()).toBe(2);
    expect(output.getPage(0).getSize().width).toBeGreaterThan(output.getPage(0).getSize().height);
    expect(output.getPage(1).getSize()).toEqual(output.getPage(0).getSize());
    expect(progress.at(-1)).toBe(100);
  });

  it('maps a rotated page viewport back to PDF coordinates for a visible signature box', () => {
    const viewport = {
      width: 200,
      height: 300,
      rotation: 90,
      convertToPdfPoint: (x: number, y: number): [number, number] => [y, 200 - x],
    };

    expect(getPdfSignatureBounds(viewport, { x: 0.1, y: 0.2, width: 0.4 }, 0.5)).toEqual({
      x: 40, y: 120, width: 80, height: 40, rotation: 90,
    });
  });

  it('embeds a signature image into a new PDF that can be reopened', async () => {
    const input = await makePdf([[100, 200]]);
    const signature = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/NcAAAAAASUVORK5CYII=';
    const output = await addPdfSignatures(input, [{ pageIndex: 0, x: 0.1, y: 0.2, width: 0.3, dataUrl: signature, imageWidth: 600, imageHeight: 180 }], new Map([[0, {
      width: 100, height: 200, rotation: 0, convertToPdfPoint: (x: number, y: number): [number, number] => [x, 200 - y],
    }]]));
    const reopened = await loadPdf(output);

    expect(output.length).toBeGreaterThan(input.length);
    expect(reopened.getPageCount()).toBe(1);
    expect(reopened.getPage(0).getSize()).toEqual({ width: 100, height: 200 });
  });

  it('keeps signature placement tied to a rotated PDF viewport', async () => {
    const source = await PDFDocument.create();
    const page = source.addPage([300, 200]);
    page.setRotation(degrees(90));
    const input = await source.save();
    const signature = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/NcAAAAAASUVORK5CYII=';
    const viewport = {
      width: 200, height: 300, rotation: 90,
      convertToPdfPoint: (x: number, y: number): [number, number] => [y, 200 - x],
    };

    const output = await addPdfSignatures(input, [{ pageIndex: 0, x: 0.1, y: 0.2, width: 0.4, dataUrl: signature, imageWidth: 600, imageHeight: 180 }], new Map([[0, viewport]]));
    const reopened = await loadPdf(output);

    expect(reopened.getPage(0).getRotation().angle).toBe(90);
    expect(reopened.getPage(0).getSize()).toEqual({ width: 300, height: 200 });
    expect(output.length).toBeGreaterThan(input.length);
  });
});
