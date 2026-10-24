import { useEffect, useRef, useState } from 'react';
import { Download, FilePlus2, LoaderCircle, RotateCcw, Trash2, X } from 'lucide-react';
import JSZip from 'jszip';

import { ConfirmDialog } from '../components/ConfirmDialog';
import { FileDropzone } from '../components/FileDropzone';
import { ResultCard } from '../components/ResultCard';
import { downloadBlob } from '../lib/download';
import { extensionForMime, formatBytes, outputFileName } from '../lib/format';
import { compressionReduction, compressTowardTarget, decodeImage, exportImage } from '../lib/images';
import { useRunId } from '../lib/useRunId';
import { validateDimensions, validateTarget, assertBatchBudget, userError } from '../lib/validation';
import { renderIdPhoto } from '../lib/idPhoto';
import type { CompressionResult, CropTransform, PhotoSize, ToolId } from '../types';


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

  const selection = useRunId();
  useEffect(()=>()=>controller.current?.abort(),[]);
  const chooseFile = (items: File[]) => {
    const run=++selection.current;
    setFile(items[0]); setResult(undefined); setError(''); onDirtyChange(true);
    void decodeImage(items[0]).then((decoded) => { if(selection.current===run){setWidth(String(decoded.width)); setHeight(String(decoded.height));} decoded.release(); }).catch((reason: unknown) => {if(selection.current===run)setError(errorMessage(reason));});
  };
  const reset = () => { selection.current+=1; controller.current?.abort(); setFile(undefined); setResult(undefined); setProgress(0); setError(''); setWidth(''); setHeight(''); setConfirm(null); onDirtyChange(false); };
  const process = async () => {
    if (!file || busy) return;
    try {validateDimensions(width,height); validateTarget(targetKb);} catch(reason){setError(errorMessage(reason));return;}
    setBusy(true); setResult(undefined); setError(''); setProgress(0);
    const activeController = new AbortController(); controller.current = activeController;
    try {
      const compressed = await compressTowardTarget(file, {
        format, quality: quality / 100, targetBytes: validateTarget(targetKb),
        ...validateDimensions(width,height), preserveAspect,
      }, (n)=>{if(!activeController.signal.aborted)setProgress(n);}, activeController.signal);
      if (!activeController.signal.aborted && controller.current === activeController) setResult(compressed);
    } catch (reason) { if (!activeController.signal.aborted && controller.current===activeController && !isAbort(reason)) setError(errorMessage(reason)); }
    finally { if (controller.current === activeController) { setBusy(false); controller.current = undefined; } }
  };
  const extension = extensionForMime(format);
  return <>
    {!file ? <FileDropzone disabled={busy} accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" title="เลือกรูปภาพเพื่อบีบอัด" description="รองรับ JPG, PNG และ WebP • ไฟล์จะไม่ออกจากอุปกรณ์" onFiles={chooseFile} /> : <>
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
        <ResultCard title="รูปภาพที่บีบอัดแล้ว" filename={outputFileName(file.name, extension, 'compressed')} blob={result.blob} onDownload={downloadBlob} details={[{ label: 'ก่อน', value: formatBytes(file.size) }, { label: 'หลัง', value: formatBytes(result.blob.size) }]} />
      </> : null}
    </>}
    {confirm ? <ConfirmDialog title={confirm === 'cancel' ? 'ยกเลิกการบีบอัด?' : 'เริ่มใหม่และนำไฟล์ออก?'} message="ยกเลิกผลลัพธ์และหยุดที่จุดพักถัดไป ขั้นตอนที่เริ่มแล้วอาจยังทำงานต่อ กรุณารอจนเสร็จก่อนเริ่มงานใหม่" confirmLabel={confirm === 'cancel' ? 'ยกเลิกงาน' : 'เริ่มใหม่'} onConfirm={() => { if (confirm === 'cancel') { controller.current?.abort(); setResult(undefined); setConfirm(null); } else reset(); }} onCancel={() => setConfirm(null)} /> : null}
  </>;
}

