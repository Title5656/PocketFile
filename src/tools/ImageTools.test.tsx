import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ImageTools } from './ImageTools';
import JSZip from 'jszip';

const { decodeImage, compressTowardTarget, renderIdPhoto, exportImage } = vi.hoisted(() => ({ decodeImage: vi.fn(), compressTowardTarget: vi.fn(), renderIdPhoto: vi.fn(), exportImage:vi.fn() }));
vi.mock('../lib/images', async (importOriginal) => ({
  ...await importOriginal<typeof import('../lib/images')>(),
  decodeImage,
  compressTowardTarget,
  exportImage,
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

const pngFile=()=>new File([new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,2,128,0,0,1,224])],'test.png',{type:'image/png'});

it('ignores a selection decode that resolves after reset and a newer selection',async()=>{
  let resolveOld: (value:unknown)=>void=()=>{};
  const release=vi.fn();
  decodeImage.mockImplementationOnce(()=>new Promise(resolve=>{resolveOld=resolve;})).mockResolvedValue({width:320,height:240,release});
  render(<ImageTools toolId="compress" onDirtyChange={vi.fn()}/>);
  fireEvent.change(screen.getByLabelText('เลือกไฟล์'),{target:{files:[pngFile()]}});
  fireEvent.click(await screen.findByLabelText('นำรูปออก'));fireEvent.click(screen.getByRole('alertdialog').querySelector('.button--danger')!);
  fireEvent.change(screen.getByLabelText('เลือกไฟล์'),{target:{files:[pngFile()]}});
  await waitFor(()=>expect(screen.getByLabelText('ความกว้าง (px)')).toHaveValue(320));
  await act(async()=>resolveOld({width:999,height:999,release}));
  expect(screen.getByLabelText('ความกว้าง (px)')).toHaveValue(320);expect(release).toHaveBeenCalledTimes(2);
});

it('serializes ZIP creation and recovers with a visible error after failure',async()=>{
  exportImage.mockResolvedValue(new Blob(['image'],{type:'image/png'}));
  let rejectZip: (reason:Error)=>void=()=>{};
  const generate=vi.spyOn(JSZip.prototype,'generateAsync').mockImplementation(()=>new Promise((_resolve,reject)=>{rejectZip=reject;}));
  render(<ImageTools toolId="batch" onDirtyChange={vi.fn()}/>);
  fireEvent.change(screen.getByLabelText('เลือกไฟล์'),{target:{files:[pngFile()]}});
  fireEvent.click(await screen.findByRole('button',{name:'ประมวลผล 1 ไฟล์'}));
  const zip=await screen.findByRole('button',{name:'ดาวน์โหลด ZIP'});await waitFor(()=>expect(zip).toBeEnabled());
  fireEvent.click(zip);fireEvent.click(zip);expect(generate).toHaveBeenCalledOnce();
  await act(async()=>rejectZip(new Error('ZIP failed')));
  expect(screen.getByRole('alert')).toHaveTextContent('อ่านหรือส่งออกไฟล์ไม่ได้');
  expect(screen.getByRole('button',{name:'ดาวน์โหลด ZIP'})).toBeEnabled();
});

describe('image compressor workflow', () => {
  it('locks output settings while compression is running', async () => {
    let finishCompression: ((result: { blob: Blob; width: number; height: number; reachedTarget: boolean; quality: number }) => void) | undefined;
    decodeImage.mockResolvedValue({ width: 640, height: 480, image: {}, release: vi.fn() });
    compressTowardTarget.mockImplementation(() => new Promise((resolve) => { finishCompression = resolve; }));
    const onDirtyChange = vi.fn();
    render(<ImageTools toolId="compress" onDirtyChange={onDirtyChange} />);

    fireEvent.change(screen.getByLabelText('เลือกไฟล์'), { target: { files: [new File([new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,2,128,0,0,1,224])], 'photo.png', { type: 'image/png' })] } });
    const format = await screen.findByLabelText('รูปแบบผลลัพธ์');
    fireEvent.click(screen.getByRole('button', { name: 'บีบอัดรูป' }));
    await waitFor(() => expect(compressTowardTarget).toHaveBeenCalledOnce());
    expect(format).toBeDisabled();
    expect(screen.getByLabelText('ขนาดเป้าหมาย')).toBeDisabled();
    expect(screen.getByLabelText('คุณภาพ 86%')).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /ยกเลิก/ }));
    fireEvent.click(screen.getByRole('button', { name: 'ยกเลิกงาน' }));
    expect(format).toBeDisabled();
    await act(async () => finishCompression?.({ blob: new Blob(['done'], { type: 'image/jpeg' }), width: 640, height: 480, reachedTarget: true, quality: 0.86 }));
    expect(format).toBeEnabled();
    expect(screen.queryByText('รูปภาพที่บีบอัดแล้ว')).not.toBeInTheDocument();
  });

  it('locks ID-photo settings during export and clears output when DPI changes', async () => {
    let finishPhoto: ((blob: Blob) => void) | undefined;
    decodeImage.mockResolvedValue({ width: 640, height: 480, image: {}, release: vi.fn() });
    renderIdPhoto.mockImplementation((_file, _crop, _size, dpi) => dpi === 72
      ? Promise.resolve(new Blob(['preview'], { type: 'image/jpeg' }))
      : new Promise((resolve) => { finishPhoto = resolve; }));
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:preview'), revokeObjectURL: vi.fn() });
    render(<ImageTools toolId="id-photo" onDirtyChange={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('เลือกไฟล์'), { target: { files: [new File([new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,2,128,0,0,1,224])], 'photo.png', { type: 'image/png' })] } });
    const dpi = await screen.findByLabelText('DPI');
    fireEvent.click(screen.getByRole('button', { name: 'ส่งออกรูปติดบัตร' }));
    expect(dpi).toBeDisabled();
    await act(async () => finishPhoto?.(new Blob(['photo'], { type: 'image/jpeg' })));
    expect(await screen.findByText('รูปติดบัตร')).toBeVisible();

    fireEvent.change(dpi, { target: { value: '150' } });
    expect(screen.queryByText('รูปติดบัตร')).not.toBeInTheDocument();
  });
});
