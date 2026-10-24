import { afterEach, describe, expect, it, vi } from 'vitest';
import { clampRedactionRect, getRedactionCanvasRect, redactImage } from './privacy';

const { decodeImage } = vi.hoisted(() => ({ decodeImage: vi.fn() }));
vi.mock('./images', async (importOriginal) => ({
  ...await importOriginal<typeof import('./images')>(),
  decodeImage,
}));

afterEach(() => { vi.restoreAllMocks(); decodeImage.mockReset(); });

describe('redaction geometry', () => {
  it('clamps a normalized redaction box to the image bounds', () => {
    expect(clampRedactionRect({ x: 0.8, y: -0.1, width: 0.4, height: 0.3 })).toEqual({
      x: 0.8, y: 0, width: 0.2, height: 0.2,
    });
  });

  it('converts normalized boxes into safe integer pixel rectangles', () => {
    expect(getRedactionCanvasRect({ x: 0.2, y: 0.25, width: 0.3, height: 0.5 }, 100, 80)).toEqual({
      x: 20, y: 20, width: 30, height: 40,
    });
  });

  it('creates an image Blob with the requested opaque black pixels and releases the source bitmap', async () => {
    const bitmap = { width: 100, height: 80, close: vi.fn() };
    const context = { fillStyle: '', fillRect: vi.fn(), drawImage: vi.fn() };
    decodeImage.mockResolvedValue({ image: bitmap, width: 100, height: 80, release: bitmap.close });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback, type) => callback(new Blob(['redacted'], { type: type ?? 'image/jpeg' })));

    const output = await redactImage(new File(['original'], 'photo.jpg', { type: 'image/jpeg' }), [
      { x: 0.2, y: 0.25, width: 0.3, height: 0.5 },
    ]);

    expect(output).toBeInstanceOf(Blob);
    expect(output.type).toBe('image/jpeg');
    expect(output.size).toBeGreaterThan(0);
    expect(context.drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 100, 80);
    expect(context.fillRect).toHaveBeenLastCalledWith(20, 20, 30, 40);
    expect(context.fillStyle).toBe('#000000');
    expect(bitmap.close).toHaveBeenCalledOnce();
  });
});
