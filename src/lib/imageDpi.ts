const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const JFIF_SEGMENT = new Uint8Array([
  0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01,
  0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
]);

function concat(parts: Uint8Array[]): Uint8Array {
  const output = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) { output.set(part, offset); offset += part.length; }
  return output;
}

function writeUint32(bytes: Uint8Array, offset: number, value: number): void {
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setUint32(offset, value);
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const chunk = new Uint8Array(12 + data.length);
  writeUint32(chunk, 0, data.length);
  chunk.set(typeBytes, 4);
  chunk.set(data, 8);
  writeUint32(chunk, 8 + data.length, crc32(chunk.subarray(4, 8 + data.length)));
  return chunk;
}

function setPngDpi(bytes: Uint8Array, dpi: number): Uint8Array {
  if (bytes.length < 33 || !PNG_SIGNATURE.every((byte, index) => bytes[index] === byte)) throw new Error('The browser returned an invalid PNG image');
  const ppm = Math.round(dpi / 0.0254);
  const data = new Uint8Array(9);
  const density = new DataView(data.buffer);
  density.setUint32(0, ppm);
  density.setUint32(4, ppm);
  data[8] = 1;
  const physicalResolution = pngChunk('pHYs', data);
  const chunks: Uint8Array[] = [];
  let offset = PNG_SIGNATURE.length;
  let inserted = false;
  while (offset + 12 <= bytes.length) {
    const length = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset);
    const end = offset + 12 + length;
    if (end > bytes.length) throw new Error('The browser returned a malformed PNG image');
    const type = new TextDecoder().decode(bytes.subarray(offset + 4, offset + 8));
    if (type === 'pHYs') {
      if (!inserted) { chunks.push(physicalResolution); inserted = true; }
    } else {
      chunks.push(bytes.slice(offset, end));
      if (type === 'IHDR' && !inserted) { chunks.push(physicalResolution); inserted = true; }
    }
    offset = end;
    if (type === 'IEND') break;
  }
  if (!inserted) throw new Error('The PNG image is missing its header');
  return concat([PNG_SIGNATURE, ...chunks]);
}

function setJpegDpi(bytes: Uint8Array, dpi: number): Uint8Array {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error('The browser returned an invalid JPEG image');
  let offset = 2;
  while (offset + 4 <= bytes.length && bytes[offset] === 0xff) {
    const marker = bytes[offset + 1];
    if (marker === 0xda || marker === 0xd9) break;
    if (marker === 0x00 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) { offset += 2; continue; }
    const segmentLength = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (segmentLength < 2 || offset + 2 + segmentLength > bytes.length) break;
    const isJfif = marker === 0xe0 && bytes[offset + 4] === 0x4a && bytes[offset + 5] === 0x46 && bytes[offset + 6] === 0x49 && bytes[offset + 7] === 0x46 && bytes[offset + 8] === 0x00;
    if (isJfif && segmentLength >= 16) {
      const output = bytes.slice();
      const view = new DataView(output.buffer, output.byteOffset, output.byteLength);
      output[offset + 11] = 1;
      view.setUint16(offset + 12, dpi);
      view.setUint16(offset + 14, dpi);
      return output;
    }
    offset += 2 + segmentLength;
  }
  const densitySegment = JFIF_SEGMENT.slice();
  const densityView = new DataView(densitySegment.buffer);
  densitySegment[11] = 1;
  densityView.setUint16(12, dpi);
  densityView.setUint16(14, dpi);
  return concat([bytes.subarray(0, 2), densitySegment, bytes.subarray(2)]);
}

export async function setImageDpi(blob: Blob, dpi: number): Promise<Blob> {
  if (!Number.isInteger(dpi) || dpi < 1) throw new Error('DPI must be positive');
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let output: Uint8Array;
  if (blob.type === 'image/png') output = setPngDpi(bytes, dpi);
  else if (blob.type === 'image/jpeg') {
    if (dpi > 65_535) throw new Error('JPEG DPI must be at most 65,535');
    output = setJpegDpi(bytes, dpi);
  } else throw new Error('DPI metadata is supported for JPEG or PNG output');
  const buffer = new ArrayBuffer(output.length);
  new Uint8Array(buffer).set(output);
  return new Blob([buffer], { type: blob.type });
}
