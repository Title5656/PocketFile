const imageModules = import.meta.glob('./images.ts', { eager: true }) as Record<string, Record<string, unknown>>;

function getFunction<T extends (...args: never[]) => unknown>(name: string): T | undefined {
  const candidate = imageModules['./images.ts']?.[name];
  return typeof candidate === 'function' ? candidate as T : undefined;
}

describe('image size and compression helpers', () => {
  it('fits a resized image inside its requested box without changing its aspect ratio', () => {
    const fitDimensions = getFunction<(sourceWidth: number, sourceHeight: number, width: number, height: number, preserveAspect: boolean) => { width: number; height: number }>('fitDimensions');
    expect(fitDimensions).toBeDefined();
    if (!fitDimensions) return;

    expect(fitDimensions(4000, 2000, 1200, 900, true)).toEqual({ width: 1200, height: 600 });
    expect(fitDimensions(4000, 2000, 1200, 900, false)).toEqual({ width: 1200, height: 900 });
  });

  it('rejects zero or negative image dimensions', () => {
    const fitDimensions = getFunction<(sourceWidth: number, sourceHeight: number, width: number, height: number, preserveAspect: boolean) => { width: number; height: number }>('fitDimensions');
    expect(fitDimensions).toBeDefined();
    if (!fitDimensions) return;

    expect(() => fitDimensions(0, 200, 100, 100, true)).toThrow('Image dimensions must be positive');
  });

  it('does not enlarge small images when preserving the aspect ratio', () => {
    const fitDimensions = getFunction<(sourceWidth: number, sourceHeight: number, width: number, height: number, preserveAspect: boolean) => { width: number; height: number }>('fitDimensions');
    expect(fitDimensions).toBeDefined();
    if (!fitDimensions) return;

    expect(fitDimensions(400, 200, 1200, 1200, true)).toEqual({ width: 400, height: 200 });
  });

  it('reports a signed percentage change when the exported file is larger', () => {
    const compressionReduction = getFunction<(before: number, after: number) => number>('compressionReduction');
    expect(compressionReduction).toBeDefined();
    if (!compressionReduction) return;

    expect(compressionReduction(1000, 750)).toBe(25);
    expect(compressionReduction(1000, 1200)).toBe(-20);
    expect(compressionReduction(0, 1200)).toBe(0);
  });

  it('chooses the highest quality result under the target size and reports when none fits', () => {
    const pickCompressionCandidate = getFunction<(
      candidates: Array<{ quality: number; blob: Blob }>,
      targetBytes: number,
    ) => { quality: number; blob: Blob; reachedTarget: boolean }>('pickCompressionCandidate');
    expect(pickCompressionCandidate).toBeDefined();
    if (!pickCompressionCandidate) return;
    const makeCandidate = (quality: number, size: number) => ({ quality, blob: new Blob(['x'.repeat(size)]) });

    const reached = pickCompressionCandidate([
      makeCandidate(0.8, 400), makeCandidate(0.92, 500), makeCandidate(0.99, 650),
    ], 500);
    expect(reached.quality).toBe(0.92);
    expect(reached.blob.size).toBe(500);
    expect(reached.reachedTarget).toBe(true);

    const missed = pickCompressionCandidate([makeCandidate(0.6, 400), makeCandidate(0.95, 600)], 300);
    expect(missed.quality).toBe(0.6);
    expect(missed.blob.size).toBe(400);
    expect(missed.reachedTarget).toBe(false);
  });
});
