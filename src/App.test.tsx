import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentType } from 'react';

const appModules = import.meta.glob('./App.tsx', { eager: true }) as Record<string, { default?: ComponentType }>;

describe('PocketFile home screen', () => {
beforeEach(()=>{window.history.replaceState(null,'','/');});
  it('shows the file tools, device privacy promise, and tool search', () => {
    const App = appModules['./App.tsx']?.default;
    expect(App).toBeDefined();
    if (!App) return;

    render(<App />);

    expect(screen.getByRole('heading', { name: 'จัดการไฟล์ได้ในที่เดียว' })).toBeVisible();
    expect(screen.getByText('ไฟล์จะอยู่บนอุปกรณ์ของคุณ')).toBeVisible();
    expect(screen.getByRole('searchbox', { name: 'ค้นหาเครื่องมือ' })).toBeVisible();
  });

  it('opens a selected tool workspace and returns to the dashboard', () => {
    const App = appModules['./App.tsx']?.default;
    expect(App).toBeDefined();
    if (!App) return;

    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /บีบอัดรูปภาพ/ }));
    expect(screen.getByRole('heading', { name: 'บีบอัดรูปภาพ' })).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'กลับไปหน้าแรก' }));
    expect(screen.getByRole('heading', { name: 'จัดการไฟล์ได้ในที่เดียว' })).toBeVisible();
  });

  it('opens a real file picker in all eight tool workspaces', async () => {
    const App = appModules['./App.tsx']?.default;
    expect(App).toBeDefined();
    if (!App) return;

    render(<App />);
    const toolNames = [
      'บีบอัดรูปภาพ', 'แปลงไฟล์รูปภาพ', 'จัดการภาพหลายไฟล์', 'ทำรูปติดบัตร',
      'รวมไฟล์ PDF', 'จัดการหน้า PDF', 'เซ็นเอกสาร PDF', 'จัดหน้าพิมพ์',
    ];
    for (const name of toolNames) {
      const toolButtons = screen.getAllByRole('button', { name: new RegExp(name) });
      fireEvent.click(toolButtons[toolButtons.length - 1]);
      expect(await screen.findByRole('button', { name: 'เลือกไฟล์' }, { timeout: 10000 })).toBeVisible();
      fireEvent.click(screen.getByRole('button', { name: 'กลับไปหน้าแรก' }));
    }
  });

  it('filters tools by name and keyword', () => {
    const App = appModules['./App.tsx']?.default;
    expect(App).toBeDefined();
    if (!App) return;

    render(<App />);
    fireEvent.change(screen.getByRole('searchbox', { name: 'ค้นหาเครื่องมือ' }), {
      target: { value: 'convert' },
    });

    expect(screen.getByRole('button', { name: /แปลงไฟล์รูปภาพ/ })).toBeVisible();
    expect(screen.queryByRole('button', { name: /บีบอัดรูปภาพ/ })).not.toBeInTheDocument();
  });
});
