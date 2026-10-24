import { afterEach, describe, expect, it, vi } from 'vitest';
import { decodeImage, exportImage } from './images';

const { heicConverter } = vi.hoisted(() => ({ heicConverter: vi.fn() }));
vi.mock('heic2any', () => ({ default: heicConverter }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  heicConverter.mockReset();
});

describe('browser image operations', () => {
  it('uses the HEIC fallback for a generic MIME type when the filename identifies the format', async () => {
    const converted = new Blob(['decoded JPEG'], { type: 'image/jpeg' });
    heicConverter.mockResolvedValue(converted);
    const bitmap = { width: 8, height: 6, close: vi.fn() };
    const createImageBitmapMock = vi.fn().mockRejectedValueOnce(new Error('no native HEIC decoder')).mockResolvedValueOnce(bitmap);
    vi.stubGlobal('createImageBitmap', createImageBitmapMock);
    class ImageDecodeFailure {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) { queueMicrotask(() => this.onerror?.()); }
    }
    vi.stubGlobal('Image', ImageDecodeFailure);
    const file = new File(['source'], 'photo.heic', { type: 'application/octet-stream' });

    const decoded = await decodeImage(file);

    expect(heicConverter).toHaveBeenCalledWith({ blob: file, toType: 'image/jpeg', quality: 0.94 });
    expect(createImageBitmapMock).toHaveBeenCalledTimes(2);
    expect(decoded).toMatchObject({ width: 8, height: 6 });
    decoded.release();
    expect(bitmap.close).toHaveBeenCalledOnce();
  });

  it('exports an actual image Blob at the aspect-preserving dimensions and releases its bitmap', async () => {
    const bitmap = { width: 400, height: 200, close: vi.fn() };
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap));
    const context = { fillRect: vi.fn(), drawImage: vi.fn(), fillStyle: '' };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback, type) => {
      callback(new Blob(['encoded image'], { type: type ?? 'image/png' }));
    });

    const output = await exportImage(new File(['source'], 'source.png', { type: 'image/png' }), {
      format: 'image/png', quality: 0.9, width: 200, height: 100, preserveAspect: true,
    });

    expect(output).toBeInstanceOf(Blob);
    expect(output.type).toBe('image/png');
    expect(output.size).toBeGreaterThan(0);
    expect(context.drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 200, 100);
    expect(bitmap.close).toHaveBeenCalledOnce();
  });
});
