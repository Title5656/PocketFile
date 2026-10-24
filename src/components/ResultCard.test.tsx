import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentType } from 'react';

const resultModules = import.meta.glob('./ResultCard.tsx', { eager: true }) as Record<string, Record<string, unknown>>;

describe('result card', () => {
  it('shows the actual output size and sends the result file to the download action', () => {
    const ResultCard = resultModules['./ResultCard.tsx']?.ResultCard as ComponentType<{
      title: string;
      filename: string;
      blob: Blob;
      onDownload: (blob: Blob, filename: string) => void;
      warning?: string;
    }> | undefined;
    expect(ResultCard).toBeDefined();
    if (!ResultCard) return;
    const blob = new Blob(['real result bytes']);
    const onDownload = vi.fn();

    render(<ResultCard title="พร้อมดาวน์โหลด" filename="compressed.jpg" blob={blob} onDownload={onDownload} />);

    expect(screen.getByText('พร้อมดาวน์โหลด')).toBeVisible();
    expect(screen.getByText('17 B')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'ดาวน์โหลดไฟล์' }));
    expect(onDownload).toHaveBeenCalledWith(blob, 'compressed.jpg');
  });

  it('shows a clear warning when an image target could not be reached', () => {
    const ResultCard = resultModules['./ResultCard.tsx']?.ResultCard as ComponentType<{
      title: string;
      filename: string;
      blob: Blob;
      onDownload: (blob: Blob, filename: string) => void;
      warning?: string;
    }> | undefined;
    expect(ResultCard).toBeDefined();
    if (!ResultCard) return;

    render(<ResultCard title="พร้อมดาวน์โหลด" filename="compressed.jpg" blob={new Blob(['x'])} onDownload={vi.fn()} warning="ไฟล์ยังใหญ่กว่าเป้าหมาย" />);

    expect(screen.getByRole('alert')).toHaveTextContent('ไฟล์ยังใหญ่กว่าเป้าหมาย');
  });
});
