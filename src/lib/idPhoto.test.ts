const idPhotoModules = import.meta.glob('./idPhoto.ts', { eager: true }) as Record<string, Record<string, unknown>>;

describe('ID photo dimensions and crop', () => {
  it('converts preset and custom physical sizes to pixels at the chosen DPI', () => {
    const getPhotoPixelSize = idPhotoModules['./idPhoto.ts']?.getPhotoPixelSize as ((widthInches: number, heightInches: number, dpi: number) => { width: number; height: number }) | undefined;
    expect(getPhotoPixelSize).toBeDefined();
    if (!getPhotoPixelSize) return;

    expect(getPhotoPixelSize(1, 1.5, 300)).toEqual({ width: 300, height: 450 });
    expect(getPhotoPixelSize(1.5, 2, 300)).toEqual({ width: 450, height: 600 });
    expect(getPhotoPixelSize(2, 2, 300)).toEqual({ width: 600, height: 600 });
    expect(getPhotoPixelSize(3.2, 4.8, 300)).toEqual({ width: 960, height: 1440 });
  });

  it('uses a cover crop and moves the picture within the frame without leaving empty bands', () => {
    const getCropDrawRect = idPhotoModules['./idPhoto.ts']?.getCropDrawRect as (
      sourceWidth: number, sourceHeight: number, targetWidth: number, targetHeight: number,
      crop: { x: number; y: number; zoom: number },
    ) => { x: number; y: number; width: number; height: number } | undefined;
    expect(getCropDrawRect).toBeDefined();
    if (!getCropDrawRect) return;

    expect(getCropDrawRect(400, 200, 300, 450, { x: 0, y: 0, zoom: 1 })).toEqual({ x: -300, y: 0, width: 900, height: 450 });
    expect(getCropDrawRect(400, 200, 300, 450, { x: 1, y: 0, zoom: 1 })).toEqual({ x: -600, y: 0, width: 900, height: 450 });
    expect(getCropDrawRect(400, 200, 300, 450, { x: 0, y: 0, zoom: 2 })).toEqual({ x: -750, y: -225, width: 1800, height: 900 });
  });
});
