import type { Rect } from '../types';
import { decodeImage } from './images';

function finite(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

export function clampRedactionRect(rect: Rect): Rect {
  const rawX = finite(rect.x);
  const rawY = finite(rect.y);
  const rawRight = rawX + finite(rect.width);
  const rawBottom = rawY + finite(rect.height);
  const x = Math.max(0, Math.min(1, Math.min(rawX, rawRight)));
  const y = Math.max(0, Math.min(1, Math.min(rawY, rawBottom)));
  const right = Math.max(0, Math.min(1, Math.max(rawX, rawRight)));
  const bottom = Math.max(0, Math.min(1, Math.max(rawY, rawBottom)));
  const round = (value: number) => Math.round(value * 1e12) / 1e12;
  return { x: round(x), y: round(y), width: round(right - x), height: round(bottom - y) };
}

export function getRedactionCanvasRect(rect: Rect, imageWidth: number, imageHeight: number): Rect {
  if (!Number.isFinite(imageWidth) || !Number.isFinite(imageHeight) || imageWidth < 1 || imageHeight < 1) {
    throw new Error('Image dimensions must be positive');
  }
  const normalized = clampRedactionRect(rect);
  const x = Math.floor(normalized.x * imageWidth);
  const y = Math.floor(normalized.y * imageHeight);
  const right = Math.ceil((normalized.x + normalized.width) * imageWidth);
  const bottom = Math.ceil((normalized.y + normalized.height) * imageHeight);
  return { x, y, width: Math.max(0, right - x), height: Math.max(0, bottom - y) };
}

export async function redactImage(file: File, rectangles: Rect[]): Promise<Blob> {
  const decoded = await decodeImage(file);
  let canvas: HTMLCanvasElement | undefined;
  try {
    if (decoded.width > 12_000 || decoded.height > 12_000 || decoded.width * decoded.height > 40_000_000) {
      throw new Error('ภาพมีขนาดใหญ่เกินไปสำหรับการประมวลผลอย่างปลอดภัย โปรดลดขนาดภาพก่อน');
    }
    canvas = document.createElement('canvas');
    canvas.width = decoded.width;
    canvas.height = decoded.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas image processing is not available in this browser');
    const format = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
    if (format === 'image/jpeg') {
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, decoded.width, decoded.height);
    }
    context.drawImage(decoded.image, 0, 0, decoded.width, decoded.height);
    context.fillStyle = '#000000';
    rectangles.forEach((rect) => {
      const pixelRect = getRedactionCanvasRect(rect, decoded.width, decoded.height);
      if (pixelRect.width && pixelRect.height) context.fillRect(pixelRect.x, pixelRect.y, pixelRect.width, pixelRect.height);
    });
    return await new Promise<Blob>((resolve, reject) => canvas?.toBlob((blob) => {
      if (!blob || blob.size === 0) reject(new Error('The browser could not export this image'));
      else if (blob.type !== format) reject(new Error(`The browser could not export ${format}`));
      else resolve(blob);
    }, format, 0.94));
  } finally {
    decoded.release();
    if (canvas) { canvas.width = 0; canvas.height = 0; }
  }
}

