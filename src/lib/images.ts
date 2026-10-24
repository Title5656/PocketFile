import type {
  CompressionOptions,
  CompressionResult,
  ImageExportOptions,
} from '../types';
import { IMAGE_BYTES, checkCancelled, validateDimensions } from './validation';

export interface DecodedImage {
  image: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
}

export interface CompressionCandidate {
  quality: number;
  blob: Blob;
}

function positiveDimension(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function roundedDimension(value: number): number {
  return Math.max(1, Math.round(value));
}

function assertCanvasDimensions(width: number, height: number): void {
  if (width > 12_000 || height > 12_000 || width * height > 40_000_000) {
    throw new Error('Output image is too large for safe browser processing. Reduce the requested dimensions.');
  }
}

export function fitDimensions(
  sourceWidth: number,
  sourceHeight: number,
  width: number,
  height: number,
  preserveAspect: boolean,
): { width: number; height: number } {
  if (![sourceWidth, sourceHeight, width, height].every(positiveDimension)) {
    throw new Error('Image dimensions must be positive');
  }
  if (!preserveAspect) {
    const output = { width: roundedDimension(width), height: roundedDimension(height) };
    assertCanvasDimensions(output.width, output.height);
    return output;
  }

  const scale = Math.min(1, width / sourceWidth, height / sourceHeight);
  const output = {
    width: roundedDimension(sourceWidth * scale),
    height: roundedDimension(sourceHeight * scale),
  };
  assertCanvasDimensions(output.width, output.height);
  return output;
}

export function compressionReduction(before: number, after: number): number {
  if (!Number.isFinite(before) || !Number.isFinite(after) || before <= 0) return 0;
  return Math.round(((before - after) / before) * 1000) / 10;
}

export function pickCompressionCandidate(
  candidates: CompressionCandidate[],
  targetBytes: number,
): CompressionCandidate & { reachedTarget: boolean } {
  if (candidates.length === 0) throw new Error('No image export candidates were created');
  if (!positiveDimension(targetBytes)) throw new Error('Target size must be positive');

  const underTarget = candidates.filter((candidate) => candidate.blob.size <= targetBytes);
  const selected = underTarget.length > 0
    ? underTarget.sort((left, right) => right.quality - left.quality || left.blob.size - right.blob.size)[0]
    : candidates.sort((left, right) => left.blob.size - right.blob.size || right.quality - left.quality)[0];
  return { ...selected, reachedTarget: underTarget.length > 0 };
}

function isHeic(file: File): boolean {
  return /\.hei[cf]$/i.test(file.name) || /image\/(heic|heif)/i.test(file.type);
}

async function bitmapFromBlob(blob: Blob): Promise<DecodedImage> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(blob);
      return { image: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
    } catch {
      // Some browsers can decode a format in an <img> element even when createImageBitmap rejects it.
    }
  }

  const objectUrl = URL.createObjectURL(blob);
  try {
    const image = new Image();
    const ready = new Promise<HTMLImageElement>((resolve, reject) => {
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('The browser could not decode this image'));
    });
    image.src = objectUrl;
    const loaded = await ready;
    return {
      image: loaded,
      width: loaded.naturalWidth,
      height: loaded.naturalHeight,
      release: () => URL.revokeObjectURL(objectUrl),
    };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

async function convertHeic(file: File): Promise<Blob> {
  const module = await import('heic2any');
  const converted = await module.default({ blob: file, toType: 'image/jpeg', quality: 0.94 });
  const output = Array.isArray(converted) ? converted[0] : converted;
  if (!(output instanceof Blob) || output.size === 0) throw new Error('HEIC conversion returned no image');
  return output;
}

export async function decodeImage(file: File): Promise<DecodedImage> {
  if (!file || file.size === 0) throw new Error('The selected image is empty');
  if(file.size>IMAGE_BYTES)throw new Error('รูปภาพต้องไม่เกิน 25 MB');
  const heicInput = isHeic(file);
  if (file.type && !file.type.startsWith('image/') && !heicInput) throw new Error('Choose a supported image file');

  let decoded: DecodedImage;
  try {
    decoded = await bitmapFromBlob(file);
  } catch {
    if (!heicInput) throw new Error('This browser cannot decode the selected image. Try JPG, PNG, or WebP.');
    try {
      decoded = await bitmapFromBlob(await convertHeic(file));
    } catch {
      throw new Error('HEIC/HEIF decoding is not available in this browser. Convert the image to JPG first.');
    }
  }
  try {validateDimensions(decoded.width, decoded.height);return decoded;}
  catch(reason){decoded.release();throw reason;}
}

function makeCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = roundedDimension(width);
  canvas.height = roundedDimension(height);
  const context = canvas.getContext('2d', { alpha: true });
  if (!context) throw new Error('Canvas image processing is not available in this browser');
  return canvas;
}

function normalizedQuality(quality: number): number {
  const value = quality > 1 ? quality / 100 : quality;
  return Math.max(0.1, Math.min(1, Number.isFinite(value) ? value : 0.85));
}

