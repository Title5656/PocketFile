import { useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import * as pdfjs from 'pdfjs-dist';
import type { PDFDocumentLoadingTask, PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { ArrowDown, ArrowUp, FilePlus2, LoaderCircle, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { FileDropzone } from '../components/FileDropzone';
import { ResultCard } from '../components/ResultCard';
import { useRunId } from '../lib/useRunId';
import { assertBatchBudget, MAX_PDF_PAGES, validateFile, userError } from '../lib/validation';
import { downloadBlob } from '../lib/download';
import { formatBytes, outputFileName } from '../lib/format';
import { addPdfSignatures, createPrintLayoutPdf, exportPdfPages, getSheetLayout, mergePdfBytes, parsePageRanges } from '../lib/pdf';
import type { PrintLayoutOptions, ToolId } from '../types';

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const pdfTaskByDocument = new WeakMap<PDFDocumentProxy, PDFDocumentLoadingTask>();

interface PdfToolsProps { toolId: ToolId; onDirtyChange: (dirty: boolean) => void }

async function loadPdf(file: File, ownTask?: (task: PDFDocumentLoadingTask)=>void) {
  if (file.size === 0) throw new Error('ไฟล์ PDF ว่างเปล่า');
  await validateFile(file,'pdf');
  const task = pdfjs.getDocument({ data: await file.arrayBuffer() });
  ownTask?.(task);
  let rejectPassword: (reason:Error)=>void=()=>{};
  const password=new Promise<never>((_,reject)=>{rejectPassword=reject;});
  task.onPassword=()=>{rejectPassword(new Error('PDF นี้มีรหัสผ่าน กรุณาปลดล็อกไฟล์ก่อน'));void task.destroy();};
  let document: PDFDocumentProxy;
  try{document=await Promise.race([task.promise,password]);}catch(reason){await task.destroy();throw reason;}
  if(document.numPages>MAX_PDF_PAGES){await task.destroy();throw new Error(`PDF ต้องไม่เกิน ${MAX_PDF_PAGES} หน้า กรุณาแบ่งไฟล์ก่อน`);}
  pdfTaskByDocument.set(document, task);
  return document;
}

function destroyPdf(document: PDFDocumentProxy): Promise<void> {
  return pdfTaskByDocument.get(document)?.destroy() ?? Promise.resolve();
}

function usePdfDocument(file?: File) {
  const [document, setDocument] = useState<PDFDocumentProxy>();
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true; let task: PDFDocumentLoadingTask | undefined;
    if (!file) { setDocument(undefined); setError(''); return undefined; }
    setDocument(undefined); setError('');
    void loadPdf(file, next=>{task=next;if(!alive)void task.destroy();}).then((result) => { if (alive) setDocument(result); else void destroyPdf(result); }).catch((reason: unknown) => { if (alive) setError(errorMessage(reason)); });
    return () => { alive = false; if (task) void task.destroy(); };
  }, [file]);
  return { document, error };
}

function PdfThumbnail({ document, pageNumber, selected, onClick, disabled = false }: { document: PDFDocumentProxy; pageNumber: number; selected?: boolean; onClick?: () => void; disabled?: boolean }) {
  const [renderError,setRenderError]=useState(''); const [retry,setRetry]=useState(0);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    const button = buttonRef.current;
    if (!button || typeof IntersectionObserver === 'undefined') { setVisible(true); return undefined; }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) { setVisible(true); observer.disconnect(); }
    }, { rootMargin: '240px' });
    observer.observe(button);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    let alive = true; let renderTask: ReturnType<PDFPageProxy['render']> | undefined; const canvas = canvasRef.current;
    if (!canvas || !visible) return undefined;
    setRenderError('');
    void document.getPage(pageNumber).then(async (page) => {
      if (!alive) return;
      const viewport = page.getViewport({ scale: Math.min(0.42, 172 / page.getViewport({ scale: 1 }).width) });
      canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext('2d'); if (!context) throw new Error('Canvas unavailable');
      renderTask = page.render({ canvas, canvasContext: context, viewport });
      await renderTask.promise;
    }).catch(()=>{if(alive)setRenderError(`หน้า ${pageNumber} แสดงตัวอย่างไม่ได้ แต่ไฟล์ยังอยู่`);});
    return () => { alive = false; renderTask?.cancel(); canvas.width = 0; canvas.height = 0; };
  }, [document, pageNumber, visible, retry]);
  return <button ref={buttonRef} className={`pdf-thumb${selected ? ' pdf-thumb--selected' : ''}`} type="button" onClick={()=>{if(renderError)setRetry(n=>n+1);else onClick?.();}} disabled={disabled} aria-label={`หน้า ${pageNumber}`}><canvas ref={canvasRef} />{renderError ? <span role="alert">{renderError} • แตะเพื่อลองอีกครั้ง</span>:null}<span>หน้า {pageNumber}</span></button>;
}

