import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { Copy, Download, FilePlus2, LoaderCircle, Minus, RotateCcw, Trash2, X } from 'lucide-react';
import JSZip from 'jszip';
import exifr from 'exifr';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { FileDropzone } from '../components/FileDropzone';
import { ResultCard } from '../components/ResultCard';
import { downloadBlob } from '../lib/download';
import { extensionForMime, formatBytes, outputFileName } from '../lib/format';
import { compressionReduction, compressTowardTarget, decodeImage, exportImage } from '../lib/images';
import { renderIdPhoto } from '../lib/idPhoto';
import { clampRedactionRect, redactImage } from '../lib/privacy';
import type { CompressionResult, CropTransform, MetadataItem, PhotoSize, Rect, ToolId } from '../types';

type OCRWorker = Awaited<ReturnType<typeof import('tesseract.js').createWorker>>;

interface ImageToolsProps {
  toolId: ToolId;
  onDirtyChange: (dirty: boolean) => void;
}

function useObjectUrl(blob?: Blob | null): string {
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (!blob) { setUrl(''); return; }
    const nextUrl = URL.createObjectURL(blob);
    setUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [blob]);
  return url;
}

function ErrorNote({ message }: { message: string }) {
  return message ? <p className="tool-error" role="alert">{message}</p> : null;
}

function ProgressLine({ value, label }: { value: number; label: string }) {
  return <div className="tool-progress" aria-live="polite"><div className="tool-progress-copy"><span>{label}</span><span>{value}%</span></div><progress max={100} value={value}>{value}%</progress></div>;
}

function ImagePreview({ before, after, beforeLabel = 'ต้นฉบับ', afterLabel = 'ผลลัพธ์' }: { before?: Blob | File; after?: Blob; beforeLabel?: string; afterLabel?: string }) {
  const beforeUrl = useObjectUrl(before);
  const afterUrl = useObjectUrl(after);
  if (!before && !after) return null;
  return <div className="image-preview-grid">
    {before ? <figure><figcaption>{beforeLabel} <small>{formatBytes(before.size)}</small></figcaption><img src={beforeUrl} alt={('name' in before && before.name) || beforeLabel} /></figure> : null}
    {after ? <figure><figcaption>{afterLabel} <small>{formatBytes(after.size)}</small></figcaption><img src={afterUrl} alt={afterLabel} /></figure> : null}
  </div>;
}

