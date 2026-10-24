export interface ObjectUrlApi {
  createObjectURL: (blob: Blob) => string;
  revokeObjectURL: (url: string) => void;
}

export function downloadBlob(blob: Blob, filename: string, urlApi: ObjectUrlApi = URL): void {
  const url = urlApi.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  anchor.tabIndex = -1;
  anchor.style.position = 'fixed';
  anchor.style.left = '-10000px';
  document.body.appendChild(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    window.setTimeout(() => urlApi.revokeObjectURL(url), 1000);
  }
}
