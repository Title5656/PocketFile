const downloadModules = import.meta.glob('./download.ts', { eager: true }) as Record<string, Record<string, unknown>>;

describe('browser downloads', () => {
  it('creates a named download link and revokes its object URL after the click', () => {
    const downloadBlob = downloadModules['./download.ts']?.downloadBlob as (
      blob: Blob,
      filename: string,
      urlApi: { createObjectURL: (blob: Blob) => string; revokeObjectURL: (url: string) => void },
    ) => void;
    expect(downloadBlob).toBeDefined();
    if (!downloadBlob) return;
    const blob = new Blob(['actual result']);
    const createObjectURL = vi.fn(() => 'blob:pocketfile-result');
    const revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.href).toBe('blob:pocketfile-result');
      expect(this.download).toBe('final.txt');
      expect(this.isConnected).toBe(true);
    });

    vi.useFakeTimers();
    try {
      downloadBlob(blob, 'final.txt', { createObjectURL, revokeObjectURL });
      expect(createObjectURL).toHaveBeenCalledWith(blob);
      expect(click).toHaveBeenCalledOnce();
      vi.runAllTimers();
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:pocketfile-result');
    } finally {
      vi.useRealTimers();
      vi.restoreAllMocks();
    }
  });
});
