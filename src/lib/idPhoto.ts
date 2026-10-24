import type { CropTransform, ImageExportOptions, PhotoSize } from '../types';
import { decodeImage } from './images';
import { setImageDpi } from './imageDpi';

const MAX_OUTPUT_SIDE = 12_000;
const MAX_OUTPUT_PIXELS = 40_000_000;

export function getPhotoPixelSize(widthInches: number, heightInches: number, dpi: number): { width: number; height: number } {
  if (![widthInches, heightInches, dpi].every((value) => Number.isFinite(value) && value > 0)) {
    throw new Error('Photo size and DPI must be positive');
  }
  const width = Math.round(widthInches * dpi);
  const height = Math.round(heightInches * dpi);
  if (width > MAX_OUTPUT_SIDE || height > MAX_OUTPUT_SIDE || width * height > MAX_OUTPUT_PIXELS) {
    throw new Error('Output dimensions are too large for a browser photo export');
  }
  return { width, height };
}

export function getCropDrawRect(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
  crop: CropTransform,
): { x: number; y: number; width: number; height: number } {
  if (![sourceWidth, sourceHeight, targetWidth, targetHeight].every((value) => Number.isFinite(value) && value > 0)) {
    throw new Error('Image dimensions must be positive');
  }
  const x = Math.max(-1, Math.min(1, Number.isFinite(crop.x) ? crop.x : 0));
  const y = Math.max(-1, Math.min(1, Number.isFinite(crop.y) ? crop.y : 0));
  const zoom = Math.max(1, Math.min(5, Number.isFinite(crop.zoom) ? crop.zoom : 1));
  const scale = Math.max(targetWidth / sourceWidth, targetHeight / sourceHeight) * zoom;
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  return {
    x: width > targetWidth ? -(width - targetWidth) * ((x + 1) / 2) : 0,
    y: height > targetHeight ? -(height - targetHeight) * ((y + 1) / 2) : 0,
    width,
    height,
  };
}

function encodeCanvas(canvas: HTMLCanvasElement, format: ImageExportOptions['format'], quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob || blob.size === 0) {
        reject(new Error('The browser could not export this photo'));
      } else if (blob.type !== format) {
        reject(new Error(`${format.replace('image/', '').toUpperCase()} export is not supported by this browser`));
      } else {
        resolve(blob);
      }
    }, format, quality);
  });
}

export async function renderIdPhoto(
  file: File,
  crop: CropTransform,
  size: PhotoSize,
  dpi: number,
  format: 'image/jpeg' | 'image/png',
  backgroundColor = '#ffffff',
): Promise<Blob> {
  const outputSize = getPhotoPixelSize(size.widthInches, size.heightInches, dpi);
  const decoded = await decodeImage(file);
  const canvas = document.createElement('canvas');
  canvas.width = outputSize.width;
  canvas.height = outputSize.height;
  try {
    const context = canvas.getContext('2d', { alpha: format === 'image/png' });
    if (!context) throw new Error('Canvas image processing is not available in this browser');
    if (format === 'image/jpeg') {
      context.fillStyle = backgroundColor;
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    const draw = getCropDrawRect(decoded.width, decoded.height, canvas.width, canvas.height, crop);
    context.drawImage(decoded.image, draw.x, draw.y, draw.width, draw.height);
    return await setImageDpi(await encodeCanvas(canvas, format, 0.94), dpi);
  } finally {
    decoded.release();
    canvas.width = 0;
    canvas.height = 0;
  }
}
