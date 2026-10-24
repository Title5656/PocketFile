import type { PrintLayoutOptions, Rect } from '../types';
import { PDFDocument, degrees } from 'pdf-lib';

const POINTS_PER_MM = 72 / 25.4;
const A4_WIDTH = 595.2756;
const A4_HEIGHT = 841.8898;
const SLOT_GAP = 8;

export function parsePageRanges(input: string, pageCount: number): number[] {
  if (!Number.isInteger(pageCount) || pageCount < 1) throw new Error('PDF has no pages');
  const value = input.trim();
  if (!value) throw new Error('Enter at least one page number or range');
  const selected = new Set<number>();
  for (const rawPart of value.split(',')) {
    const part = rawPart.trim().replace(/[–—]/g, '-');
    const match = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(part);
    if (!match) throw new Error(`Invalid page range: ${rawPart.trim()}`);
    const first = Number(match[1]);
    const last = match[2] ? Number(match[2]) : first;
    if (first < 1 || last < first || last > pageCount) throw new Error(`Pages must be between 1 and ${pageCount}`);
    for (let page = first; page <= last; page += 1) selected.add(page - 1);
  }
  return [...selected];
}

export interface SheetLayout {
  width: number;
  height: number;
  pagesPerSheet: PrintLayoutOptions['pagesPerSheet'];
  orientation: PrintLayoutOptions['orientation'];
  columns: number;
  rows: number;
  slots: Rect[];
}

export function getSheetLayout(
  pagesPerSheet: PrintLayoutOptions['pagesPerSheet'],
  orientation: PrintLayoutOptions['orientation'],
  marginMm: number,
): SheetLayout {
  if (![1, 2, 4, 6].includes(pagesPerSheet)) throw new Error('Choose 1, 2, 4, or 6 pages per sheet');
  if (!Number.isFinite(marginMm) || marginMm < 0 || marginMm > 40) throw new Error('Margins must be between 0 and 40 mm');
  const portrait = orientation === 'portrait';
  const width = portrait ? A4_WIDTH : A4_HEIGHT;
  const height = portrait ? A4_HEIGHT : A4_WIDTH;
  const margin = marginMm * POINTS_PER_MM;
  const availableWidth = width - margin * 2;
  const availableHeight = height - margin * 2;
  if (availableWidth <= 0 || availableHeight <= 0) throw new Error('Margins leave no printable page area');

  let columns = 1;
  let rows = 1;
  if (pagesPerSheet === 2) {
    columns = portrait ? 1 : 2;
    rows = portrait ? 2 : 1;
  } else if (pagesPerSheet === 4) {
    columns = rows = 2;
  } else if (pagesPerSheet === 6) {
    columns = portrait ? 2 : 3;
    rows = portrait ? 3 : 2;
  }
  const cellWidth = (availableWidth - SLOT_GAP * (columns - 1)) / columns;
  const cellHeight = (availableHeight - SLOT_GAP * (rows - 1)) / rows;
  const slots = Array.from({ length: pagesPerSheet }, (_, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    return {
      x: margin + column * (cellWidth + SLOT_GAP),
      // PDF coordinates start at the lower-left corner.
      y: height - margin - (row + 1) * cellHeight - row * SLOT_GAP,
      width: cellWidth,
      height: cellHeight,
    };
  });
  return { width, height, pagesPerSheet, orientation, columns, rows, slots };
}

export function getPrintLayoutPagePlacement(slot: Rect, width: number, height: number, pageRotation: number) {
  const rotation = ((pageRotation % 360) + 360) % 360;
  if (![slot.x, slot.y, slot.width, slot.height, width, height, pageRotation].every(Number.isFinite)
    || slot.width <= 0 || slot.height <= 0 || width <= 0 || height <= 0 || rotation % 90 !== 0) {
    throw new Error('PDF page placement dimensions or rotation are invalid');
  }

  const rotated = rotation === 90 || rotation === 270;
  const scale = Math.min(slot.width / (rotated ? height : width), slot.height / (rotated ? width : height));
  const drawWidth = width * scale;
  const drawHeight = height * scale;
  const centerX = slot.x + slot.width / 2;
  const centerY = slot.y + slot.height / 2;
  let x = centerX - drawWidth / 2;
  let y = centerY - drawHeight / 2;

  if (rotation === 90) {
    x = centerX - drawHeight / 2;
    y = centerY + drawWidth / 2;
  } else if (rotation === 180) {
    x = centerX + drawWidth / 2;
    y = centerY + drawHeight / 2;
  } else if (rotation === 270) {
    x = centerX + drawHeight / 2;
    y = centerY - drawWidth / 2;
  }

  return { x, y, width: drawWidth, height: drawHeight, rotation: -rotation };
}

type CancelCheck = () => boolean;
type PdfProgress = (progress: number) => void;

function throwIfCancelled(isCancelled?: CancelCheck): void {
  if (!isCancelled?.()) return;
  const error = new Error('PDF processing was cancelled');
  error.name = 'AbortError';
  throw error;
}

export async function mergePdfBytes(inputs: Uint8Array[], onProgress?: PdfProgress, isCancelled?: CancelCheck): Promise<Uint8Array> {
  if (inputs.length < 2) throw new Error('Select at least two PDF files to merge');
  const output = await PDFDocument.create();
  for (const [index, input] of inputs.entries()) {
    throwIfCancelled(isCancelled);
    const source = await PDFDocument.load(input);
    const pages = await output.copyPages(source, source.getPageIndices());
    pages.forEach((page) => output.addPage(page));
    onProgress?.(Math.round(((index + 1) / inputs.length) * 100));
  }
  throwIfCancelled(isCancelled);
  return output.save();
}

