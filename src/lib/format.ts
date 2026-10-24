export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const rounded = Math.round(value * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)} ${units[unitIndex]}`;
}

export function outputFileName(name: string, extension: string): string {
  const safeName = name.split(/[\\/]/).pop()?.trim() || 'PocketFile';
  const safeExtension = extension.replace(/^\./, '').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'file';
  const baseName = safeName.replace(/\.[^./\\]+$/, '') || 'PocketFile';
  return `${baseName}.${safeExtension}`;
}

export function extensionForMime(type: string): string {
  switch (type.toLowerCase()) {
    case 'image/jpeg': return 'jpg';
    case 'image/png': return 'png';
    case 'image/webp': return 'webp';
    case 'application/pdf': return 'pdf';
    case 'application/zip': return 'zip';
    case 'text/plain': return 'txt';
    default: return 'file';
  }
}
