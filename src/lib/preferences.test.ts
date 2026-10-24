interface MemoryStorage extends Storage {
  data: Map<string, string>;
}

function createStorage(initial?: string): MemoryStorage {
  const data = new Map<string, string>();
  if (initial !== undefined) data.set('pocketfile.preferences', initial);
  return {
    data,
    get length() { return data.size; },
    clear: () => data.clear(),
    getItem: (key: string) => data.get(key) ?? null,
    key: (index: number) => [...data.keys()][index] ?? null,
    removeItem: (key: string) => { data.delete(key); },
    setItem: (key: string, value: string) => { data.set(key, value); },
  };
}

const preferenceModules = import.meta.glob('./preferences.ts', { eager: true }) as Record<
  string,
  Record<string, unknown>
>;

describe('local preferences', () => {
  it('keeps valid unique recent tools and safely falls back for invalid data', () => {
    const module = preferenceModules['./preferences.ts'];
    expect(typeof module?.readPreferences).toBe('function');
    if (typeof module?.readPreferences !== 'function') return;
    const readPreferences = module.readPreferences as (storage: Storage) => unknown;

    expect(readPreferences(createStorage())).toEqual({ recentTools: [] });
    expect(readPreferences(createStorage('{broken'))).toEqual({ recentTools: [] });
    expect(readPreferences(createStorage(JSON.stringify({
      theme: 'dark',
      recentTools: ['merge-pdf', 'compress', 'merge-pdf', 'not-a-tool', 'image-text', 'sign', 'batch'],
      files: ['should never persist'],
    })))).toEqual({ recentTools: ['merge-pdf', 'compress', 'sign', 'batch'] });
  });

  it('stores only recent tool IDs, ignoring legacy theme and private file data', () => {
    const module = preferenceModules['./preferences.ts'];
    expect(typeof module?.writePreferences).toBe('function');
    if (typeof module?.writePreferences !== 'function') return;
    const writePreferences = module.writePreferences as (storage: Storage, preferences: unknown) => void;
    const storage = createStorage();

    writePreferences(storage, { theme: 'dark', recentTools: ['compress'], selectedFile: 'private.png' });

    expect(JSON.parse(storage.getItem('pocketfile.preferences') ?? 'null')).toEqual({
      recentTools: ['compress'],
    });
  });
});