function ImageCompressor({ onDirtyChange }: Pick<ImageToolsProps, 'onDirtyChange'>) {
  const [file, setFile] = useState<File>();
  const [result, setResult] = useState<CompressionResult>();
  const [format, setFormat] = useState<'image/jpeg' | 'image/png' | 'image/webp'>('image/jpeg');
  const [targetKb, setTargetKb] = useState(200);
  const [targetChoice, setTargetChoice] = useState('200');
  const [quality, setQuality] = useState(86);
  const [width, setWidth] = useState('');
  const [height, setHeight] = useState('');
  const [preserveAspect, setPreserveAspect] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState<'reset' | 'cancel' | null>(null);
  const controller = useRef<AbortController | undefined>(undefined);

  const chooseFile = (items: File[]) => {
    setFile(items[0]); setResult(undefined); setError(''); onDirtyChange(true);
    void decodeImage(items[0]).then((decoded) => { setWidth(String(decoded.width)); setHeight(String(decoded.height)); decoded.release(); }).catch((reason: unknown) => setError(errorMessage(reason)));
  };
  const reset = () => { controller.current?.abort(); controller.current = undefined; setBusy(false); setFile(undefined); setResult(undefined); setProgress(0); setError(''); setWidth(''); setHeight(''); setConfirm(null); onDirtyChange(false); };
  const process = async () => {
    if (!file || busy) return;
    setBusy(true); setError(''); setProgress(0);
    const activeController = new AbortController(); controller.current = activeController;
    try {
      const compressed = await compressTowardTarget(file, {
        format, quality: quality / 100, targetBytes: Math.max(1, targetKb) * 1024,
        width: Number(width) || undefined, height: Number(height) || undefined, preserveAspect,
      }, setProgress, activeController.signal);
      if (!activeController.signal.aborted && controller.current === activeController) setResult(compressed);
    } catch (reason) { if (!isAbort(reason)) setError(errorMessage(reason)); }
    finally { if (controller.current === activeController) { setBusy(false); controller.current = undefined; } }
  };
  const extension = extensionForMime(format);
  return <>
    {!file ? <FileDropzone accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" title="เลือกรูปภาพเพื่อบีบอัด" description="รองรับ JPG, PNG และ WebP • ไฟล์จะไม่ออกจากอุปกรณ์" onFiles={chooseFile} /> : <>
      <div className="tool-file-line"><div><strong>{file.name}</strong><span>{formatBytes(file.size)}</span></div><button className="icon-button" type="button" aria-label="นำรูปออก" disabled={busy} onClick={() => setConfirm('reset')}><X size={17} /></button></div>
      <div className="tool-controls">
        <label className="tool-field"><span>ขนาดเป้าหมาย</span><select value={targetChoice} disabled={busy} onChange={(event) => { const value = event.target.value; setTargetChoice(value); if (value !== 'custom') setTargetKb(Number(value)); setResult(undefined); }}><option value="100">100 KB</option><option value="200">200 KB</option><option value="500">500 KB</option><option value="1024">1 MB</option><option value="custom">กำหนดเอง</option></select></label>
        {targetChoice === 'custom' ? <label className="tool-field"><span>ขนาดเป้าหมาย (KB)</span><input type="number" min="1" max="100000" value={targetKb} disabled={busy} onChange={(event) => { setTargetKb(Number(event.target.value)); setResult(undefined); }} /></label> : null}
        <label className="tool-field"><span>รูปแบบผลลัพธ์</span><select value={format} disabled={busy} onChange={(event) => { setFormat(event.target.value as typeof format); setResult(undefined); }}><option value="image/jpeg">JPG</option><option value="image/png">PNG</option><option value="image/webp">WebP</option></select></label>
        <label className="tool-field tool-field--wide"><span>คุณภาพ <b>{quality}%</b></span><input type="range" min="25" max="100" value={quality} disabled={busy} onChange={(event) => { setQuality(Number(event.target.value)); setResult(undefined); }} /></label>
        <label className="tool-field"><span>ความกว้าง (px)</span><input type="number" min="1" max="12000" value={width} disabled={busy} onChange={(event) => { setWidth(event.target.value); setResult(undefined); }} /></label>
        <label className="tool-field"><span>ความสูง (px)</span><input type="number" min="1" max="12000" value={height} disabled={busy} onChange={(event) => { setHeight(event.target.value); setResult(undefined); }} /></label>
        <label className="tool-check tool-field--wide"><input type="checkbox" checked={preserveAspect} disabled={busy} onChange={(event) => { setPreserveAspect(event.target.checked); setResult(undefined); }} /><span>รักษาสัดส่วนภาพ</span></label>
      </div>
      {busy ? <div className="tool-action-row"><ProgressLine value={progress} label="กำลังหาคุณภาพที่เหมาะสม" /><button className="button button--quiet" type="button" onClick={() => setConfirm('cancel')}><X size={15} /> ยกเลิก</button></div> : <div className="tool-action-row"><button className="button button--primary" type="button" onClick={() => void process()}><ImageProcessIcon /> บีบอัดรูป</button><button className="button button--quiet" type="button" onClick={() => setConfirm('reset')}><RotateCcw size={15} /> เริ่มใหม่</button></div>}
      <ErrorNote message={error} />
      {result ? <>
        {(() => { const reduction = compressionReduction(file.size, result.blob.size); return <div className="tool-result-summary"><span>{reduction >= 0 ? 'ลดขนาดได้' : 'ขนาดเพิ่มขึ้น'} <b>{Math.abs(reduction)}%</b></span><span>{result.width} × {result.height}px • คุณภาพ {Math.round(result.quality * 100)}%</span></div>; })()}
        {!result.reachedTarget ? <p className="tool-warning">รูปนี้ยังใหญ่กว่าเป้าหมาย ({formatBytes(targetKb * 1024)}) แม้ลดขนาดและคุณภาพเต็มที่แล้ว ผลลัพธ์จริงแสดงด้านล่าง</p> : null}
        <ImagePreview before={file} after={result.blob} />
        <ResultCard title="รูปภาพที่บีบอัดแล้ว" filename={outputFileName(file.name, extension)} blob={result.blob} onDownload={downloadBlob} details={[{ label: 'ก่อน', value: formatBytes(file.size) }, { label: 'หลัง', value: formatBytes(result.blob.size) }]} />
      </> : null}
    </>}
    {confirm ? <ConfirmDialog title={confirm === 'cancel' ? 'ยกเลิกการบีบอัด?' : 'เริ่มใหม่และนำไฟล์ออก?'} message="งานที่ยังไม่ดาวน์โหลดและการประมวลผลปัจจุบันจะถูกยกเลิก" confirmLabel={confirm === 'cancel' ? 'ยกเลิกงาน' : 'เริ่มใหม่'} onConfirm={() => { if (confirm === 'cancel') { controller.current?.abort(); controller.current = undefined; setBusy(false); setConfirm(null); } else reset(); }} onCancel={() => setConfirm(null)} /> : null}
  </>;
}

function ImageConverter({ onDirtyChange }: Pick<ImageToolsProps, 'onDirtyChange'>) {
  const [file, setFile] = useState<File>(); const [result, setResult] = useState<Blob>();
  const [format, setFormat] = useState<'image/jpeg' | 'image/png' | 'image/webp'>('image/webp');
  const [quality, setQuality] = useState(90); const [background, setBackground] = useState('#ffffff');
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [confirm, setConfirm] = useState(false); const runId = useRef(0);
  const process = async () => {
    if (!file || busy) return; const run = ++runId.current; setBusy(true); setError('');
    try { const blob = await exportImage(file, { format, quality: quality / 100, backgroundColor: background }); if (runId.current === run) setResult(blob); }
    catch (reason) { if (runId.current === run) setError(errorMessage(reason)); } finally { if (runId.current === run) setBusy(false); }
  };
  const reset = () => { runId.current += 1; setFile(undefined); setResult(undefined); setBusy(false); setError(''); setConfirm(false); onDirtyChange(false); };
  return <>
    {!file ? <FileDropzone accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif" title="เลือกรูปภาพที่ต้องการแปลง" description="JPG, PNG, WebP และ HEIC/HEIF (ขึ้นกับเบราว์เซอร์)" onFiles={(items) => { setFile(items[0]); setResult(undefined); setError(''); onDirtyChange(true); }} /> : <>
      <div className="tool-file-line"><div><strong>{file.name}</strong><span>{file.type || 'ชนิดไฟล์ไม่ระบุ'} • {formatBytes(file.size)}</span></div><button className="icon-button" type="button" aria-label="นำรูปออก" disabled={busy} onClick={() => setConfirm(true)}><X size={17} /></button></div>
      <div className="tool-controls">
        <label className="tool-field"><span>แปลงเป็น</span><select value={format} disabled={busy} onChange={(event) => { setFormat(event.target.value as typeof format); setResult(undefined); }}><option value="image/jpeg">JPG</option><option value="image/png">PNG</option><option value="image/webp">WebP</option></select></label>
        <label className="tool-field tool-field--wide"><span>คุณภาพ <b>{quality}%</b></span><input type="range" min="30" max="100" value={quality} onChange={(event) => { setQuality(Number(event.target.value)); setResult(undefined); }} disabled={format === 'image/png' || busy} /></label>
        {format === 'image/jpeg' ? <label className="tool-field"><span>สีพื้นหลัง (เมื่อมีความโปร่งใส)</span><input type="color" value={background} disabled={busy} onChange={(event) => { setBackground(event.target.value); setResult(undefined); }} /></label> : null}
      </div>
      <div className="tool-action-row">{busy ? <><span className="tool-status"><LoaderCircle className="spin" size={15} /> กำลังแปลงภาพ…</span><button className="button button--quiet" type="button" onClick={() => setConfirm(true)}><X size={15} /> ยกเลิก</button></> : <><button className="button button--primary" type="button" onClick={() => void process()}><ImageProcessIcon /> แปลงรูปภาพ</button><button className="button button--quiet" type="button" onClick={() => setConfirm(true)}><RotateCcw size={15} /> เริ่มใหม่</button></>}</div>
      <ErrorNote message={error} />
      {result ? <><ImagePreview before={file} after={result} /><ResultCard title="รูปภาพที่แปลงแล้ว" filename={outputFileName(file.name, extensionForMime(result.type))} blob={result} onDownload={downloadBlob} details={[{ label: 'ต้นฉบับ', value: `${file.type || 'ไม่ระบุ'} • ${formatBytes(file.size)}` }, { label: 'ผลลัพธ์', value: `${result.type} • ${formatBytes(result.size)}` }]} /></> : null}
    </>}
    {confirm ? <ConfirmDialog title="ล้างงานแปลงภาพ?" message="ไฟล์ผลลัพธ์ที่ยังไม่ดาวน์โหลดและงานที่กำลังประมวลผลจะถูกยกเลิก" confirmLabel="เริ่มใหม่" onConfirm={reset} onCancel={() => setConfirm(false)} /> : null}
  </>;
}

