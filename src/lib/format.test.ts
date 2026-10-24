const formatModules = import.meta.glob('./format.ts', { eager: true }) as Record<string, Record<string, unknown>>;

describe('file display helpers', () => {
  it('formats common file sizes without rounding away small files', () => {
    const formatBytes = formatModules['./format.ts']?.formatBytes as ((bytes: number) => string) | undefined;
    expect(formatBytes).toBeDefined();
    if (!formatBytes) return;

    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1)).toBe('1 B');
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(1_048_576)).toBe('1 MB');
  });

  it('replaces only the final extension when exporting a new format', () => {
    const outputFileName = formatModules['./format.ts']?.outputFileName as ((name: string, extension: string) => string) | undefined;
    expect(outputFileName).toBeDefined();
    if (!outputFileName) return;

    expect(outputFileName('holiday.photo.png', 'webp')).toBe('holiday.photo.webp');
    expect(outputFileName('Untitled', 'jpg')).toBe('Untitled.jpg');
  });
});