function PdfPagePreview({ document, pageNumber, onPlace, overlay, onAspectChange }: { document: PDFDocumentProxy; pageNumber: number; onPlace?: (x: number, y: number) => void; overlay?: ReactNode; onAspectChange?: (aspect: number) => void }) {
  const [renderError,setRenderError]=useState(''); const [retry,setRetry]=useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let alive = true; let renderTask: ReturnType<PDFPageProxy['render']> | undefined; const canvas = canvasRef.current;
    if (!canvas) return undefined;
    setRenderError('');
    void document.getPage(pageNumber).then(async (page) => {
      if (!alive) return;
      const base = page.getViewport({ scale: 1 }); const viewport = page.getViewport({ scale: Math.min(1.15, 690 / base.width) });
      onAspectChange?.(viewport.width / viewport.height);
      canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext('2d'); if (!context) throw new Error('Canvas unavailable');
      renderTask = page.render({ canvas, canvasContext: context, viewport });
      await renderTask.promise;
    }).catch(()=>{if(alive)setRenderError(`หน้า ${pageNumber} แสดงตัวอย่างไม่ได้ แต่ไฟล์ยังอยู่`);});
    return () => { alive = false; renderTask?.cancel(); canvas.width = 0; canvas.height = 0; };
  }, [document, pageNumber, onAspectChange, retry]);
  const place = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!onPlace) return; const rect = event.currentTarget.getBoundingClientRect();
    onPlace(Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)));
  };
  return <div className={`pdf-page-preview${onPlace ? ' pdf-page-preview--place' : ''}`}><canvas ref={canvasRef} onPointerDown={renderError?undefined:place} />{renderError?<p role="alert">{renderError} <button type="button" onClick={()=>setRetry(n=>n+1)}>ลองอีกครั้ง</button></p>:null}{overlay ? <div className="pdf-page-overlay">{overlay}</div> : null}</div>;
}

function ErrorNote({ message }: { message: string }) { return message ? <p className="tool-error" role="alert">{message}</p> : null; }

function MergePdfTool({ onDirtyChange }: Pick<PdfToolsProps, 'onDirtyChange'>) {
  interface PdfItem { id: string; file: File; pages?: number; error?: string }
  const [items, setItems] = useState<PdfItem[]>([]); const [busy, setBusy] = useState(false); const [result, setResult] = useState<Blob>(); const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(false); const [progress, setProgress] = useState(0); const runId = useRunId();
  const add = (files: File[]) => {
    if (busy) return;
    try{assertBatchBudget([...items.map(i=>i.file),...files],10);}catch(reason){setError(errorMessage(reason));return;}
    setItems((old) => [...old, ...files.map((file) => ({ id: crypto.randomUUID(), file }))]); setResult(undefined); setError(''); onDirtyChange(true);
    for (const file of files) void loadPdf(file).then((doc) => { setItems((old) => old.map((item) => item.file === file ? { ...item, pages: doc.numPages } : item)); void destroyPdf(doc); }).catch((reason: unknown) => setItems((old) => old.map((item) => item.file === file ? { ...item, error: errorMessage(reason) } : item)));
  };
  const move = (index: number, direction: -1 | 1) => { setItems((old) => { const next = [...old]; const target = index + direction; if (target < 0 || target >= next.length) return old; [next[index], next[target]] = [next[target], next[index]]; return next; }); setResult(undefined); };
  const remove = (id: string) => { setItems((old) => old.filter((item) => item.id !== id)); setResult(undefined); };
  const reset = () => { runId.current += 1; setItems([]); setResult(undefined); setError(''); setProgress(0); setConfirm(false); onDirtyChange(false); };
  const process = async () => {
    if (items.length < 2 || items.some((item) => item.error) || busy) return;
    const run = ++runId.current; setBusy(true); setError(''); setProgress(0);
    try {
      const inputs = await Promise.all(items.map(async ({ file }) => new Uint8Array(await file.arrayBuffer())));
      const bytes = await mergePdfBytes(inputs, setProgress, () => runId.current !== run);
      if (runId.current === run) setResult(pdfBlob(bytes));
    } catch (reason) { if (runId.current === run) setError(errorMessage(reason)); }
    finally { setBusy(false); }
  };
  return <>
    <FileDropzone disabled={busy} accept="application/pdf,.pdf" multiple title={items.length ? 'เพิ่มไฟล์ PDF' : 'เลือกไฟล์ PDF หลายไฟล์'} description="ไฟล์จะถูกรวมตามลำดับที่แสดงด้านล่าง" onFiles={add} compact={items.length > 0} />
    {items.length ? <>
      <div className="pdf-file-list">{items.map((item, index) => <div className="pdf-file-row" key={item.id}><span className="pdf-file-pages">{item.pages ?? '…'}<small>หน้า</small></span><div className="batch-name"><strong>{item.file.name}</strong><small>{formatBytes(item.file.size)}{item.error ? ` • ${item.error}` : ''}</small></div><div className="pdf-order-actions"><button className="icon-button" type="button" aria-label={`เลื่อน ${item.file.name} ขึ้น`} disabled={index === 0 || busy} onClick={() => move(index, -1)}><ArrowUp size={15} /></button><button className="icon-button" type="button" aria-label={`เลื่อน ${item.file.name} ลง`} disabled={index === items.length - 1 || busy} onClick={() => move(index, 1)}><ArrowDown size={15} /></button><button className="icon-button" type="button" aria-label={`ลบ ${item.file.name}`} disabled={busy} onClick={() => remove(item.id)}><Trash2 size={15} /></button></div></div>)}</div>
      <div className="tool-action-row">{busy ? <><div className="tool-progress"><div className="tool-progress-copy"><span>กำลังรวม PDF</span><span>{progress}%</span></div><progress max={100} value={progress} /></div><button className="button button--quiet" type="button" onClick={() => setConfirm(true)}><X size={15} /> ยกเลิก</button></> : <><button className="button button--primary" type="button" disabled={items.length < 2 || items.some((item) => !item.pages || item.error)} onClick={() => void process()}><FilePlus2 size={16} /> รวม {items.length} ไฟล์</button><button className="button button--quiet" type="button" onClick={() => setConfirm(true)}><RotateCcw size={15} /> เริ่มใหม่</button></>}</div>
      <ErrorNote message={error} />
      {result ? <ResultCard title="PDF ที่รวมแล้ว" filename="pocketfile-merged.pdf" blob={result} onDownload={downloadBlob} details={[{ label: 'จำนวนไฟล์', value: `${items.length}` }, { label: 'ขนาดรวม', value: formatBytes(result.size) }]} /> : null}
    </> : null}
    {confirm ? <ConfirmDialog title={busy ? 'ยกเลิกการรวม PDF?' : 'นำไฟล์ทั้งหมดออก?'} message="หยุดที่จุดพักถัดไป ขั้นตอนที่เริ่มแล้วอาจยังทำงานต่อ กรุณารอจนเสร็จก่อนเริ่มงานใหม่ รายการและไฟล์ผลลัพธ์ที่ยังไม่ดาวน์โหลดจะถูกนำออกจากหน้านี้" confirmLabel={busy ? 'ยกเลิกงาน' : 'ล้างรายการ'} onConfirm={reset} onCancel={() => setConfirm(false)} /> : null}
  </>;
}