interface BatchItem { id: string; file: File; status: 'queued' | 'processing' | 'done' | 'error'; blob?: Blob; error?: string }

function BatchImageTool({ onDirtyChange }: Pick<ImageToolsProps, 'onDirtyChange'>) {
  const [items, setItems] = useState<BatchItem[]>([]); const [width, setWidth] = useState(1200); const [height, setHeight] = useState(1200);
  const [preserve, setPreserve] = useState(true); const [format, setFormat] = useState<'image/jpeg' | 'image/png' | 'image/webp'>('image/webp'); const [quality, setQuality] = useState(85);
  const [busy, setBusy] = useState(false); const [progress, setProgress] = useState(0); const [error, setError] = useState(''); const [confirm, setConfirm] = useState(false); const controller = useRef<AbortController | undefined>(undefined);
  const add = (files: File[]) => { if (busy) return; setItems((old) => [...old, ...files.map((file) => ({ id: crypto.randomUUID(), file, status: 'queued' as const }))]); onDirtyChange(true); setError(''); };
  const clearBatchResults = () => { setItems((old) => old.map(({ id, file }) => ({ id, file, status: 'queued' }))); setProgress(0); setError(''); };
  const reset = () => { controller.current?.abort(); controller.current = undefined; setBusy(false); setItems([]); setError(''); setProgress(0); setConfirm(false); onDirtyChange(false); };
  const process = async () => {
    if (!items.length || busy) return;
    setBusy(true); setError(''); const activeController = new AbortController(); controller.current = activeController;
    let finished = 0; const working = [...items];
    try {
      for (let i = 0; i < working.length; i += 1) {
        if (activeController.signal.aborted) break;
        const item = working[i];
        working[i] = { ...item, status: 'processing' };
        if (controller.current === activeController) setItems([...working]);
        try {
          const blob = await exportImage(item.file, { format, quality: quality / 100, width, height, preserveAspect: preserve });
          if (activeController.signal.aborted) break;
          working[i] = { ...item, status: 'done', blob };
        } catch (reason) {
          if (isAbort(reason)) break;
          working[i] = { ...item, status: 'error', error: errorMessage(reason) };
        }
        if (controller.current !== activeController) break;
        finished += 1; setItems([...working]); setProgress(Math.round((finished / working.length) * 100));
      }
    } finally { if (controller.current === activeController) { setBusy(false); controller.current = undefined; } }
  };
  const downloadZip = async () => {
    const done = items.filter((item) => item.blob);
    if (!done.length) return;
    const zip = new JSZip(); const names = new Set<string>();
    done.forEach(({ file, blob }) => {
      if (!blob) return;
      const preferred = outputFileName(file.name, extensionForMime(blob.type)); let name = preferred; let suffix = 2;
      while (names.has(name.toLocaleLowerCase())) {
        const dot = preferred.lastIndexOf('.');
        name = `${preferred.slice(0, dot)} (${suffix})${preferred.slice(dot)}`; suffix += 1;
      }
      names.add(name.toLocaleLowerCase()); zip.file(name, blob);
    });
    const blob = await zip.generateAsync({ type: 'blob' }); downloadBlob(blob, 'pocketfile-images.zip');
  };
  return <>
    <FileDropzone accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif" multiple title={items.length ? 'เพิ่มรูปภาพ' : 'เลือกรูปภาพหลายไฟล์'} description="JPG, PNG, WebP และ HEIC/HEIF ที่เบราว์เซอร์เปิดได้" onFiles={add} compact={items.length > 0} disabled={busy} />
    {items.length ? <>
      <div className="tool-controls">
        <label className="tool-field"><span>ความกว้างสูงสุด (px)</span><input type="number" min="1" max="12000" value={width} disabled={busy} onChange={(event) => { setWidth(Number(event.target.value)); clearBatchResults(); }} /></label>
        <label className="tool-field"><span>ความสูงสูงสุด (px)</span><input type="number" min="1" max="12000" value={height} disabled={busy} onChange={(event) => { setHeight(Number(event.target.value)); clearBatchResults(); }} /></label>
        <label className="tool-field"><span>รูปแบบ</span><select value={format} disabled={busy} onChange={(event) => { setFormat(event.target.value as typeof format); clearBatchResults(); }}><option value="image/jpeg">JPG</option><option value="image/png">PNG</option><option value="image/webp">WebP</option></select></label>
        <label className="tool-field"><span>คุณภาพ <b>{quality}%</b></span><input type="range" min="30" max="100" value={quality} onChange={(event) => { setQuality(Number(event.target.value)); clearBatchResults(); }} disabled={format === 'image/png' || busy} /></label>
        <label className="tool-check tool-field--wide"><input type="checkbox" checked={preserve} disabled={busy} onChange={(event) => { setPreserve(event.target.checked); clearBatchResults(); }} /><span>รักษาสัดส่วนภาพและไม่ขยายภาพ</span></label>
      </div>
      <div className="tool-action-row">
        {busy ? <><ProgressLine value={progress} label="กำลังประมวลผลชุดภาพ" /><button className="button button--quiet" type="button" onClick={() => setConfirm(true)}><X size={15} /> ยกเลิก</button></> : <><button className="button button--primary" type="button" onClick={() => void process()}><ImageProcessIcon /> ประมวลผล {items.length} ไฟล์</button><button className="button button--quiet" type="button" onClick={() => void downloadZip()} disabled={!items.some((item) => item.blob)}><Download size={15} /> ดาวน์โหลด ZIP</button><button className="button button--quiet" type="button" onClick={() => setConfirm(true)}><RotateCcw size={15} /> เริ่มใหม่</button></>}
      </div>
      <div className="batch-list">{items.map((item, index) => <div className="batch-row" key={item.id}><span className="batch-number">{index + 1}</span><div className="batch-name"><strong>{item.file.name}</strong><small>{formatBytes(item.file.size)}{item.blob ? ` → ${formatBytes(item.blob.size)}` : ''}</small>{item.error ? <small className="tool-error">{item.error}</small> : null}</div><span className={`batch-status batch-status--${item.status}`}>{item.status === 'done' ? 'เสร็จแล้ว' : item.status === 'error' ? 'ผิดพลาด' : item.status === 'processing' ? 'กำลังทำ…' : 'รอคิว'}</span>{item.blob ? <button className="icon-button" type="button" aria-label={`ดาวน์โหลด ${item.file.name}`} onClick={() => downloadBlob(item.blob!, outputFileName(item.file.name, extensionForMime(item.blob!.type)))}><Download size={15} /></button> : null}<button className="icon-button" type="button" aria-label={`ลบ ${item.file.name}`} disabled={busy} onClick={() => { const next = items.filter((row) => row.id !== item.id); setItems(next); onDirtyChange(next.length > 0); }}><Trash2 size={15} /></button></div>)}</div>
      <ErrorNote message={error} />
    </> : null}
    {confirm ? <ConfirmDialog title={busy ? 'ยกเลิกชุดงาน?' : 'ล้างรายการรูปภาพ?'} message="รูปที่ยังไม่ดาวน์โหลดและงานค้างจะถูกนำออกจากรายการนี้" confirmLabel={busy ? 'ยกเลิกงาน' : 'ล้างรายการ'} onConfirm={() => { if (busy) { controller.current?.abort(); controller.current = undefined; setItems((old) => old.map((item) => item.status === 'processing' ? { ...item, status: 'queued' } : item)); setBusy(false); setConfirm(false); } else reset(); }} onCancel={() => setConfirm(false)} /> : null}
  </>;
}