export async function exportPdfPages(input: Uint8Array, indices: number[], isCancelled?: CancelCheck): Promise<Uint8Array> {
  if (indices.length === 0) throw new Error('Select at least one PDF page');
  const source = await PDFDocument.load(input);
  if (indices.some((index) => !Number.isInteger(index) || index < 0 || index >= source.getPageCount())) {
    throw new Error('A selected page is outside the PDF');
  }
  if (new Set(indices).size !== indices.length) throw new Error('A PDF page can only be selected once');
  throwIfCancelled(isCancelled);
  const output = await PDFDocument.create();
  const pages = await output.copyPages(source, indices);
  pages.forEach((page) => output.addPage(page));
  throwIfCancelled(isCancelled);
  return output.save();
}

export async function createPrintLayoutPdf(
  input: Uint8Array,
  options: PrintLayoutOptions,
  onProgress?: PdfProgress,
  isCancelled?: CancelCheck,
): Promise<Uint8Array> {
  const layout = getSheetLayout(options.pagesPerSheet, options.orientation, options.marginMm);
  const source = await PDFDocument.load(input);
  let embedInput = input;
  let addedBlankPageContents = false;
  for (const page of source.getPages()) {
    if (page.node.Contents()) continue;
    page.drawRectangle({ x: 0, y: 0, width: 0.01, height: 0.01, opacity: 0, borderWidth: 0 });
    addedBlankPageContents = true;
  }
  if (addedBlankPageContents) embedInput = await source.save();
  const output = await PDFDocument.create();
  const embedSource = embedInput === input ? source : await PDFDocument.load(embedInput);
  const pages = embedSource.getPages();
  if (pages.length === 0) throw new Error('PDF has no pages');
  let sheet: ReturnType<PDFDocument['addPage']> | undefined;
  let slotIndex = 0;
  for (let index = 0; index < pages.length; index += 1) {
    throwIfCancelled(isCancelled);
    if (!sheet || (index > 0 && slotIndex === 0)) sheet = output.addPage([layout.width, layout.height]);
    const page = await output.embedPage(pages[index]);
    const slot = layout.slots[slotIndex];
    const placement = getPrintLayoutPagePlacement(slot, page.width, page.height, pages[index].getRotation().angle);
    sheet.drawPage(page, { ...placement, rotate: degrees(placement.rotation) });
    slotIndex = (slotIndex + 1) % options.pagesPerSheet;
    onProgress?.(Math.round(((index + 1) / pages.length) * 100));
    if ((index + 1) % 4 === 0) await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
  }
  throwIfCancelled(isCancelled);
  return output.save();
}

export interface PdfViewportGeometry {
  width: number;
  height: number;
  rotation: number;
  convertToPdfPoint: (x: number, y: number) => number[];
}

export interface PdfSignatureBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

export function getPdfSignatureBounds(
  viewport: PdfViewportGeometry,
  placement: { x: number; y: number; width: number },
  imageAspectRatio: number,
): PdfSignatureBounds {
  if (![viewport.width, viewport.height, placement.x, placement.y, placement.width, imageAspectRatio].every(Number.isFinite)
    || viewport.width <= 0 || viewport.height <= 0 || placement.width <= 0 || imageAspectRatio <= 0) {
    throw new Error('Signature placement dimensions must be positive');
  }
  const screenWidth = Math.min(1, placement.width) * viewport.width;
  const screenHeight = screenWidth * imageAspectRatio;
  const left = Math.max(0, Math.min(viewport.width - screenWidth, placement.x * viewport.width));
  const top = Math.max(0, Math.min(viewport.height - screenHeight, placement.y * viewport.height));
  const points = [
    viewport.convertToPdfPoint(left, top),
    viewport.convertToPdfPoint(left + screenWidth, top),
    viewport.convertToPdfPoint(left, top + screenHeight),
    viewport.convertToPdfPoint(left + screenWidth, top + screenHeight),
  ];
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const minX = Math.min(...xs); const maxX = Math.max(...xs);
  const minY = Math.min(...ys); const maxY = Math.max(...ys);
  const rotation = ((viewport.rotation % 360) + 360) % 360;
  return {
    x: (minX + maxX - screenWidth) / 2,
    y: (minY + maxY - screenHeight) / 2,
    width: screenWidth,
    height: screenHeight,
    rotation,
  };
}

export interface PdfSignatureMark {
  pageIndex: number;
  x: number;
  y: number;
  width: number;
  dataUrl: string;
  imageWidth: number;
  imageHeight: number;
}

function dataUrlBytes(dataUrl: string): Uint8Array {
  const encoded = dataUrl.split(',')[1];
  if (!encoded) throw new Error('Signature image data is invalid');
  const binary = atob(encoded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export async function addPdfSignatures(
  input: Uint8Array,
  placements: PdfSignatureMark[],
  viewports: ReadonlyMap<number, PdfViewportGeometry>,
  isCancelled?: CancelCheck,
): Promise<Uint8Array> {
  const output = await PDFDocument.load(input);
  for (const placement of placements) {
    throwIfCancelled(isCancelled);
    const viewport = viewports.get(placement.pageIndex);
    const page = output.getPage(placement.pageIndex);
    if (!viewport || !page) throw new Error(`Missing preview geometry for PDF page ${placement.pageIndex + 1}`);
    const image = await output.embedPng(dataUrlBytes(placement.dataUrl));
    const bounds = getPdfSignatureBounds(viewport, placement, placement.imageHeight / placement.imageWidth);
    page.drawImage(image, {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      rotate: degrees(bounds.rotation),
    });
  }
  return output.save();
}