function PageManager({ onDirtyChange }: Pick<PdfToolsProps, 'onDirtyChange'>) {
  const [file, setFile] = useState<File>(); const { document, error: loadError } = usePdfDocument(file); const [order, setOrder] = useState<number[]>([]); const [rangeText, setRangeText] = useState('');
  const [result, setResult] = useState<Blob>(); const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [confirm, setConfirm] = useState(false); const runId = useRef(0);
  useEffect(() => { if (document) { setOrder(Array.from({ length: document.numPages }, (_, i) => i)); setRangeText(`1-${document.numPages}`); } }, [document]);
  const reset = () => { runId.current += 1; setFile(undefined); setOrder([]); setResult(undefined); setError(''); setConfirm(false); onDirtyChange(false); };
  const applyRange = () => { if (!document) return; try { setOrder(parsePageRanges(rangeText, document.numPages)); setError(''); setResult(undefined); } catch (reason) { setError(errorMessage(reason)); } };
  const toggle = (index: number) => { setOrder((old) => old.includes(index) ? old.filter((page) => page !== index) : [...old, index]); setResult(undefined); };
  const move = (index: number, offset: -1 | 1) => { setOrder((old) => { const target = index + offset; if (target < 0 || target >= old.length) return old; const next = [...old]; [next[index], next[target]] = [next[target], next[index]]; return next; }); setResult(undefined); };
  const process = async () => {
    if (!file || !order.length || busy) return; const run = ++runId.current; setBusy(true); setError('');
    try { const bytes = await exportPdfPages(new Uint8Array(await file.arrayBuffer()), order, () => runId.current !== run); if (runId.current === run) setResult(pdfBlob(bytes)); }
    catch (reason) { if (runId.current === run) setError(errorMessage(reason)); } finally { setBusy(false); }
  };
  return <>
    {!file ? <FileDropzone disabled={busy} accept="application/pdf,.pdf" title="เลือก PDF เพื่อจัดการหน้า" description="แสดงตัวอย่างแต่ละหน้า เลือกเก็บ ลบ หรือเรียงใหม่" onFiles={(files) => { setFile(files[0]); onDirtyChange(true); setError(''); }} /> : <>
      <div className="tool-file-line"><div><strong>{file.name}</strong><span>{document ? `${document.numPages} หน้า` : 'กำลังอ่าน PDF…'} • {formatBytes(file.size)}</span></div><button className="icon-button" type="button" aria-label="เริ่มใหม่" disabled={busy} onClick={() => setConfirm(true)}><X size={17} /></button></div>
      {document ? <>
        <div className="page-range-control"><label className="tool-field"><span>ช่วงหน้าที่ต้องการเก็บ (เช่น 1–5, 8, 10–12)</span><input value={rangeText} onChange={(event) => setRangeText(event.target.value)} disabled={busy} /></label><button className="button button--quiet" type="button" disabled={busy} onClick={applyRange}>ใช้ช่วงหน้า</button></div>
        <p className="tool-hint">แตะภาพเพื่อเลือกหรือยกเลิกหน้า แล้วเลื่อนลำดับด้วยปุ่มลูกศร</p>
        <div className="pdf-thumb-grid pdf-thumb-grid--manager">{order.map((pageIndex, orderedAt) => <div className="pdf-page-item" key={pageIndex}><PdfThumbnail document={document} pageNumber={pageIndex + 1} selected disabled={busy} onClick={() => toggle(pageIndex)} /><div className="pdf-page-actions"><button className="icon-button" type="button" aria-label={`เลื่อนหน้า ${pageIndex + 1} ขึ้น`} disabled={busy || orderedAt === 0} onClick={() => move(orderedAt, -1)}><ArrowUp size={14} /></button><button className="icon-button" type="button" aria-label={`เลื่อนหน้า ${pageIndex + 1} ลง`} disabled={busy || orderedAt === order.length - 1} onClick={() => move(orderedAt, 1)}><ArrowDown size={14} /></button><button className="icon-button" type="button" aria-label={`ลบหน้า ${pageIndex + 1}`} disabled={busy} onClick={() => toggle(pageIndex)}><Trash2 size={14} /></button></div></div>)}
          {Array.from({ length: document.numPages }, (_, index) => index).filter((index) => !order.includes(index)).map((pageIndex) => <div className="pdf-page-item pdf-page-item--removed" key={pageIndex}><PdfThumbnail document={document} pageNumber={pageIndex + 1} disabled={busy} onClick={() => toggle(pageIndex)} /><span>แตะเพื่อเก็บหน้านี้</span></div>)}
        </div>
        <div className="tool-action-row">{busy ? <><span className="tool-status"><LoaderCircle className="spin" size={15} /> กำลังจัดหน้า PDF…</span><button className="button button--quiet" type="button" onClick={() => setConfirm(true)}><X size={15} /> ยกเลิก</button></> : <><button className="button button--primary" type="button" disabled={!order.length} onClick={() => void process()}><FilePlus2 size={16} /> ส่งออก {order.length} หน้า</button><button className="button button--quiet" type="button" onClick={() => setConfirm(true)}><RotateCcw size={15} /> เริ่มใหม่</button></>}</div>
      </> : null}
      <ErrorNote message={error || loadError} />
      {result ? <ResultCard title="PDF ที่จัดหน้าแล้ว" filename={outputFileName(file.name, 'pdf', 'pages')} blob={result} onDownload={downloadBlob} details={[{ label: 'หน้าที่เก็บ', value: `${order.length} จาก ${document?.numPages ?? 0}` }]} /> : null}
    </>}
    {confirm ? <ConfirmDialog title={busy ? 'ยกเลิกการจัดการ PDF?' : 'เริ่มจัดการ PDF ใหม่?'} message="ขั้นตอนที่เริ่มแล้วอาจยังทำงานต่อ กรุณารอจนเสร็จก่อนเริ่มงานใหม่ งานปัจจุบันและไฟล์ผลลัพธ์ที่ยังไม่ดาวน์โหลดจะถูกล้าง" confirmLabel={busy ? 'ยกเลิกงาน' : 'เริ่มใหม่'} onConfirm={reset} onCancel={() => setConfirm(false)} /> : null}
  </>;
}