function ImageConverter({ onDirtyChange }: Pick<ImageToolsProps, 'onDirtyChange'>) {
  const [file, setFile] = useState<File>(); const [result, setResult] = useState<Blob>();
  const [format, setFormat] = useState<'image/jpeg' | 'image/png' | 'image/webp'>('image/webp');
  const [quality, setQuality] = useState(90); const [background, setBackground] = useState('#ffffff');
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [confirm, setConfirm] = useState(false); const runId = useRunId();
  const process = async () => {
    if (!file || busy) return; const run = ++runId.current; setBusy(true); setError('');
    try { const blob = await exportImage(file, { format, quality: quality / 100, backgroundColor: background }); if (runId.current === run) setResult(blob); }
    catch (reason) { if (runId.current === run) setError(errorMessage(reason)); } finally { setBusy(false); }
  };
  const reset = () => { runId.current += 1; setFile(undefined); setResult(undefined); setError(''); setConfirm(false); onDirtyChange(false); };
  return <>
    {!file ? <FileDropzone disabled={busy} accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif" title="เลือกรูปภาพที่ต้องการแปลง" description="JPG, PNG, WebP และ HEIC/HEIF (ขึ้นกับเบราว์เซอร์)" onFiles={(items) => { setFile(items[0]); setResult(undefined); setError(''); onDirtyChange(true); }} /> : <>
      <div className="tool-file-line"><div><strong>{file.name}</strong><span>{file.type || 'ชนิดไฟล์ไม่ระบุ'} • {formatBytes(file.size)}</span></div><button className="icon-button" type="button" aria-label="นำรูปออก" disabled={busy} onClick={() => setConfirm(true)}><X size={17} /></button></div>
      <div className="tool-controls">
        <label className="tool-field"><span>แปลงเป็น</span><select value={format} disabled={busy} onChange={(event) => { setFormat(event.target.value as typeof format); setResult(undefined); }}><option value="image/jpeg">JPG</option><option value="image/png">PNG</option><option value="image/webp">WebP</option></select></label>
        <label className="tool-field tool-field--wide"><span>คุณภาพ <b>{quality}%</b></span><input type="range" min="30" max="100" value={quality} onChange={(event) => { setQuality(Number(event.target.value)); setResult(undefined); }} disabled={format === 'image/png' || busy} /></label>
        {format === 'image/jpeg' ? <label className="tool-field"><span>สีพื้นหลัง (เมื่อมีความโปร่งใส)</span><input type="color" value={background} disabled={busy} onChange={(event) => { setBackground(event.target.value); setResult(undefined); }} /></label> : null}
      </div>
      <div className="tool-action-row">{busy ? <><span className="tool-status"><LoaderCircle className="spin" size={15} /> กำลังแปลงภาพ…</span><button className="button button--quiet" type="button" onClick={() => setConfirm(true)}><X size={15} /> ยกเลิก</button></> : <><button className="button button--primary" type="button" onClick={() => void process()}><ImageProcessIcon /> แปลงรูปภาพ</button><button className="button button--quiet" type="button" onClick={() => setConfirm(true)}><RotateCcw size={15} /> เริ่มใหม่</button></>}</div>
      <ErrorNote message={error} />
      {result ? <><ImagePreview before={file} after={result} /><ResultCard title="รูปภาพที่แปลงแล้ว" filename={outputFileName(file.name, extensionForMime(result.type), 'converted')} blob={result} onDownload={downloadBlob} details={[{ label: 'ต้นฉบับ', value: `${file.type || 'ไม่ระบุ'} • ${formatBytes(file.size)}` }, { label: 'ผลลัพธ์', value: `${result.type} • ${formatBytes(result.size)}` }]} /></> : null}
    </>}
    {confirm ? <ConfirmDialog title="ล้างงานแปลงภาพ?" message="ผลลัพธ์จะถูกล้าง ขั้นตอนที่เริ่มแล้วอาจยังทำงานต่อ กรุณารอจนเสร็จก่อนเริ่มงานใหม่" confirmLabel="เริ่มใหม่" onConfirm={reset} onCancel={() => setConfirm(false)} /> : null}
  </>;
}

interface BatchItem { id: string; file: File; status: 'queued' | 'processing' | 'done' | 'error'; blob?: Blob; error?: string }