function encodeCanvas(canvas: HTMLCanvasElement, format: ImageExportOptions['format'], quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob || blob.size === 0) {
        reject(new Error('The browser could not export this image'));
        return;
      }
      if (blob.type !== format) {
        reject(new Error(`${format.replace('image/', '').toUpperCase()} export is not supported by this browser`));
        return;
      }
      resolve(blob);
    }, format, quality);
  });
}

function paintImage(
  image: CanvasImageSource,
  width: number,
  height: number,
  format: ImageExportOptions['format'],
  backgroundColor?: string,
): HTMLCanvasElement {
  const canvas = makeCanvas(width, height);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas image processing is not available in this browser');
  if (format === 'image/jpeg') {
    context.fillStyle = backgroundColor || '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export async function exportImage(file: File, options: ImageExportOptions, signal?: AbortSignal): Promise<Blob> {
  checkCancelled(signal);
  const decoded = await decodeImage(file);
  try {
    checkCancelled(signal);
    const requestedWidth = options.width && options.width > 0 ? options.width : decoded.width;
    const requestedHeight = options.height && options.height > 0 ? options.height : decoded.height;
    const dimensions = fitDimensions(decoded.width, decoded.height, requestedWidth, requestedHeight, options.preserveAspect ?? true);
    const canvas = paintImage(decoded.image, dimensions.width, dimensions.height, options.format, options.backgroundColor);
    try {
      const output=await encodeCanvas(canvas, options.format, normalizedQuality(options.quality));
      checkCancelled(signal);
      return output;
    } finally {
      canvas.width = 0;
      canvas.height = 0;
    }
  } finally {
    decoded.release();
  }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  const error = new Error('Image processing was cancelled');
  error.name = 'AbortError';
  throw error;
}

async function searchQuality(
  decoded: DecodedImage,
  width: number,
  height: number,
  options: CompressionOptions,
  onProgress: (progress: number) => void,
  signal?: AbortSignal,
  progressBase = 0,
  progressSpan = 1,
): Promise<CompressionCandidate[]> {
  const format = options.format;
  const maxQuality = normalizedQuality(options.quality);
  const minQuality = Math.min(maxQuality, Math.max(0.1, normalizedQuality(options.minQuality ?? 0.34)));
  const qualitySteps = format === 'image/png' ? 1 : 7;
  const candidates: CompressionCandidate[] = [];
  const canvas = paintImage(decoded.image, width, height, format, options.backgroundColor);
  try {
    let low = minQuality;
    let high = maxQuality;
    for (let attempt = 0; attempt < qualitySteps; attempt += 1) {
      throwIfAborted(signal);
      const quality = format === 'image/png'
        ? 1
        : attempt === 0
          ? high
          : (low + high) / 2;
      const blob = await encodeCanvas(canvas, format, quality);
      throwIfAborted(signal);
      candidates.push({ quality, blob });
      onProgress(Math.min(99, Math.round((progressBase + ((attempt + 1) / qualitySteps) * progressSpan) * 100)));
      if (format === 'image/png') break;
      if (blob.size > options.targetBytes) high = quality;
      else low = quality;
      if (Math.abs(high - low) < 0.015) break;
    }
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
  return candidates;
}

export async function compressTowardTarget(
  file: File,
  options: CompressionOptions,
  onProgress: (progress: number) => void,
  signal?: AbortSignal,
): Promise<CompressionResult> {
  if (!positiveDimension(options.targetBytes)) throw new Error('Target size must be positive');
  throwIfAborted(signal);
  const decoded = await decodeImage(file);
  try {
    const requestedWidth = options.width && options.width > 0 ? options.width : decoded.width;
    const requestedHeight = options.height && options.height > 0 ? options.height : decoded.height;
    const base = fitDimensions(decoded.width, decoded.height, requestedWidth, requestedHeight, options.preserveAspect ?? true);
    const scales = [1, 0.86, 0.73, 0.61, 0.5, 0.4];
    let best: (CompressionCandidate & { reachedTarget: boolean }) | undefined;
    let bestWidth = base.width;
    let bestHeight = base.height;

    onProgress(0);
    for (let index = 0; index < scales.length; index += 1) {
      throwIfAborted(signal);
      const scale = scales[index];
      const width = roundedDimension(base.width * scale);
      const height = roundedDimension(base.height * scale);
      const batch = await searchQuality(
        decoded, width, height, options, onProgress, signal,
        index / scales.length, 1 / scales.length,
      );
      if (batch.length === 0) continue;
      const currentBest = pickCompressionCandidate(batch, options.targetBytes);
      if (currentBest.reachedTarget) {
        onProgress(100);
        return { blob: currentBest.blob, width, height, reachedTarget: true, quality: currentBest.quality };
      }
      if (!best || currentBest.blob.size < best.blob.size) {
        best = currentBest;
        bestWidth = width;
        bestHeight = height;
      }
    }

    if (!best) throw new Error('The browser could not export this image');
    onProgress(100);
    return {
      blob: best.blob,
      width: bestWidth,
      height: bestHeight,
      reachedTarget: false,
      quality: best.quality,
    };
  } finally {
    decoded.release();
  }
}