interface SignPlacement { id: string; page: number; x: number; y: number; width: number; image: string }
interface SignDrag { index: number; startX: number; startY: number; originX: number; originY: number }

function QuickSign({ onDirtyChange }: Pick<PdfToolsProps, 'onDirtyChange'>) {
  const [file, setFile] = useState<File>(); const { document, error: loadError } = usePdfDocument(file); const [page, setPage] = useState(0); const [signature, setSignature] = useState('');
  const [position, setPosition] = useState({ x: 0.56, y: 0.7 }); const [width, setWidth] = useState(0.26); const [pageAspect, setPageAspect] = useState(1); const [placements, setPlacements] = useState<SignPlacement[]>([]);
  const [result, setResult] = useState<Blob>(); const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [confirm, setConfirm] = useState(false); const signatureCanvas = useRef<HTMLCanvasElement>(null); const drawing = useRef(false); const hasInk = useRef(false); const dragSign = useRef<SignDrag | undefined>(undefined); const runId = useRef(0);
  const resultFile = useMemo(() => result ? new File([result], 'signed.pdf', { type: 'application/pdf' }) : undefined, [result]);
  const outputDoc = usePdfDocument(resultFile);
  const currentPage = Math.min(page, Math.max(0, (document?.numPages ?? 1) - 1));
  const clearSignature = () => { const canvas = signatureCanvas.current; if (canvas) canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height); setSignature(''); hasInk.current = false; };
  const point = (event: ReactPointerEvent<HTMLCanvasElement>) => { const rect = event.currentTarget.getBoundingClientRect(); return { x: (event.clientX - rect.left) * (event.currentTarget.width / rect.width), y: (event.clientY - rect.top) * (event.currentTarget.height / rect.height) }; };
  const penDown = (event: ReactPointerEvent<HTMLCanvasElement>) => { if (busy) return; const context = event.currentTarget.getContext('2d'); if (!context) return; drawing.current = true; event.currentTarget.setPointerCapture(event.pointerId); const p = point(event); context.beginPath(); context.fillStyle='#18365f'; context.arc(p.x,p.y,2,0,Math.PI*2); context.fill(); hasInk.current=true; context.beginPath(); context.moveTo(p.x, p.y); context.lineWidth = 4; context.lineCap = 'round'; context.lineJoin = 'round'; context.strokeStyle = '#18365f'; };
  const penMove = (event: ReactPointerEvent<HTMLCanvasElement>) => { if (busy || !drawing.current) return; const context = event.currentTarget.getContext('2d'); if (!context) return; const p = point(event); context.lineTo(p.x, p.y); context.stroke(); hasInk.current = true; };
  const penUp = (event: ReactPointerEvent<HTMLCanvasElement>) => { drawing.current = false; if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId); const canvas = signatureCanvas.current; if (canvas && hasInk.current) setSignature(canvas.toDataURL('image/png')); };
  const reset = () => { runId.current += 1; setFile(undefined); setSignature(''); setPlacements([]); setResult(undefined); setError(''); setPage(0); setConfirm(false); hasInk.current = false; onDirtyChange(false); clearSignature(); };
  const addPlacement = () => { if (!signature || busy) return; const maxY = Math.max(0, 1 - width * pageAspect * (180 / 600)); setPlacements((old) => [...old, { id: crypto.randomUUID(), page: currentPage, x: Math.min(1 - width, position.x), y: Math.min(maxY, position.y), width, image: signature }]); setResult(undefined); };
  const signPointerDown = (index: number, event: ReactPointerEvent<HTMLImageElement>) => {
    event.stopPropagation(); if(busy)return; const stage = event.currentTarget.parentElement?.getBoundingClientRect(); if (!stage) return;
    const x = (event.clientX - stage.left) / stage.width; const y = (event.clientY - stage.top) / stage.height;
    dragSign.current = { index, startX: x, startY: y, originX: placements[index]?.x ?? 0, originY: placements[index]?.y ?? 0 };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const signPointerMove = (event: ReactPointerEvent<HTMLImageElement>) => {
    if(busy)return; const drag = dragSign.current; const stage = event.currentTarget.parentElement?.getBoundingClientRect(); if (!drag || !stage) return;
    const x = Math.max(0, Math.min(1 - (placements[drag.index]?.width ?? width), drag.originX + (event.clientX - stage.left) / stage.width - drag.startX));
    const itemWidth = placements[drag.index]?.width ?? width;
    const maxY = Math.max(0, 1 - itemWidth * (stage.width / stage.height) * (180 / 600));
    const y = Math.max(0, Math.min(maxY, drag.originY + (event.clientY - stage.top) / stage.height - drag.startY));
    setPlacements((old) => old.map((item, index) => index === drag.index ? { ...item, x, y } : item)); setResult(undefined);
  };
  const signPointerUp = (event: ReactPointerEvent<HTMLImageElement>) => { dragSign.current = undefined; if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId); };
  const process = async () => {
    if (!file || !placements.length || busy || drawing.current || dragSign.current) return; const run = ++runId.current; setBusy(true); setError('');
    try {
      const viewports = new Map<number, ReturnType<PDFPageProxy['getViewport']>>();
      for (const pageIndex of new Set(placements.map((placement) => placement.page))) {
        if (runId.current !== run || !document) return;
        const pageProxy = await document.getPage(pageIndex + 1);
        viewports.set(pageIndex, pageProxy.getViewport({ scale: 1 }));
      }
      const marks = placements.map(({ page, x, y, width: markWidth, image }) => ({
        pageIndex: page, x, y, width: markWidth, dataUrl: image, imageWidth: 600, imageHeight: 180,
      }));
      const bytes = await addPdfSignatures(new Uint8Array(await file.arrayBuffer()), marks, viewports, () => runId.current !== run);
      if (runId.current === run) setResult(pdfBlob(bytes));
    } catch (reason) { if (runId.current === run) setError(errorMessage(reason)); } finally { setBusy(false); }
  };
  const overlay = placements.map((item, index) => ({ item, index })).filter(({ item }) => item.page === currentPage).map(({ item, index }) => <img key={item.id} draggable={false} aria-disabled={busy} tabIndex={busy?-1:0} onKeyDown={event=>{if(busy||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();const dx=event.key==='ArrowLeft'?-.01:event.key==='ArrowRight'?.01:0;const dy=event.key==='ArrowUp'?-.01:event.key==='ArrowDown'?.01:0;setPlacements(old=>old.map(p=>p.id===item.id?{...p,x:Math.max(0,Math.min(1-p.width,p.x+dx)),y:Math.max(0,Math.min(1-p.width*pageAspect*.3,p.y+dy))}:p));setResult(undefined);}} className="pdf-sign-overlay" src={item.image} alt={`ลายเซ็นตำแหน่ง ${index + 1}`} onPointerDown={(event) => signPointerDown(index, event)} onPointerMove={signPointerMove} onPointerUp={signPointerUp} onPointerCancel={signPointerUp} onLostPointerCapture={()=>{dragSign.current=undefined;}} style={{ left: `${item.x * 100}%`, top: `${item.y * 100}%`, width: `${item.width * 100}%` }} />);
  return <>
    {!file ? <FileDropzone disabled={busy} accept="application/pdf,.pdf" title="เลือก PDF ที่ต้องการเซ็น" description="ลายเซ็นจะถูกวาดเป็นภาพและฝังบนหน้าเอกสาร" onFiles={(files) => { setFile(files[0]); onDirtyChange(true); setError(''); }} /> : <>
      <div className="tool-file-line"><div><strong>{file.name}</strong><span>{document ? `${document.numPages} หน้า` : 'กำลังอ่าน PDF…'}</span></div><button className="icon-button" type="button" aria-label="เริ่มใหม่" disabled={busy} onClick={() => setConfirm(true)}><X size={17} /></button></div>
      <div className="sign-warning"><strong>ลายเซ็นภาพเท่านั้น</strong><p>นี่คือภาพลายเซ็นที่วางลงบน PDF ไม่ใช่ Digital Signature ที่ยืนยันตัวตนด้วยใบรับรองทางคริปโตกราฟี</p></div>
      {document ? <div className="sign-layout">
        <div className="sign-preview-column"><div className="sign-page-nav"><button className="icon-button" type="button" disabled={currentPage === 0 || busy} onClick={() => setPage(currentPage - 1)} aria-label="หน้าก่อนหน้า"><ArrowUp className="rotate-left" size={16} /></button><span>หน้า {currentPage + 1} / {document.numPages}</span><button className="icon-button" type="button" disabled={currentPage >= document.numPages - 1 || busy} onClick={() => setPage(currentPage + 1)} aria-label="หน้าถัดไป"><ArrowDown className="rotate-right" size={16} /></button></div><PdfPagePreview document={document} pageNumber={currentPage + 1} onPlace={(x, y) => { if (!busy) { const maxY = Math.max(0, 1 - width * pageAspect * (180 / 600)); setPosition({ x: Math.min(1 - width, x), y: Math.min(maxY, y) }); } }} onAspectChange={setPageAspect} overlay={overlay} /><small>แตะหน้ากระดาษเพื่อเลือกตำแหน่ง • ลากลายเซ็นที่วางแล้วเพื่อขยับ</small></div>
        <div className="sign-controls"><div className="tool-field"><span>วาดลายเซ็น</span><canvas ref={signatureCanvas} className="signature-canvas" width={600} height={180} onPointerDown={penDown} onPointerMove={penMove} aria-label="วาดลายเซ็นด้วยเมาส์หรือนิ้ว" onPointerUp={penUp} onPointerCancel={penUp} /><small>ใช้เมาส์หรือนิ้ววาด</small></div><div className="tool-action-row"><button className="button button--quiet" type="button" disabled={busy} onClick={clearSignature}><RotateCcw size={14} /> ล้างลายเซ็น</button><button className="button button--primary" type="button" disabled={busy || !signature} onClick={addPlacement}><Plus size={15} /> วางลายเซ็นหน้านี้</button></div><label className="tool-field"><span>ขนาดลายเซ็น <b>{Math.round(width * 100)}% ของความกว้างหน้า</b></span><input type="range" min="0.12" max="0.55" step="0.01" value={width} disabled={busy} onChange={(event) => { const nextWidth = Number(event.target.value); const maxY = Math.max(0, 1 - nextWidth * pageAspect * (180 / 600)); setWidth(nextWidth); setPosition((old) => ({ x: Math.min(old.x, 1 - nextWidth), y: Math.min(old.y, maxY) })); }} /></label><p className="tool-hint">ตำแหน่งที่เลือก: {Math.round(position.x * 100)}% × {Math.round(position.y * 100)}% จากมุมซ้ายบน</p>
          {placements.length ? <div className="sign-placement-list"><strong>ตำแหน่งลายเซ็น ({placements.length})</strong>{placements.map((placement, index) => <div key={index}><span>หน้า {placement.page + 1} • {Math.round(placement.x * 100)}%, {Math.round(placement.y * 100)}%</span><button className="icon-button" type="button" disabled={busy} aria-label={`ลบลายเซ็น ${index + 1}`} onClick={() => { setPlacements((old) => old.filter((_, i) => i !== index)); setResult(undefined); }}><Trash2 size={14} /></button></div>)}</div> : null}
        </div>
      </div> : null}
      <div className="tool-action-row">{busy ? <><span className="tool-status"><LoaderCircle className="spin" size={15} /> กำลังฝังลายเซ็น…</span><button className="button button--quiet" type="button" onClick={() => setConfirm(true)}><X size={15} /> ยกเลิก</button></> : <><button className="button button--primary" type="button" disabled={!placements.length} onClick={() => void process()}><FilePlus2 size={16} /> บันทึก PDF ที่เซ็นแล้ว</button><button className="button button--quiet" type="button" onClick={() => setConfirm(true)}><RotateCcw size={15} /> เริ่มใหม่</button></>}</div>
      <ErrorNote message={error || loadError} />
      {result ? <><p className="verification-note verification-note--ok">ลายเซ็นที่วางถูกฝังเป็นภาพใน PDF ใหม่แล้ว</p>{outputDoc.document ? <div className="signed-preview"><strong>ตัวอย่าง PDF ผลลัพธ์ • หน้า {currentPage+1}</strong><PdfPagePreview document={outputDoc.document} pageNumber={currentPage+1} /></div> : null}<ResultCard title="PDF ที่ฝังลายเซ็นแล้ว" filename={outputFileName(file.name, 'pdf', 'signed')} blob={result} onDownload={downloadBlob} details={[{ label: 'ตำแหน่งลายเซ็น', value: `${placements.length}` }, { label: 'หน้าเอกสาร', value: `${document?.numPages ?? 0}` }]} /></> : null}
    </>}
    {confirm ? <ConfirmDialog title={busy ? 'ยกเลิกการเซ็น PDF?' : 'เริ่มเซ็น PDF ใหม่?'} message="ขั้นตอนที่เริ่มแล้วอาจยังทำงานต่อ กรุณารอจนเสร็จก่อนเริ่มงานใหม่ ลายเซ็นและ PDF ผลลัพธ์ที่ยังไม่ดาวน์โหลดจะถูกล้าง" confirmLabel={busy ? 'ยกเลิกงาน' : 'เริ่มใหม่'} onConfirm={reset} onCancel={() => setConfirm(false)} /> : null}
  </>;
}