function BatchImageTool({ onDirtyChange }: Pick<ImageToolsProps, 'onDirtyChange'>) {
  const [items, setItems] = useState<BatchItem[]>([]); const [width, setWidth] = useState(1200); const [height, setHeight] = useState(1200);
  const [preserve, setPreserve] = useState(true); const [format, setFormat] = useState<'image/jpeg' | 'image/png' | 'image/webp'>('image/webp'); const [quality, setQuality] = useState(85);
  const [busy, setBusy] = useState(false); const [progress, setProgress] = useState(0); const [error, setError] = useState(''); const [confirm, setConfirm] = useState(false); const controller = useRef<AbortController | undefined>(undefined);
  useEffect(()=>()=>controller.current?.abort(),[]);
  const add = (files: File[]) => { if (busy || zipLock.current) return; try{assertBatchBudget([...items.map(i=>i.file),...files]);}catch(reason){setError(errorMessage(reason));return;} setItems((old) => [...old, ...files.map((file) => ({ id: crypto.randomUUID(), file, status: 'queued' as const }))]); onDirtyChange(true); setError(''); };
  const clearBatchResults = () => { setItems((old) => old.map(({ id, file }) => ({ id, file, status: 'queued' }))); setProgress(0); setError(''); };
  const reset = () => { controller.current?.abort(); setItems([]); setError(''); setProgress(0); setConfirm(false); onDirtyChange(false); };
  const process = async () => {
    if (!items.length || busy) return;
    try{validateDimensions(width,height);}catch(reason){setError(errorMessage(reason));return;}
    clearBatchResults();
    setBusy(true); setError(''); const activeController = new AbortController(); controller.current = activeController;
    let finished = 0; const working = [...items];
    try {
      for (let i = 0; i < working.length; i += 1) {
        if (activeController.signal.aborted) break;
        const item = working[i];
        working[i] = { ...item, status: 'processing' };
        if (controller.current === activeController) setItems([...working]);
        try {
          const blob = await exportImage(item.file, { format, quality: quality / 100, width, height, preserveAspect: preserve }, activeController.signal);
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
  const zipLock=useRef(false); const [zipBusy,setZipBusy]=useState(false);
  const downloadZip = async () => {
    if(zipLock.current || busy)return;
    const done = items.filter((item) => item.blob);
    if (!done.length) return;
    zipLock.current=true; setZipBusy(true); setError('');
    try {
    if(done.reduce((n,i)=>n+(i.blob?.size||0),0)>100*1024*1024)throw new Error('ผลลัพธ์รวมเกิน 100 MB กรุณาดาวน์โหลดทีละไฟล์');
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
    const blob = await zip.generateAsync({ type: 'blob' }, m=>setProgress(Math.round(m.percent))); downloadBlob(blob, 'pocketfile-images.zip');
    }catch(reason){setError(errorMessage(reason));}finally{zipLock.current=false;setZipBusy(false);}
  };
  return <>
    <FileDropzone disabled={busy || zipBusy} accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif" multiple title={items.length ? 'เพิ่มรูปภาพ' : 'เลือกรูปภาพหลายไฟล์'} description="JPG, PNG, WebP และ HEIC/HEIF ที่เบราว์เซอร์เปิดได้" onFiles={add} compact={items.length > 0} />
    {items.length ? <>
      <div className="tool-controls">
        <label className="tool-field"><span>ความกว้างสูงสุด (px)</span><input type="number" min="1" max="12000" value={width} disabled={busy || zipBusy} onChange={(event) => { setWidth(Number(event.target.value)); clearBatchResults(); }} /></label>
        <label className="tool-field"><span>ความสูงสูงสุด (px)</span><input type="number" min="1" max="12000" value={height} disabled={busy || zipBusy} onChange={(event) => { setHeight(Number(event.target.value)); clearBatchResults(); }} /></label>
        <label className="tool-field"><span>รูปแบบ</span><select value={format} disabled={busy || zipBusy} onChange={(event) => { setFormat(event.target.value as typeof format); clearBatchResults(); }}><option value="image/jpeg">JPG</option><option value="image/png">PNG</option><option value="image/webp">WebP</option></select></label>
        <label className="tool-field"><span>คุณภาพ <b>{quality}%</b></span><input type="range" min="30" max="100" value={quality} onChange={(event) => { setQuality(Number(event.target.value)); clearBatchResults(); }} disabled={format === 'image/png' || busy || zipBusy} /></label>
        <label className="tool-check tool-field--wide"><input type="checkbox" checked={preserve} disabled={busy || zipBusy} onChange={(event) => { setPreserve(event.target.checked); clearBatchResults(); }} /><span>รักษาสัดส่วนภาพและไม่ขยายภาพ</span></label>
      </div>
      <div className="tool-action-row">
        {busy ? <><ProgressLine value={progress} label="กำลังประมวลผลชุดภาพ" /><button className="button button--quiet" type="button" disabled={zipBusy} onClick={() => setConfirm(true)}><X size={15} /> ยกเลิก</button></> : <><button className="button button--primary" type="button" disabled={zipBusy} onClick={() => void process()}><ImageProcessIcon /> ประมวลผล {items.length} ไฟล์</button><button className="button button--quiet" type="button" onClick={() => void downloadZip()} disabled={zipBusy || !items.some((item) => item.blob)}><Download size={15} /> {zipBusy ? `กำลังสร้าง ZIP ${progress}%` : 'ดาวน์โหลด ZIP'}</button><button className="button button--quiet" type="button" onClick={() => setConfirm(true)}><RotateCcw size={15} /> เริ่มใหม่</button></>}
      </div>
      <div className="batch-list">{items.map((item, index) => <div className="batch-row" key={item.id}><span className="batch-number">{index + 1}</span><div className="batch-name"><strong>{item.file.name}</strong><small>{formatBytes(item.file.size)}{item.blob ? ` → ${formatBytes(item.blob.size)}` : ''}</small>{item.error ? <small className="tool-error">{item.error}</small> : null}</div><span className={`batch-status batch-status--${item.status}`}>{item.status === 'done' ? 'เสร็จแล้ว' : item.status === 'error' ? 'ผิดพลาด' : item.status === 'processing' ? 'กำลังทำ…' : 'รอคิว'}</span>{item.blob ? <button className="icon-button" type="button" aria-label={`ดาวน์โหลด ${item.file.name}`} onClick={() => downloadBlob(item.blob!, outputFileName(item.file.name, extensionForMime(item.blob!.type)))}><Download size={15} /></button> : null}<button className="icon-button" type="button" aria-label={`ลบ ${item.file.name}`} disabled={busy || zipBusy} onClick={() => { const next = items.filter((row) => row.id !== item.id); setItems(next); onDirtyChange(next.length > 0); }}><Trash2 size={15} /></button></div>)}</div>
      <ErrorNote message={error} />
    </> : null}
    {confirm ? <ConfirmDialog title={busy ? 'ยกเลิกชุดงาน?' : 'ล้างรายการรูปภาพ?'} message="หยุดที่จุดพักถัดไป ขั้นตอนที่เริ่มแล้วอาจยังทำงานต่อ กรุณารอจนเสร็จก่อนเริ่มงานใหม่" confirmLabel={busy ? 'ยกเลิกงาน' : 'ล้างรายการ'} onConfirm={() => { if (busy) { controller.current?.abort(); setItems((old) => old.map((item) => item.status === 'processing' ? { ...item, status: 'queued' } : item)); setConfirm(false); } else reset(); }} onCancel={() => setConfirm(false)} /> : null}
  </>;
}

function IdPhotoTool({ onDirtyChange }: Pick<ImageToolsProps, 'onDirtyChange'>) {
  const [file, setFile] = useState<File>(); const [size, setSize] = useState<PhotoSize>({ widthInches: 1, heightInches: 1.5 }); const [customW, setCustomW] = useState(1); const [customH, setCustomH] = useState(1.5);
  const [dpi, setDpi] = useState(300); const [format, setFormat] = useState<'image/jpeg' | 'image/png'>('image/jpeg'); const [crop, setCrop] = useState<CropTransform>({ x: 0, y: 0, zoom: 1 });
  const [preview, setPreview] = useState<Blob>(); const [result, setResult] = useState<Blob>(); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [previewBusy, setPreviewBusy] = useState(false); const [confirm, setConfirm] = useState(false); const runId = useRunId();
  const previewUrl = useObjectUrl(preview); const outputUrl = useObjectUrl(result);
  const resolvedSize = size.widthInches === -1 ? { widthInches: customW, heightInches: customH } : size;
  const validSize=[resolvedSize.widthInches,resolvedSize.heightInches].every(n=>Number.isFinite(n)&&n>=.2&&n<=8);
  useEffect(() => {
    runId.current += 1; setResult(undefined); setPreview(undefined); setError(''); setPreviewBusy(false);
    if (!file) { setPreview(undefined); return; }
    if(!validSize){setError('ขนาดรูปต้องอยู่ระหว่าง 0.2–8 นิ้ว');return;}
    let alive = true; const controller = new AbortController(); const timer = window.setTimeout(() => {
      setPreviewBusy(true);
      void renderIdPhoto(file, crop, resolvedSize, 72, format, '#ffffff', controller.signal).then((blob) => { if (alive) setPreview(blob); }).catch((reason: unknown) => { if (alive) setError(errorMessage(reason)); }).finally(() => { if (alive) setPreviewBusy(false); });
    }, 180);
    return () => { alive = false; controller.abort(); window.clearTimeout(timer); };
  }, [file, crop, resolvedSize.widthInches, resolvedSize.heightInches, format]);
  const changePreset = (value: string) => {
    if (value === 'custom') setSize({ widthInches: -1, heightInches: -1 });
    else { const [widthInches, heightInches] = value.split('x').map(Number); setSize({ widthInches, heightInches }); }
  };
  const reset = () => { runId.current += 1; setFile(undefined); setPreview(undefined); setResult(undefined); setCrop({ x: 0, y: 0, zoom: 1 }); setError(''); setConfirm(false); onDirtyChange(false); };
  const process = async () => { if (!file || busy) return; const run = ++runId.current; setBusy(true); setError(''); try { const blob = await renderIdPhoto(file, crop, resolvedSize, dpi, format); if (runId.current === run) setResult(blob); } catch (reason) { if (runId.current === run) setError(errorMessage(reason)); } finally { setBusy(false); } };
  return <>
    {!file ? <FileDropzone disabled={busy} accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif" title="เลือกรูปบุคคล" description="เลือกรูปที่เห็นใบหน้าชัด แล้วปรับกรอบและตำแหน่ง" onFiles={(items) => { setFile(items[0]); setResult(undefined); setError(''); onDirtyChange(true); }} /> : <>
      <div className="tool-file-line"><div><strong>{file.name}</strong><span>ครอปเพื่อจัดกรอบภาพ • ต้นฉบับจะไม่เปลี่ยนแปลง</span></div><button className="icon-button" type="button" aria-label="เริ่มใหม่" disabled={busy} onClick={() => setConfirm(true)}><X size={17} /></button></div>
      <div className="id-photo-preview" style={{ aspectRatio: validSize ? `${resolvedSize.widthInches} / ${resolvedSize.heightInches}` : '2 / 3' }}>{previewUrl ? <img src={previewUrl} alt="ตัวอย่างรูปติดบัตร" /> : <span>{validSize ? 'กำลังสร้างตัวอย่าง…' : 'กรุณาตรวจขนาดรูป'}</span>}{previewBusy ? <small>อัปเดตตัวอย่าง</small> : null}</div>
      <div className="tool-controls">
        <label className="tool-field"><span>ขนาดรูป</span><select value={size.widthInches === -1 ? 'custom' : `${size.widthInches}x${size.heightInches}`} disabled={busy} onChange={(event) => changePreset(event.target.value)}><option value="1x1">1 × 1 นิ้ว</option><option value="1x1.5">1 × 1.5 นิ้ว</option><option value="1.5x2">1.5 × 2 นิ้ว</option><option value="2x2">2 × 2 นิ้ว</option><option value="custom">กำหนดเอง</option></select></label>
        {size.widthInches === -1 ? <><label className="tool-field"><span>กว้าง (นิ้ว)</span><input type="number" min="0.2" max="8" step="0.1" value={customW} disabled={busy} onChange={(event) => setCustomW(Number(event.target.value))} /></label><label className="tool-field"><span>สูง (นิ้ว)</span><input type="number" min="0.2" max="8" step="0.1" value={customH} disabled={busy} onChange={(event) => setCustomH(Number(event.target.value))} /></label></> : null}
        <label className="tool-field"><span>DPI</span><select value={dpi} disabled={busy} onChange={(event) => { setDpi(Number(event.target.value)); setResult(undefined); }}><option value={150}>150 DPI</option><option value={300}>300 DPI</option><option value={600}>600 DPI</option></select></label>
        <label className="tool-field"><span>รูปแบบไฟล์</span><select value={format} disabled={busy} onChange={(event) => setFormat(event.target.value as typeof format)}><option value="image/jpeg">JPG</option><option value="image/png">PNG</option></select></label>
        <label className="tool-field tool-field--wide"><span>ซูม <b>{crop.zoom.toFixed(1)}×</b></span><input type="range" min="1" max="3" step="0.05" value={crop.zoom} disabled={busy} onChange={(event) => setCrop({ ...crop, zoom: Number(event.target.value) })} /></label>
        <label className="tool-field"><span>เลื่อนแนวนอน</span><input type="range" min="-1" max="1" step="0.02" value={crop.x} disabled={busy} onChange={(event) => setCrop({ ...crop, x: Number(event.target.value) })} /></label>
        <label className="tool-field"><span>เลื่อนแนวตั้ง</span><input type="range" min="-1" max="1" step="0.02" value={crop.y} disabled={busy} onChange={(event) => setCrop({ ...crop, y: Number(event.target.value) })} /></label>
      </div>
      <div className="tool-output-size">ส่งออก {validSize ? Math.round(resolvedSize.widthInches * dpi) : '—'} × {validSize ? Math.round(resolvedSize.heightInches * dpi) : '—'} พิกเซล • {dpi} DPI</div>
      <div className="tool-action-row">{busy ? <><span className="tool-status"><LoaderCircle className="spin" size={15} /> กำลังส่งออกรูปติดบัตร…</span><button className="button button--quiet" type="button" onClick={() => setConfirm(true)}><X size={15} /> ยกเลิก</button></> : <><button className="button button--primary" type="button" disabled={!validSize} onClick={() => void process()}><ImageProcessIcon /> ส่งออกรูปติดบัตร</button><button className="button button--quiet" type="button" onClick={() => setConfirm(true)}><RotateCcw size={15} /> เริ่มใหม่</button></>}</div>
      <ErrorNote message={error} />
      {outputUrl && result ? <><div className="image-preview-grid"><figure><figcaption>ตัวอย่างผลลัพธ์</figcaption><img src={outputUrl} alt="รูปติดบัตรที่ส่งออก" /></figure></div><ResultCard title="รูปติดบัตร" filename={outputFileName(file.name, extensionForMime(result.type), 'id-photo')} blob={result} onDownload={downloadBlob} details={[{ label: 'ขนาดภาพ', value: `${Math.round(resolvedSize.widthInches * dpi)} × ${Math.round(resolvedSize.heightInches * dpi)} px` }, { label: 'ความละเอียด', value: `${dpi} DPI` }]} /></> : null}
    </>}
    {confirm ? <ConfirmDialog title="เริ่มทำรูปติดบัตรใหม่?" message="ผลลัพธ์จะถูกล้าง ขั้นตอนที่เริ่มแล้วอาจยังทำงานต่อ กรุณารอจนเสร็จก่อนเริ่มงานใหม่" confirmLabel="เริ่มใหม่" onConfirm={reset} onCancel={() => setConfirm(false)} /> : null}
  </>;
}

export function ImageTools({ toolId, onDirtyChange }: ImageToolsProps) {
  if (toolId === 'compress') return <ImageCompressor onDirtyChange={onDirtyChange} />;
  if (toolId === 'convert') return <ImageConverter onDirtyChange={onDirtyChange} />;
  if (toolId === 'batch') return <BatchImageTool onDirtyChange={onDirtyChange} />;
  if (toolId === 'id-photo') return <IdPhotoTool onDirtyChange={onDirtyChange} />;
  return null;
}

function errorMessage(reason: unknown): string { return userError(reason); }
function isAbort(reason: unknown): boolean { return reason instanceof Error && reason.name === 'AbortError'; }
function ImageProcessIcon() { return <FilePlus2 size={16} />; }