function IdPhotoTool({ onDirtyChange }: Pick<ImageToolsProps, 'onDirtyChange'>) {
  const [file, setFile] = useState<File>(); const [size, setSize] = useState<PhotoSize>({ widthInches: 1, heightInches: 1.5 }); const [customW, setCustomW] = useState(1); const [customH, setCustomH] = useState(1.5);
  const [dpi, setDpi] = useState(300); const [format, setFormat] = useState<'image/jpeg' | 'image/png'>('image/jpeg'); const [crop, setCrop] = useState<CropTransform>({ x: 0, y: 0, zoom: 1 });
  const [preview, setPreview] = useState<Blob>(); const [result, setResult] = useState<Blob>(); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [previewBusy, setPreviewBusy] = useState(false); const [confirm, setConfirm] = useState(false); const runId = useRef(0);
  const previewUrl = useObjectUrl(preview); const outputUrl = useObjectUrl(result);
  const resolvedSize = size.widthInches === -1 ? { widthInches: customW, heightInches: customH } : size;
  useEffect(() => {
    runId.current += 1; setResult(undefined);
    if (!file) { setPreview(undefined); return; }
    let alive = true; const timer = window.setTimeout(() => {
      setPreviewBusy(true);
      void renderIdPhoto(file, crop, resolvedSize, 72, format).then((blob) => { if (alive) setPreview(blob); }).catch((reason: unknown) => { if (alive) setError(errorMessage(reason)); }).finally(() => { if (alive) setPreviewBusy(false); });
    }, 180);
    return () => { alive = false; window.clearTimeout(timer); };
  }, [file, crop, resolvedSize.widthInches, resolvedSize.heightInches, format]);
  const changePreset = (value: string) => {
    if (value === 'custom') setSize({ widthInches: -1, heightInches: -1 });
    else { const [widthInches, heightInches] = value.split('x').map(Number); setSize({ widthInches, heightInches }); }
  };
  const reset = () => { runId.current += 1; setFile(undefined); setPreview(undefined); setResult(undefined); setBusy(false); setCrop({ x: 0, y: 0, zoom: 1 }); setError(''); setConfirm(false); onDirtyChange(false); };
  const process = async () => { if (!file || busy) return; const run = ++runId.current; setBusy(true); setError(''); try { const blob = await renderIdPhoto(file, crop, resolvedSize, dpi, format); if (runId.current === run) setResult(blob); } catch (reason) { if (runId.current === run) setError(errorMessage(reason)); } finally { if (runId.current === run) setBusy(false); } };
  return <>
    {!file ? <FileDropzone accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif" title="เลือกรูปบุคคล" description="เลือกรูปที่เห็นใบหน้าชัด แล้วปรับกรอบและตำแหน่ง" onFiles={(items) => { setFile(items[0]); setResult(undefined); setError(''); onDirtyChange(true); }} /> : <>
      <div className="tool-file-line"><div><strong>{file.name}</strong><span>ครอปเพื่อจัดกรอบภาพ • ต้นฉบับจะไม่เปลี่ยนแปลง</span></div><button className="icon-button" type="button" aria-label="เริ่มใหม่" disabled={busy} onClick={() => setConfirm(true)}><X size={17} /></button></div>
      <div className="id-photo-preview" style={{ aspectRatio: `${resolvedSize.widthInches} / ${resolvedSize.heightInches}` }}>{previewUrl ? <img src={previewUrl} alt="ตัวอย่างรูปติดบัตร" /> : <span>กำลังสร้างตัวอย่าง…</span>}{previewBusy ? <small>อัปเดตตัวอย่าง</small> : null}</div>
      <div className="tool-controls">
        <label className="tool-field"><span>ขนาดรูป</span><select value={size.widthInches === -1 ? 'custom' : `${size.widthInches}x${size.heightInches}`} disabled={busy} onChange={(event) => changePreset(event.target.value)}><option value="1x1">1 × 1 นิ้ว</option><option value="1x1.5">1 × 1.5 นิ้ว</option><option value="1.5x2">1.5 × 2 นิ้ว</option><option value="2x2">2 × 2 นิ้ว</option><option value="custom">กำหนดเอง</option></select></label>
        {size.widthInches === -1 ? <><label className="tool-field"><span>กว้าง (นิ้ว)</span><input type="number" min="0.2" max="8" step="0.1" value={customW} disabled={busy} onChange={(event) => setCustomW(Number(event.target.value))} /></label><label className="tool-field"><span>สูง (นิ้ว)</span><input type="number" min="0.2" max="8" step="0.1" value={customH} disabled={busy} onChange={(event) => setCustomH(Number(event.target.value))} /></label></> : null}
        <label className="tool-field"><span>DPI</span><select value={dpi} disabled={busy} onChange={(event) => { setDpi(Number(event.target.value)); setResult(undefined); }}><option value={150}>150 DPI</option><option value={300}>300 DPI</option><option value={600}>600 DPI</option></select></label>
        <label className="tool-field"><span>รูปแบบไฟล์</span><select value={format} disabled={busy} onChange={(event) => setFormat(event.target.value as typeof format)}><option value="image/jpeg">JPG</option><option value="image/png">PNG</option></select></label>
        <label className="tool-field tool-field--wide"><span>ซูม <b>{crop.zoom.toFixed(1)}×</b></span><input type="range" min="1" max="3" step="0.05" value={crop.zoom} disabled={busy} onChange={(event) => setCrop({ ...crop, zoom: Number(event.target.value) })} /></label>
        <label className="tool-field"><span>เลื่อนแนวนอน</span><input type="range" min="-1" max="1" step="0.02" value={crop.x} disabled={busy} onChange={(event) => setCrop({ ...crop, x: Number(event.target.value) })} /></label>
        <label className="tool-field"><span>เลื่อนแนวตั้ง</span><input type="range" min="-1" max="1" step="0.02" value={crop.y} disabled={busy} onChange={(event) => setCrop({ ...crop, y: Number(event.target.value) })} /></label>
      </div>
      <div className="tool-output-size">ส่งออก {Math.round(resolvedSize.widthInches * dpi)} × {Math.round(resolvedSize.heightInches * dpi)} พิกเซล • {dpi} DPI</div>
      <div className="tool-action-row">{busy ? <><span className="tool-status"><LoaderCircle className="spin" size={15} /> กำลังส่งออกรูปติดบัตร…</span><button className="button button--quiet" type="button" onClick={() => setConfirm(true)}><X size={15} /> ยกเลิก</button></> : <><button className="button button--primary" type="button" onClick={() => void process()}><ImageProcessIcon /> ส่งออกรูปติดบัตร</button><button className="button button--quiet" type="button" onClick={() => setConfirm(true)}><RotateCcw size={15} /> เริ่มใหม่</button></>}</div>
      <ErrorNote message={error} />
      {outputUrl && result ? <><div className="image-preview-grid"><figure><figcaption>ตัวอย่างผลลัพธ์</figcaption><img src={outputUrl} alt="รูปติดบัตรที่ส่งออก" /></figure></div><ResultCard title="รูปติดบัตร" filename={outputFileName(file.name, extensionForMime(result.type))} blob={result} onDownload={downloadBlob} details={[{ label: 'ขนาดภาพ', value: `${Math.round(resolvedSize.widthInches * dpi)} × ${Math.round(resolvedSize.heightInches * dpi)} px` }, { label: 'ความละเอียด', value: `${dpi} DPI` }]} /></> : null}
    </>}
    {confirm ? <ConfirmDialog title="เริ่มทำรูปติดบัตรใหม่?" message="ผลลัพธ์ที่ยังไม่ดาวน์โหลดและงานที่กำลังทำจะถูกยกเลิก" confirmLabel="เริ่มใหม่" onConfirm={reset} onCancel={() => setConfirm(false)} /> : null}
  </>;
}