function PrintLayout({ onDirtyChange }: Pick<PdfToolsProps, 'onDirtyChange'>) {
  const [file, setFile] = useState<File>(); const { document, error: loadError } = usePdfDocument(file); const [pagesPerSheet, setPagesPerSheet] = useState<PrintLayoutOptions['pagesPerSheet']>(2); const [orientation, setOrientation] = useState<PrintLayoutOptions['orientation']>('portrait'); const [margin, setMargin] = useState(8);
  const [result, setResult] = useState<Blob>(); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [progress, setProgress] = useState(0); const [confirm, setConfirm] = useState(false); const runId = useRef(0);
  const [sheet,setSheet]=useState(1);
  const resultFile=useMemo(()=>result?new File([result],'print.pdf',{type:'application/pdf'}):undefined,[result]);
  const output=usePdfDocument(resultFile);
  useEffect(()=>setSheet(1),[result]);
  const layout = getSheetLayout(pagesPerSheet, orientation, margin);
  const reset = () => { runId.current += 1; setFile(undefined); setResult(undefined); setError(''); setProgress(0); setConfirm(false); onDirtyChange(false); };
  const process = async () => {
    if (!file || !document || busy) return; const run = ++runId.current; setBusy(true); setError(''); setProgress(0);
    try {
      const bytes = await createPrintLayoutPdf(new Uint8Array(await file.arrayBuffer()), { pagesPerSheet, orientation, marginMm: margin }, setProgress, () => runId.current !== run);
      if (runId.current === run) setResult(pdfBlob(bytes));
    } catch (reason) { if (runId.current === run) setError(errorMessage(reason)); } finally { setBusy(false); }
  };
  return <>
    {!file ? <FileDropzone disabled={busy} accept="application/pdf,.pdf" title="เลือก PDF ที่ต้องการจัดหน้าพิมพ์" description="เลือกจำนวนหน้าต่อแผ่น A4 และระยะขอบ" onFiles={(files) => { setFile(files[0]); onDirtyChange(true); setError(''); }} /> : <>
      <div className="tool-file-line"><div><strong>{file.name}</strong><span>{document ? `${document.numPages} หน้า` : 'กำลังอ่าน PDF…'} • {formatBytes(file.size)}</span></div><button className="icon-button" type="button" aria-label="เริ่มใหม่" disabled={busy} onClick={() => setConfirm(true)}><X size={17} /></button></div>
      <div className="tool-controls">
        <label className="tool-field"><span>หน้าต่อแผ่น</span><select value={pagesPerSheet} disabled={busy} onChange={(event) => { setPagesPerSheet(Number(event.target.value) as typeof pagesPerSheet); setResult(undefined); }}><option value={1}>1 หน้า</option><option value={2}>2 หน้า</option><option value={4}>4 หน้า</option><option value={6}>6 หน้า</option></select></label>
        <label className="tool-field"><span>แนวกระดาษ</span><select value={orientation} disabled={busy} onChange={(event) => { setOrientation(event.target.value as typeof orientation); setResult(undefined); }}><option value="portrait">แนวตั้ง</option><option value="landscape">แนวนอน</option></select></label>
        <label className="tool-field"><span>ระยะขอบ <b>{margin} มม.</b></span><input type="range" min="0" max="25" value={margin} disabled={busy} onChange={(event) => { setMargin(Number(event.target.value)); setResult(undefined); }} /></label>
      </div>
      <div className="layout-preview-section"><div><strong>ผังการจัดวาง A4 (ภาพจริงแสดงหลังสร้าง PDF)</strong><small>พื้นที่วาง {pagesPerSheet} หน้า • ขนาดจริง 210 × 297 มม.</small></div><div className={`layout-sheet layout-sheet--${orientation}`} style={{ aspectRatio: `${layout.width} / ${layout.height}` }}>{layout.slots.map((slot, index) => <div key={index} className="layout-slot" style={{ left: `${slot.x / layout.width * 100}%`, top: `${(layout.height - slot.y - slot.height) / layout.height * 100}%`, width: `${slot.width / layout.width * 100}%`, height: `${slot.height / layout.height * 100}%` }}><span>{index + 1}</span></div>)}</div></div>
      <div className="tool-action-row">{busy ? <><div className="tool-progress"><div className="tool-progress-copy"><span>กำลังจัดหน้า PDF</span><span>{progress}%</span></div><progress max={100} value={progress} /></div><button className="button button--quiet" type="button" onClick={() => setConfirm(true)}><X size={15} /> ยกเลิก</button></> : <><button className="button button--primary" type="button" disabled={!document} onClick={() => void process()}><FilePlus2 size={16} /> สร้าง PDF สำหรับพิมพ์</button><button className="button button--quiet" type="button" onClick={() => setConfirm(true)}><RotateCcw size={15} /> เริ่มใหม่</button></>}</div>
      <ErrorNote message={error || loadError} />
      {result ? <>{output.document ? <div className="signed-preview"><div className="sign-page-nav"><button className="button button--quiet" disabled={sheet<=1} onClick={()=>setSheet(sheet-1)}>แผ่นก่อนหน้า</button><span>แผ่น {sheet} / {output.document.numPages}</span><button className="button button--quiet" disabled={sheet>=output.document.numPages} onClick={()=>setSheet(sheet+1)}>แผ่นถัดไป</button></div><PdfPagePreview document={output.document} pageNumber={sheet}/></div>:null}<ErrorNote message={output.error}/><p className="tool-output-size">{document?.numPages ?? 0} หน้า → {Math.ceil((document?.numPages ?? 0) / pagesPerSheet)} แผ่น A4</p><ResultCard title="PDF ที่จัดหน้าพิมพ์แล้ว" filename={outputFileName(file.name, 'pdf', 'nup')} blob={result} onDownload={downloadBlob} details={[{ label: 'หน้าต่อแผ่น', value: `${pagesPerSheet}` }, { label: 'แนวกระดาษ', value: orientation === 'portrait' ? 'ตั้ง' : 'นอน' }, { label: 'ขนาดผลลัพธ์', value: formatBytes(result.size) }]} /></> : null}
    </>}
    {confirm ? <ConfirmDialog title={busy ? 'ยกเลิกการจัดหน้าพิมพ์?' : 'เริ่มจัดหน้าพิมพ์ใหม่?'} message="ขั้นตอนที่เริ่มแล้วอาจยังทำงานต่อ กรุณารอจนเสร็จก่อนเริ่มงานใหม่ งานปัจจุบันและไฟล์ PDF ผลลัพธ์ที่ยังไม่ดาวน์โหลดจะถูกล้าง" confirmLabel={busy ? 'ยกเลิกงาน' : 'เริ่มใหม่'} onConfirm={reset} onCancel={() => setConfirm(false)} /> : null}
  </>;
}

export function PdfTools({ toolId, onDirtyChange }: PdfToolsProps) {
  if (toolId === 'merge-pdf') return <MergePdfTool onDirtyChange={onDirtyChange} />;
  if (toolId === 'pages') return <PageManager onDirtyChange={onDirtyChange} />;
  if (toolId === 'sign') return <QuickSign onDirtyChange={onDirtyChange} />;
  if (toolId === 'print-layout') return <PrintLayout onDirtyChange={onDirtyChange} />;
  return null;
}

function errorMessage(reason: unknown) { return userError(reason); }
function pdfBlob(bytes: Uint8Array): Blob { const copy = new Uint8Array(bytes.byteLength); copy.set(bytes); return new Blob([copy.buffer], { type: 'application/pdf' }); }
