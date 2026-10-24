import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentType } from 'react';

const dropzoneModules = import.meta.glob('./FileDropzone.tsx', { eager: true }) as Record<string, Record<string, unknown>>;

describe('file dropzone', () => {
  it('passes a supported selected file to the tool', () => {
    const FileDropzone = dropzoneModules['./FileDropzone.tsx']?.FileDropzone as ComponentType<{
      accept: string;
      multiple?: boolean;
      title: string;
      description: string;
      onFiles: (files: File[]) => void;
    }> | undefined;
    expect(FileDropzone).toBeDefined();
    if (!FileDropzone) return;
    const onFiles = vi.fn();
    const file = new File(['pixels'], 'portrait.png', { type: 'image/png' });

    render(<FileDropzone accept="image/png,.png" title="Upload image" description="Choose a picture" onFiles={onFiles} />);
    fireEvent.change(screen.getByLabelText('เลือกไฟล์'), { target: { files: [file] } });

    expect(onFiles).toHaveBeenCalledWith([file]);
  });

  it('rejects a file whose extension and MIME type are not accepted', () => {
    const FileDropzone = dropzoneModules['./FileDropzone.tsx']?.FileDropzone as ComponentType<{
      accept: string;
      multiple?: boolean;
      title: string;
      description: string;
      onFiles: (files: File[]) => void;
    }> | undefined;
    expect(FileDropzone).toBeDefined();
    if (!FileDropzone) return;
    const onFiles = vi.fn();
    const file = new File(['text'], 'notes.txt', { type: 'text/plain' });

    render(<FileDropzone accept="image/png,.png" title="Upload image" description="Choose a picture" onFiles={onFiles} />);
    fireEvent.change(screen.getByLabelText('เลือกไฟล์'), { target: { files: [file] } });

    expect(onFiles).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('ไฟล์นี้ไม่ได้อยู่ในรูปแบบที่รองรับ');
  });

  it('shows feedback and ignores a dropped file while the tool is busy', () => {
    const FileDropzone = dropzoneModules['./FileDropzone.tsx']?.FileDropzone as ComponentType<{
      accept: string;
      title: string;
      description: string;
      disabled?: boolean;
      onFiles: (files: File[]) => void;
    }> | undefined;
    expect(FileDropzone).toBeDefined();
    if (!FileDropzone) return;
    const onFiles = vi.fn();
    const file = new File(['pixels'], 'photo.png', { type: 'image/png' });

    const { container } = render(<FileDropzone accept="image/png" title="Upload image" description="Choose a picture" disabled onFiles={onFiles} />);
    fireEvent.drop(container.querySelector('.dropzone')!, { dataTransfer: { files: [file] } });

    expect(onFiles).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('รอให้งานปัจจุบันเสร็จก่อนเพิ่มไฟล์');
  });
});
