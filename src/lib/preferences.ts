import type { Preferences, ToolId } from '../types';

const STORAGE_KEY = 'pocketfile.preferences';
const RECENT_LIMIT = 4;
const VALID_TOOL_IDS = new Set<ToolId>([
  'compress', 'convert', 'batch', 'id-photo',
  'merge-pdf', 'pages', 'sign', 'print-layout',
]);

const defaults: Preferences = { recentTools: [] };

function cleanRecentTools(value: unknown): ToolId[] {
  if (!Array.isArray(value)) return [];
  const result: ToolId[] = [];
  for (const candidate of value) {
    if (typeof candidate !== 'string' || !VALID_TOOL_IDS.has(candidate as ToolId) || result.includes(candidate as ToolId)) {
      continue;
    }
    result.push(candidate as ToolId);
    if (result.length === RECENT_LIMIT) break;
  }
  return result;
}

export function readPreferences(storage: Storage): Preferences {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return { ...defaults };
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { ...defaults };
    const value = parsed as Record<string, unknown>;
    return {
      recentTools: cleanRecentTools(value.recentTools),
    };
  } catch {
    return { ...defaults };
  }
}

export function writePreferences(storage: Storage, preferences: Preferences): void {
  const safe: Preferences = {
    recentTools: cleanRecentTools(preferences.recentTools),
  };
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(safe));
  } catch {
    // Storage can be disabled or full; the in-memory setting still works for this session.
  }
}
