import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ImageTools } from './ImageTools';

const { decodeImage, compressTowardTarget, renderIdPhoto } = vi.hoisted(() => ({ decodeImage: vi.fn(), compressTowardTarget: vi.fn(), renderIdPhoto: vi.fn() }));
vi.mock('../lib/images', async (importOriginal) => ({
  ...await importOriginal<typeof import('../lib/images')>(),
  decodeImage,
  compressTowardTarget,
}));
vi.mock('../lib/idPhoto', async (importOriginal) => ({
  ...await importOriginal<typeof import('../lib/idPhoto')>(),
  renderIdPhoto,
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('image compressor workflow', () => {
  it('locks output settings while compression is running', async () => {
    let finishCompression: ((result: { blob: Blob; width: number; height: number; reachedTarget: boolean; quality: number }) => void) | undefined;
    decodeImage.mockResolvedValue({ width: 640, height: 480, image: {}, release: vi.fn() });
    compressTowardTarget.mockImplementation(() => new Promise((resolve) => { finishCompression = resolve; }));
    const onDirtyChange = vi.fn();
    render(<ImageTools toolId="compress" onDirtyChange={onDirtyChange} />);

    fireEvent.change(screen.getByLabelText('เลือกไฟล์'), { target: { files: [new File(['pixels'], 'photo.png', { type: 'image/png' })] } });
    const format = await screen.findByLabelText('รูปแบบผลลัพธ์');
    fireEvent.click(screen.getByRole('button', { name: 'บีบอัดรูป' }));
    await waitFor(() => expect(compressTowardTarget).toHaveBeenCalledOnce());
    expect(format).toBeDisabled();
    expect(screen.getByLabelText('ขนาดเป้าหมาย')).toBeDisabled();
    expect(screen.getByLabelText('คุณภาพ 86%')).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /ยกเลิก/ }));
    fireEvent.click(screen.getByRole('button', { name: 'ยกเลิกงาน' }));
    expect(format).toBeEnabled();
    await act(async () => finishCompression?.({ blob: new Blob(['done'], { type: 'image/jpeg' }), width: 640, height: 480, reachedTarget: true, quality: 0.86 }));
  });

  it('locks ID-photo settings during export and clears output when DPI changes', async () => {
    let finishPhoto: ((blob: Blob) => void) | undefined;
    decodeImage.mockResolvedValue({ width: 640, height: 480, image: {}, release: vi.fn() });
    renderIdPhoto.mockImplementation((_file, _crop, _size, dpi) => dpi === 72
      ? Promise.resolve(new Blob(['preview'], { type: 'image/jpeg' }))
      : new Promise((resolve) => { finishPhoto = resolve; }));
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:preview'), revokeObjectURL: vi.fn() });
    render(<ImageTools toolId="id-photo" onDirtyChange={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('เลือกไฟล์'), { target: { files: [new File(['pixels'], 'photo.png', { type: 'image/png' })] } });
    const dpi = await screen.findByLabelText('DPI');
    fireEvent.click(screen.getByRole('button', { name: 'ส่งออกรูปติดบัตร' }));
    expect(dpi).toBeDisabled();
    await act(async () => finishPhoto?.(new Blob(['photo'], { type: 'image/jpeg' })));
    expect(await screen.findByText('รูปติดบัตร')).toBeVisible();

    fireEvent.change(dpi, { target: { value: '150' } });
    expect(screen.queryByText('รูปติดบัตร')).not.toBeInTheDocument();
  });
});