const sensitiveExif: Array<{ key: string; label: string }> = [
  { key: 'latitude', label: 'GPS latitude' }, { key: 'longitude', label: 'GPS longitude' },
  { key: 'GPSLatitude', label: 'GPS latitude' }, { key: 'GPSLongitude', label: 'GPS longitude' }, { key: 'GPSAltitude', label: 'ความสูง GPS' },
  { key: 'DateTimeOriginal', label: 'วันที่ถ่าย' }, { key: 'CreateDate', label: 'วันที่สร้าง' }, { key: 'ModifyDate', label: 'วันที่แก้ไข' },
  { key: 'Make', label: 'ผู้ผลิตกล้อง' }, { key: 'Model', label: 'รุ่นกล้อง' }, { key: 'LensModel', label: 'เลนส์' }, { key: 'Software', label: 'ซอฟต์แวร์' },
  { key: 'Artist', label: 'ผู้สร้าง' }, { key: 'OwnerName', label: 'เจ้าของกล้อง' }, { key: 'BodySerialNumber', label: 'หมายเลขกล้อง' }, { key: 'ImageDescription', label: 'คำอธิบาย' },
];

interface PointerEdit { mode: 'create' | 'move' | 'resize'; index: number; startX: number; startY: number; origin: Rect }

function PrivacyTool({ onDirtyChange }: Pick<ImageToolsProps, 'onDirtyChange'>) {
  const [file, setFile] = useState<File>(); const [dimensions, setDimensions] = useState({ width: 1, height: 1 }); const [metadata, setMetadata] = useState<MetadataItem[]>([]);
  const [rects, setRects] = useState<Rect[]>([]); const [result, setResult] = useState<Blob>(); const [verified, setVerified] = useState<boolean>(); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [confirm, setConfirm] = useState(false); const runId = useRef(0);
  const imageUrl = useObjectUrl(file); const stageRef = useRef<HTMLDivElement>(null); const editRef = useRef<PointerEdit | undefined>(undefined);
  const choose = async (items: File[]) => {
    const run = ++runId.current;
    const next = items[0]; setFile(next); setResult(undefined); setRects([]); setError(''); onDirtyChange(true);
    try {
      const decoded = await decodeImage(next);
      if (run === runId.current) setDimensions({ width: decoded.width, height: decoded.height });
      decoded.release();
      let parsed: Record<string, unknown> | undefined;
      try { parsed = await exifr.parse(next, { gps: true, tiff: true, exif: true, iptc: true, xmp: true }) as Record<string, unknown> | undefined; } catch { parsed = undefined; }
      const itemsFound: MetadataItem[] = [];
      for (const { key, label } of sensitiveExif) {
        const value = parsed?.[key];
        if (value !== undefined && value !== null && !itemsFound.some((item) => item.label === label)) itemsFound.push({ label, value: metadataString(value), sensitive: label.includes('GPS') || label.includes('วันที่') });
      }
      if (run === runId.current) setMetadata(itemsFound);
    } catch (reason) { if (run === runId.current) setError(errorMessage(reason)); }
  };
  const pointFromEvent = (event: ReactPointerEvent<HTMLDivElement>) => {
    const box = stageRef.current?.getBoundingClientRect();
    if (!box) return { x: 0, y: 0 };
    return { x: Math.max(0, Math.min(1, (event.clientX - box.left) / box.width)), y: Math.max(0, Math.min(1, (event.clientY - box.top) / box.height)) };
  };
  const pointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!file || busy || event.button !== 0) return;
    const point = pointFromEvent(event); const boxEl = (event.target as HTMLElement).closest<HTMLElement>('[data-box-index]');
    if (boxEl) {
      const index = Number(boxEl.dataset.boxIndex); const resize = Boolean((event.target as HTMLElement).closest('[data-resize]'));
      const origin = rects[index]; if (!origin) return;
      editRef.current = { mode: resize ? 'resize' : 'move', index, startX: point.x, startY: point.y, origin };
    } else {
      editRef.current = { mode: 'create', index: rects.length, startX: point.x, startY: point.y, origin: { x: point.x, y: point.y, width: 0, height: 0 } };
      setRects([...rects, { x: point.x, y: point.y, width: 0, height: 0 }]);
    }
    setResult(undefined); setVerified(undefined);
    event.currentTarget.setPointerCapture(event.pointerId); event.preventDefault();
  };
  const pointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const edit = editRef.current; if (!edit) return;
    const point = pointFromEvent(event); const dx = point.x - edit.startX; const dy = point.y - edit.startY; const next = [...rects];
    let rect: Rect;
    if (edit.mode === 'create') rect = { x: Math.min(edit.startX, point.x), y: Math.min(edit.startY, point.y), width: Math.abs(dx), height: Math.abs(dy) };
    else if (edit.mode === 'move') rect = { ...edit.origin, x: Math.max(0, Math.min(1 - edit.origin.width, edit.origin.x + dx)), y: Math.max(0, Math.min(1 - edit.origin.height, edit.origin.y + dy)) };
    else rect = { ...edit.origin, width: Math.max(0.015, Math.min(1 - edit.origin.x, edit.origin.width + dx)), height: Math.max(0.015, Math.min(1 - edit.origin.y, edit.origin.height + dy)) };
    next[edit.index] = clampRedactionRect(rect); setRects(next); setResult(undefined); setVerified(undefined);
  };
  const pointerUp = () => {
    const edit = editRef.current;
    if (edit?.mode === 'create') setRects((old) => {
      const candidate = old[edit.index];
      return candidate && (candidate.width < 0.01 || candidate.height < 0.01) ? old.filter((_, index) => index !== edit.index) : old;
    });
    editRef.current = undefined;
  };
  const reset = () => { runId.current += 1; setFile(undefined); setMetadata([]); setRects([]); setResult(undefined); setVerified(undefined); setBusy(false); setError(''); setConfirm(false); onDirtyChange(false); };
  const process = async () => {
    if (!file || busy) return; const run = ++runId.current; setBusy(true); setError('');
    try {
      const blob = await redactImage(file, rects);
      let outputExif: Record<string, unknown> | undefined; let verificationReadFailed = false;
      try { outputExif = await exifr.parse(blob, { gps: true, tiff: true, exif: true, iptc: true, xmp: true }) as Record<string, unknown> | undefined; } catch { outputExif = undefined; verificationReadFailed = true; }
      const leftovers = sensitiveExif.some(({ key }) => outputExif?.[key] !== undefined && outputExif?.[key] !== null);
      if (run === runId.current) { setResult(blob); setVerified(!leftovers && !verificationReadFailed); }
      if (leftovers && run === runId.current) setError('ยังพบข้อมูลเมตาบางรายการในผลลัพธ์ จึงไม่ยืนยันว่าลบข้อมูลครบแล้ว');
    } catch (reason) { if (run === runId.current) setError(errorMessage(reason)); }
    finally { if (run === runId.current) setBusy(false); }
  };
  return <>
    {!file ? <FileDropzone accept="image/*,.jpg,.jpeg,.png,.webp,.heic,.heif" title="เลือกรูปภาพที่ต้องการตรวจสอบ" description="อ่าน Metadata ที่เบราว์เซอร์รองรับ แล้วลบด้วยการส่งออกภาพใหม่" onFiles={(items) => void choose(items)} /> : <>
      <div className="tool-file-line"><div><strong>{file.name}</strong><span>{dimensions.width} × {dimensions.height}px • {formatBytes(file.size)}</span></div><button className="icon-button" type="button" aria-label="เริ่มใหม่" disabled={busy} onClick={() => setConfirm(true)}><X size={17} /></button></div>
      <section className="metadata-panel"><div className="metadata-head"><div><strong>ข้อมูลที่อ่านได้</strong><small>รายการขึ้นกับข้อมูลที่ฝังในรูปและชนิดไฟล์</small></div><span>{metadata.length} รายการ</span></div>{metadata.length ? <dl>{metadata.map((item) => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl> : <p>ไม่พบ GPS วันที่ หรือข้อมูลกล้องที่รองรับให้อ่านในไฟล์นี้</p>}</section>
      <p className="tool-hint">ลากบนภาพเพื่อเพิ่มแถบปิดทับ • ลากกรอบเพื่อย้าย • ลากมุมเพื่อปรับขนาด • กล่องดำจะถูกเขียนลงในพิกเซลจริง</p>
      <div className="redaction-stage-wrap"><div ref={stageRef} className="redaction-stage" style={{ aspectRatio: `${dimensions.width} / ${dimensions.height}`, maxWidth: `${Math.min(750, 0.65 * window.innerHeight * dimensions.width / dimensions.height)}px` }} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp}>
        <img src={imageUrl} alt="ภาพสำหรับปิดทับข้อมูล" draggable={false} />
        {rects.map((rect, index) => <div key={index} className="redaction-box" data-box-index={index} style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.width * 100}%`, height: `${rect.height * 100}%` }}><button type="button" data-resize aria-label={`ปรับขนาดพื้นที่ ${index + 1}`} tabIndex={-1} /></div>)}
      </div><div className="redaction-actions"><button className="text-button" type="button" disabled={!rects.length || busy} onClick={() => { setRects((old) => old.slice(0, -1)); setResult(undefined); setVerified(undefined); }}><Minus size={14} /> ลบกรอบล่าสุด ({rects.length})</button><span>ลากเพื่อเพิ่มพื้นที่ปิดทับ</span></div></div>
      <div className="tool-action-row">{busy ? <><span className="tool-status"><LoaderCircle className="spin" size={15} /> กำลังล้างข้อมูล…</span><button className="button button--quiet" type="button" onClick={() => setConfirm(true)}><X size={15} /> ยกเลิก</button></> : <><button className="button button--primary" type="button" onClick={() => void process()}><ImageProcessIcon /> ลบ Metadata และส่งออก</button><button className="button button--quiet" type="button" onClick={() => setConfirm(true)}><RotateCcw size={15} /> เริ่มใหม่</button></>}</div>
      <ErrorNote message={error} />
      {result ? <><p className={`verification-note ${verified ? 'verification-note--ok' : 'verification-note--bad'}`} role="status">{verified ? 'ตรวจผลลัพธ์แล้ว: ไม่พบ Metadata สำคัญที่ตรวจสอบในไฟล์ใหม่' : 'ไม่สามารถยืนยันว่าลบ Metadata สำคัญได้ครบ'}</p><ImagePreview before={file} after={result} /><ResultCard title="รูปภาพที่ล้างข้อมูลแล้ว" filename={outputFileName(file.name, extensionForMime(result.type))} blob={result} onDownload={downloadBlob} /></> : null}
    </>}
    {confirm ? <ConfirmDialog title="ยกเลิกงานล้างข้อมูล?" message="ไฟล์ผลลัพธ์ที่ยังไม่ดาวน์โหลดและงานที่กำลังทำจะถูกยกเลิก" confirmLabel="เริ่มใหม่" onConfirm={reset} onCancel={() => setConfirm(false)} /> : null}
  </>;
}

function ImageTextTool({ onDirtyChange }: Pick<ImageToolsProps, 'onDirtyChange'>) {
  const [file, setFile] = useState<File>(); const [text, setText] = useState(''); const [busy, setBusy] = useState(false); const [progress, setProgress] = useState(0); const [status, setStatus] = useState('เตรียม OCR'); const [error, setError] = useState(''); const [copied, setCopied] = useState(false); const [confirm, setConfirm] = useState(false);
  const worker = useRef<OCRWorker | undefined>(undefined); const cancelled = useRef(false);
  const reset = () => { cancelled.current = true; void worker.current?.terminate(); worker.current = undefined; setFile(undefined); setText(''); setProgress(0); setBusy(false); setError(''); setConfirm(false); onDirtyChange(false); };
  const start = async () => {
    if (!file || busy) return; cancelled.current = false; setBusy(true); setProgress(0); setError(''); setText(''); setStatus('กำลังเตรียม Tesseract OCR');
    try {
      const { createWorker } = await import('tesseract.js');
      const active = await createWorker('tha+eng', 1, {
        workerPath: `${import.meta.env.BASE_URL}ocr/worker.min.js`,
        corePath: `${import.meta.env.BASE_URL}ocr/tesseract-core-lstm.wasm.js`,
        langPath: 'https://tessdata.projectnaptha.com/4.0.0_best',
        cacheMethod: 'write',
        logger: (message) => { if (cancelled.current) return; setStatus(message.status); setProgress(Math.max(0, Math.min(100, Math.round(message.progress * 100)))); },
      });
      worker.current = active;
      if (cancelled.current) { await active.terminate(); return; }
      setStatus('กำลังอ่านข้อความ');
      const result = await active.recognize(file);
      if (!cancelled.current) { setText(result.data.text.trim()); setProgress(100); }
      await active.terminate(); worker.current = undefined;
    } catch (reason) { if (!cancelled.current) setError(errorMessage(reason)); }
    finally { if (!cancelled.current) setBusy(false); }
  };
  const copy = async () => { try { await navigator.clipboard.writeText(text); setCopied(true); window.setTimeout(() => setCopied(false), 1800); } catch { setError('คัดลอกอัตโนมัติไม่ได้ กรุณาเลือกและคัดลอกข้อความด้วยตนเอง'); } };
  return <>
    {!file ? <FileDropzone accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif" title="เลือกรูปภาพที่มีข้อความ" description="OCR ภาษาไทยและอังกฤษด้วย Tesseract.js บนเครื่องของคุณ" onFiles={(items) => { setFile(items[0]); setError(''); onDirtyChange(true); }} /> : <>
      <div className="tool-file-line"><div><strong>{file.name}</strong><span>{formatBytes(file.size)} • รูปต้นฉบับไม่ถูกส่งขึ้นเซิร์ฟเวอร์</span></div><button className="icon-button" type="button" aria-label="เริ่มใหม่" disabled={busy} onClick={() => setConfirm(true)}><X size={17} /></button></div>
      <div className="ocr-notice"><strong>ดาวน์โหลดโมเดลครั้งแรก</strong><p>ครั้งแรกต้องเชื่อมต่ออินเทอร์เน็ตเพื่อดาวน์โหลดข้อมูลภาษาไทยและอังกฤษ โมเดลจะถูกแคชในเบราว์เซอร์ไว้ใช้ครั้งถัดไป ส่วน OCR ทำงานบนอุปกรณ์</p></div>
      <div className="tool-action-row">{busy ? <><ProgressLine value={progress} label={status} /><button className="button button--quiet" type="button" onClick={() => setConfirm(true)}><X size={15} /> ยกเลิก</button></> : <><button className="button button--primary" type="button" onClick={() => void start()}><ImageProcessIcon /> เริ่มอ่านข้อความ</button><button className="button button--quiet" type="button" onClick={() => setConfirm(true)}><RotateCcw size={15} /> เริ่มใหม่</button></>}</div>
      <ErrorNote message={error} />
      {text || !busy ? <label className="tool-field ocr-text-field"><span>ข้อความที่อ่านได้ — แก้ไขได้</span><textarea rows={10} value={text} placeholder="ข้อความที่อ่านได้จะปรากฏที่นี่" onChange={(event) => setText(event.target.value)} /></label> : null}
      <div className="tool-action-row"><button className="button button--quiet" type="button" onClick={() => void copy()} disabled={!text}><Copy size={15} /> {copied ? 'คัดลอกแล้ว' : 'คัดลอก'}</button><button className="button button--quiet" type="button" disabled={!text} onClick={() => downloadBlob(new Blob([text], { type: 'text/plain;charset=utf-8' }), outputFileName(file.name, 'txt'))}><Download size={15} /> ดาวน์โหลด TXT</button></div>
    </>}
    {confirm ? <ConfirmDialog title={busy ? 'ยกเลิก OCR?' : 'เริ่ม OCR ใหม่?'} message="ข้อความที่อ่านได้ซึ่งยังไม่ดาวน์โหลดและงานปัจจุบันจะถูกล้าง" confirmLabel="เริ่มใหม่" onConfirm={reset} onCancel={() => setConfirm(false)} /> : null}
  </>;
}

export function ImageTools({ toolId, onDirtyChange }: ImageToolsProps) {
  if (toolId === 'compress') return <ImageCompressor onDirtyChange={onDirtyChange} />;
  if (toolId === 'convert') return <ImageConverter onDirtyChange={onDirtyChange} />;
  if (toolId === 'batch') return <BatchImageTool onDirtyChange={onDirtyChange} />;
  if (toolId === 'id-photo') return <IdPhotoTool onDirtyChange={onDirtyChange} />;
  if (toolId === 'privacy') return <PrivacyTool onDirtyChange={onDirtyChange} />;
  if (toolId === 'image-text') return <ImageTextTool onDirtyChange={onDirtyChange} />;
  return null;
}

function errorMessage(reason: unknown): string { return reason instanceof Error ? reason.message : 'เกิดข้อผิดพลาดระหว่างประมวลผล'; }
function isAbort(reason: unknown): boolean { return reason instanceof Error && reason.name === 'AbortError'; }
function metadataString(value: unknown): string {
  if (value instanceof Date) return value.toLocaleString('th-TH');
  if (Array.isArray(value)) return value.map((part) => typeof part === 'number' ? part.toFixed(5) : String(part)).join(', ');
  if (typeof value === 'object' && value !== null) return JSON.stringify(value);
  return String(value);
}
function ImageProcessIcon() { return <FilePlus2 size={16} />; }
