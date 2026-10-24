import { describe, expect, it } from 'vitest';
import { setImageDpi } from './imageDpi';

const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10];

function pngWithEmptyHeader(): Uint8Array {
  const bytes = new Uint8Array(8 + 25 + 12);
  bytes.set(pngSignature, 0);
  bytes.set([0, 0, 0, 13, 73, 72, 68, 82], 8);
  bytes.set([0, 0, 0, 0], 29);
  bytes.set([0, 0, 0, 0, 73, 69, 78, 68, 0, 0, 0, 0], 33);
  return bytes;
}

function jfifJpeg(): Uint8Array {
  return new Uint8Array([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10,
    0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00,
    0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9,
  ]);
}

describe('setImageDpi', () => {
  it('writes pixels-per-meter metadata into PNG output', async () => {
    const output = new Uint8Array(await (await setImageDpi(new Blob([pngWithEmptyHeader().buffer as ArrayBuffer], { type: 'image/png' }), 300)).arrayBuffer());
    const physOffset = output.findIndex((_, index) => index >= 12 && output[index] === 112 && output[index + 1] === 72 && output[index + 2] === 89 && output[index + 3] === 115);
    expect(physOffset).toBeGreaterThan(0);
    expect(output[physOffset + 8]).toBe(0);
    expect(new DataView(output.buffer).getUint32(physOffset + 4)).toBe(Math.round(300 / 0.0254));
    expect(output[physOffset + 12]).toBe(1);
  });

  it('writes inch-based density into the JPEG JFIF header', async () => {
    const output = new Uint8Array(await (await setImageDpi(new Blob([jfifJpeg().buffer as ArrayBuffer], { type: 'image/jpeg' }), 300)).arrayBuffer());
    expect(output[13]).toBe(1);
    expect(new DataView(output.buffer).getUint16(14)).toBe(300);
    expect(new DataView(output.buffer).getUint16(16)).toBe(300);
  });

  it('rejects invalid resolutions and unsupported MIME types', async () => {
    await expect(setImageDpi(new Blob([jfifJpeg().buffer as ArrayBuffer], { type: 'image/jpeg' }), 0)).rejects.toThrow('DPI must be positive');
    await expect(setImageDpi(new Blob(['x'], { type: 'image/webp' }), 300)).rejects.toThrow('JPEG or PNG');
  });
});
