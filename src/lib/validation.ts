export const IMAGE_BYTES = 25 * 1024 * 1024;
export const PDF_BYTES = 50 * 1024 * 1024;
export const MAX_PDF_PAGES = 150;
export const MAX_BATCH_BYTES = 100 * 1024 * 1024;

export function validateDimensions(w: string | number, h: string | number) {
  const width = Number(w), height = Number(h);
  if (![width,height].every(v=>Number.isInteger(v) && v>=1 && v<=12000) || width*height>40000000) {
    throw new Error('กว้างและสูงต้องเป็นจำนวนเต็ม 1–12,000 px และรวมไม่เกิน 40 ล้านพิกเซล');
  }
  return {width,height};
}
export function validateTarget(kb: number) {
  if (!Number.isFinite(kb) || kb<1 || kb>100000) throw new Error('ขนาดเป้าหมายต้องอยู่ระหว่าง 1–100,000 KB');
  return kb*1024;
}
export function assertBatchBudget(files: {size:number}[], maxCount=20) {
  if (files.length>maxCount || files.reduce((n,f)=>n+f.size,0)>MAX_BATCH_BYTES) throw new Error(`เลือกได้ไม่เกิน ${maxCount} ไฟล์ รวมไม่เกิน 100 MB`);
}
export function readBlob(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer==='function') return blob.arrayBuffer();
  return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result as ArrayBuffer);r.onerror=()=>reject(new Error('อ่านไฟล์ไม่ได้'));r.readAsArrayBuffer(blob);});
}
export async function validateFile(file: File, kind: 'image'|'pdf') {
  if (!file.size) throw new Error('ไฟล์ว่าง กรุณาเลือกไฟล์ใหม่');
  if (file.size>(kind==='pdf'?PDF_BYTES:IMAGE_BYTES)) throw new Error(`ไฟล์ใหญ่เกินกำหนด: ${kind==='pdf'?50:25} MB ต่อไฟล์`);
  const b=new Uint8Array(await readBlob(file.slice(0,65536)));
  const text=(at:number,n:number)=>String.fromCharCode(...b.slice(at,at+n));
  if(kind==='pdf') {if(text(0,5)!=='%PDF-') throw new Error('เนื้อไฟล์ไม่ใช่ PDF ที่รองรับ');return;}
  const png=b[0]===137&&text(1,3)==='PNG'&&b.length>=24;
  const jpg=b[0]===255&&b[1]===216&&b[2]===255;
  const webp=text(0,4)==='RIFF'&&text(8,4)==='WEBP';
  const heic=text(4,4)==='ftyp'&&/heic|heix|hevc|hevx|mif1|msf1/.test(text(8,24));
  const ext=file.name.split('.').pop()?.toLowerCase();
  const format=png?'png':jpg?'jpg':webp?'webp':heic?'heic':null;
  const expected=ext==='jpeg'?'jpg':ext==='heif'?'heic':ext;
  if(!format || (['png','jpg','webp','heic'].includes(expected||'')&&format!==expected)) throw new Error('เนื้อไฟล์ไม่ตรงกับรูปภาพ JPG, PNG, WebP หรือ HEIC ที่รองรับ');
  let width=0,height=0;
  const d=new DataView(b.buffer);
  if(png){width=d.getUint32(16);height=d.getUint32(20);}
  if(jpg){for(let at=2;at+9<b.length;){if(b[at++]!==255)break;const marker=b[at++];if(marker===0xda||marker===0xd9)break;const len=d.getUint16(at);if(len<2)break;if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)){height=d.getUint16(at+3);width=d.getUint16(at+5);break;}at+=len;}}
  if(webp&&text(12,4)==='VP8X'&&b.length>=30){width=1+b[24]+(b[25]<<8)+(b[26]<<16);height=1+b[27]+(b[28]<<8)+(b[29]<<16);}
  if(width||height) validateDimensions(width,height);
}
export function checkCancelled(signal?:AbortSignal){if(signal?.aborted)throw new DOMException('ยกเลิกงานแล้ว','AbortError');}

export function userError(reason: unknown): string {
  const message=reason instanceof Error?reason.message:String(reason);
  if(/[ก-๙]/.test(message))return message;
  if(/password|encrypt/i.test(message))return 'PDF นี้มีรหัสผ่าน กรุณาปลดล็อกไฟล์ก่อน';
  if(/page range|between 1 and|page number/i.test(message))return 'ช่วงหน้าไม่ถูกต้อง กรุณาระบุหมายเลขหน้าที่มีในเอกสาร';
  if(/HEIC|HEIF/i.test(message))return 'เปิด HEIC/HEIF นี้ไม่ได้ กรุณาแปลงเป็น JPG ก่อน';
  if(/large|dimensions|positive|size/i.test(message))return 'ขนาดภาพไม่ถูกต้องหรือใหญ่เกินขีดจำกัด กรุณาลดขนาด';
  return 'อ่านหรือส่งออกไฟล์ไม่ได้ ไฟล์อาจเสียหายหรือเบราว์เซอร์ไม่รองรับ กรุณาเลือกไฟล์ใหม่';
}
