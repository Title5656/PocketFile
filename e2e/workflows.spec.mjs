import {test,expect} from '@playwright/test';
import {PDFDocument,rgb,degrees} from 'pdf-lib';
import {PNG} from 'pngjs';
import jpeg from 'jpeg-js';
import JSZip from 'jszip';
import fs from 'node:fs/promises';

function picture(name='photo.png'){
  const p=new PNG({width:160,height:120});
  for(let y=0;y<120;y++)for(let x=0;x<160;x++){let i=(y*160+x)*4;p.data[i]=x;p.data[i+1]=y;p.data[i+2]=180;p.data[i+3]=x<20?0:255;}
  return {name,mimeType:'image/png',buffer:PNG.sync.write(p)};
}
async function pdf(count=3,rotation=0,crop=false){
  const d=await PDFDocument.create();
  for(let i=0;i<count;i++){const p=d.addPage([300+i*10,400]);p.drawRectangle({x:40,y:50,width:40,height:40,color:rgb(1,0,0)});p.setRotation(degrees(rotation));if(crop)p.setCropBox(20,30,240,320);}
  return {name:'source.pdf',mimeType:'application/pdf',buffer:Buffer.from(await d.save())};
}
async function open(page,id){await page.goto(`#${id}`);await expect(page.getByLabel('เลือกไฟล์')).toBeAttached();}
async function upload(page,files){await page.getByLabel('เลือกไฟล์').setInputFiles(files);}
async function exported(page,name='ดาวน์โหลดไฟล์'){
  const waiting=page.waitForEvent('download');await page.getByRole('button',{name,exact:true}).click();
  const d=await waiting;expect(d.suggestedFilename()).not.toBe('photo.png');return fs.readFile(await d.path());
}
async function invalid(page,id){
  await open(page,id);const isPdf=['merge-pdf','pages','sign','print-layout'].includes(id);
  await upload(page,{name:isPdf?'fake.pdf':'fake.png',mimeType:isPdf?'application/pdf':'image/png',buffer:Buffer.from('not a real file')});
  await expect(page.getByRole('alert')).toContainText('เนื้อไฟล์');
}
function inkBounds(bytes){
  const p=PNG.sync.read(bytes);let left=p.width,top=p.height,right=-1,bottom=-1;
  for(let y=0;y<p.height;y++)for(let x=0;x<p.width;x++){const i=(y*p.width+x)*4;
    if(p.data[i]<170&&p.data[i+2]>p.data[i]+20&&p.data[i+2]>p.data[i+1]+15&&p.data[i+2]<220){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}}
  expect(right).toBeGreaterThan(left);return [left/p.width,top/p.height,right/p.width,bottom/p.height];
}
async function sameInk(page,before){
  await expect.poll(()=>page.locator('.signed-preview canvas').evaluate(c=>{const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let n=0;for(let i=0;i<d.length;i+=4)if(d[i]<170&&d[i+2]>d[i]+20&&d[i+2]>d[i+1]+15&&d[i+2]<220)n++;return n;})).toBeGreaterThan(0);
  const actual=inkBounds(await page.locator('.signed-preview .pdf-page-preview').screenshot());
  actual.forEach((v,i)=>expect(Math.abs(v-before[i])).toBeLessThan(.02));
}
test.beforeEach(async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  page.__errors=errors;
});
test.afterEach(async({page})=>{expect(page.__errors).toEqual([]);});

test('compress: valid JPEG output, dimensions and invalid numeric settings',async({page})=>{
  await invalid(page,'compress');await upload(page,picture());
  await page.getByLabel('ความกว้าง (px)',{exact:true}).fill('0');
  await page.getByRole('button',{name:'บีบอัดรูป',exact:true}).click();await expect(page.getByRole('alert')).toContainText('จำนวนเต็ม');
  await page.getByLabel('ความกว้าง (px)',{exact:true}).fill('80');
  await page.getByRole('button',{name:'บีบอัดรูป',exact:true}).click();
  const image=jpeg.decode(await exported(page));expect(image.width).toBe(80);expect(image.height).toBe(60);
});
test('convert: PNG and transparent JPEG background decode externally',async({page})=>{
  await invalid(page,'convert');await upload(page,picture());await page.getByLabel('แปลงเป็น').selectOption('image/png');
  await page.getByRole('button',{name:'แปลงรูปภาพ',exact:true}).click();
  expect(PNG.sync.read(await exported(page)).width).toBe(160);
  await page.getByLabel('แปลงเป็น').selectOption('image/jpeg');
  await page.getByLabel('สีพื้นหลัง (เมื่อมีความโปร่งใส)').fill('#ff0000');
  await expect(page.getByRole('button',{name:'ดาวน์โหลดไฟล์',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'แปลงรูปภาพ',exact:true}).click();const image=jpeg.decode(await exported(page));
  expect(image.data[0]).toBeGreaterThan(240);expect(image.data[1]).toBeLessThan(20);expect(image.data[2]).toBeLessThan(20);
});
test('batch: unique ZIP filenames, real PNG entries, limits and mixed corrupt input',async({page})=>{
  await invalid(page,'batch');await upload(page,[picture('same.png'),picture('same.png'),{name:'broken.png',mimeType:'image/png',buffer:Buffer.concat([picture().buffer.subarray(0,24),Buffer.from('broken')])}]);
  await page.getByRole('combobox',{name:'รูปแบบ',exact:true}).selectOption('image/png');
  await page.getByRole('button',{name:'ประมวลผล 3 ไฟล์',exact:true}).click();
  await expect(page.locator('.batch-status--done')).toHaveCount(2);await expect(page.locator('.batch-status--error')).toHaveCount(1);
  const zip=await JSZip.loadAsync(await exported(page,'ดาวน์โหลด ZIP'));const files=Object.values(zip.files);expect(files).toHaveLength(2);expect(files[0].name).not.toBe(files[1].name);
  for(const f of files)expect(PNG.sync.read(await f.async('nodebuffer')).width).toBe(160);
  await upload(page,Array.from({length:21},()=>picture()));await expect(page.getByRole('alert')).toContainText('20');
});
test('id-photo: physical size, DPI headers, preview changes and invalid custom size',async({page})=>{
  await invalid(page,'id-photo');await upload(page,picture());await page.getByRole('combobox',{name:'รูปแบบไฟล์',exact:true}).selectOption('image/png');
  await page.getByRole('combobox',{name:'ขนาดรูป',exact:true}).selectOption('custom');await page.getByLabel('กว้าง (นิ้ว)').fill('0');
  await expect(page.getByRole('button',{name:'ส่งออกรูปติดบัตร',exact:true})).toBeDisabled();
  await page.getByLabel('กว้าง (นิ้ว)').fill('1');
  await page.getByRole('button',{name:'ส่งออกรูปติดบัตร',exact:true}).click();const b=await exported(page);const image=PNG.sync.read(b);
  expect([image.width,image.height]).toEqual([300,450]);
  const at=b.indexOf(Buffer.from('pHYs'));expect(at).toBeGreaterThan(0);expect(b.readUInt32BE(at+4)).toBe(11811);
  await page.getByRole('combobox',{name:'DPI',exact:true}).selectOption('150');await expect(page.getByRole('button',{name:'ดาวน์โหลดไฟล์',exact:true})).toHaveCount(0);
});
test('merge: reordered inputs preserve page sizes, blocks invalid input',async({page})=>{
  await invalid(page,'merge-pdf');const a=await pdf(2),b={...await pdf(1),name:'second.pdf'};await upload(page,[a,b]);
  await expect(page.getByRole('button',{name:'รวม 2 ไฟล์',exact:true})).toBeEnabled();
  await page.getByRole('button',{name:'เลื่อน second.pdf ขึ้น',exact:true}).click();await page.getByRole('button',{name:'รวม 2 ไฟล์',exact:true}).click();
  const d=await PDFDocument.load(await exported(page));expect(d.getPageCount()).toBe(3);expect(d.getPage(2).getWidth()).toBe(310);
});
test('pages: range order and export bytes, empty selection, invalid range',async({page})=>{
  await invalid(page,'pages');await upload(page,await pdf(3));
  const range=page.getByLabel('ช่วงหน้าที่ต้องการเก็บ (เช่น 1–5, 8, 10–12)');await range.fill('9');await page.getByRole('button',{name:'ใช้ช่วงหน้า',exact:true}).click();await expect(page.getByRole('alert')).toBeVisible();
  await range.fill('3,1');await page.getByRole('button',{name:'ใช้ช่วงหน้า',exact:true}).click();await page.getByRole('button',{name:'ส่งออก 2 หน้า',exact:true}).click();
  const d=await PDFDocument.load(await exported(page));expect(d.getPages().map(p=>p.getWidth())).toEqual([320,300]);
});
test('sign: continuous captured drag, keyboard movement, page-specific output and crop/rotation pixels',async({page})=>{
  await invalid(page,'sign');await upload(page,await pdf(2,90,true));
  const ink=page.locator('.signature-canvas');await expect(ink).toBeVisible();const box=await ink.boundingBox();
  await page.mouse.move(box.x+20,box.y+30);await page.mouse.down();await page.mouse.move(box.x+90,box.y+50,{steps:12});await page.mouse.up();
  await page.getByRole('button',{name:'หน้าถัดไป',exact:true}).click();await page.getByRole('button',{name:'วางลายเซ็นหน้านี้',exact:true}).click();
  const sign=page.locator('.pdf-sign-overlay');const before=await sign.boundingBox();
  await page.mouse.move(before.x+before.width/2,before.y+before.height/2);await page.mouse.down();
  await page.mouse.move(before.x-60+before.width/2,before.y-40+before.height/2,{steps:30});await page.mouse.up();
  const after=await sign.boundingBox();expect(after.x).toBeLessThan(before.x-40);expect(after.y).toBeLessThan(before.y-20);
  await sign.focus();await page.keyboard.press('ArrowLeft');
  const expectedInk=inkBounds(await page.locator('.sign-preview-column .pdf-page-preview').screenshot());
  await page.getByRole('button',{name:'บันทึก PDF ที่เซ็นแล้ว',exact:true}).click();
  await expect(page.getByText('ตัวอย่าง PDF ผลลัพธ์ • หน้า 2',{exact:true})).toBeVisible();
  const d=await PDFDocument.load(await exported(page));expect(d.getPageCount()).toBe(2);expect(d.getPage(1).getRotation().angle).toBe(90);expect(d.getPage(1).node.Resources().toString()).toContain('XObject');
  await sameInk(page,expectedInk);
});
for(const rotation of [0,180,270])test(`signature pixels match the editor at ${rotation} degrees with CropBox`,async({page})=>{
  await open(page,'sign');await upload(page,await pdf(1,rotation,true));
  const box=await page.locator('.signature-canvas').boundingBox();
  await page.mouse.move(box.x+30,box.y+20);await page.mouse.down();await page.mouse.move(box.x+100,box.y+55,{steps:10});await page.mouse.up();
  await page.getByRole('button',{name:'วางลายเซ็นหน้านี้',exact:true}).click();
  const before=inkBounds(await page.locator('.sign-preview-column .pdf-page-preview').screenshot());
  await page.getByRole('button',{name:'บันทึก PDF ที่เซ็นแล้ว',exact:true}).click();
  await exported(page);await sameInk(page,before);
});
test('print: actual rendered output and all N-up sheet counts',async({page})=>{
  await invalid(page,'print-layout');await upload(page,await pdf(5,90,true));
  for(const n of [1,2,4,6]){
    await page.getByRole('combobox',{name:'หน้าต่อแผ่น',exact:true}).selectOption(String(n));await page.getByRole('button',{name:'สร้าง PDF สำหรับพิมพ์',exact:true}).click();
    const d=await PDFDocument.load(await exported(page));expect(d.getPageCount()).toBe(Math.ceil(5/n));expect(d.getPage(0).getWidth()).toBeCloseTo(595.2756,2);
    await expect(page.locator('.signed-preview canvas')).toBeVisible();
  }
});
test('navigation, removed tools, keyboard modal focus, 320px layout and asset paths',async({page})=>{
  await page.goto('./');await expect(page.locator('.tool-grid .tool-card')).toHaveCount(8);
  await expect(page.getByRole('button',{name:/ดึงข้อความจากภาพ|ล้างข้อมูลรูปภาพ/})).toHaveCount(0);
  await page.keyboard.press('Control+k');await expect(page.getByRole('searchbox')).toBeFocused();
  const settings=page.getByRole('button',{name:'ตั้งค่า',exact:true});await settings.click();await expect(page.getByRole('button',{name:'ปิดหน้าต่าง',exact:true})).toBeFocused();await page.keyboard.press('Shift+Tab');await expect(page.getByRole('button',{name:'เรียบร้อย',exact:true})).toBeFocused();await page.keyboard.press('Escape');await expect(settings).toBeFocused();
  await page.getByRole('button',{name:/แปลงไฟล์รูปภาพ/}).click();await page.goBack();await expect(page.getByRole('searchbox')).toBeVisible();await page.goForward();await expect(page.getByLabel('เลือกไฟล์')).toBeAttached();
  await upload(page,picture());await page.goBack();await expect(page.getByRole('alertdialog')).toBeVisible();await page.getByRole('button',{name:'ยกเลิก',exact:true}).click();await expect(page.getByLabel('แปลงเป็น')).toBeVisible();
  await page.goBack();await expect(page.getByRole('alertdialog')).toBeVisible();await page.getByRole('button',{name:'ออกจากเครื่องมือ',exact:true}).click();await expect(page.getByRole('searchbox')).toBeVisible();
  await page.goForward();await expect(page.getByLabel('เลือกไฟล์')).toBeAttached();
  await page.setViewportSize({width:320,height:800});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  for(const img of await page.locator('img.brand-mark').all())expect(await img.evaluate(i=>i.complete&&i.naturalWidth>0)).toBe(true);
});

test('cached app and a local image conversion work offline with no file transmission',async({page,context})=>{
  const external=[];page.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:4275')&&!r.url().startsWith('blob:')&&!r.url().startsWith('data:'))external.push(r.url());});
  await page.goto('./');await page.evaluate(()=>navigator.serviceWorker.ready);await page.reload();
  await expect.poll(()=>page.evaluate(()=>Boolean(navigator.serviceWorker.controller))).toBe(true);
  await context.setOffline(true);await page.reload();await expect(page.getByRole('searchbox')).toBeVisible();
  await page.getByRole('button',{name:/แปลงไฟล์รูปภาพ/}).click();await upload(page,picture());await page.getByLabel('แปลงเป็น').selectOption('image/png');await page.getByRole('button',{name:'แปลงรูปภาพ',exact:true}).click();
  expect(PNG.sync.read(await exported(page)).height).toBe(120);expect(external).toEqual([]);await context.setOffline(false);
});

test('cancelled slow conversion stays locked until native work settles and never restores old output',async({page})=>{
  await page.addInitScript(()=>{const encode=HTMLCanvasElement.prototype.toBlob;HTMLCanvasElement.prototype.toBlob=function(callback,...args){encode.call(this,blob=>setTimeout(()=>callback(blob),800),...args);};});
  await open(page,'convert');await upload(page,picture());await page.getByLabel('แปลงเป็น').selectOption('image/png');
  await page.getByRole('button',{name:'แปลงรูปภาพ',exact:true}).click();await page.getByRole('button',{name:'ยกเลิก',exact:true}).click();
  await page.getByRole('alertdialog').getByRole('button',{name:'เริ่มใหม่',exact:true}).click();
  await expect(page.getByLabel('เลือกไฟล์')).toBeDisabled();await expect(page.getByLabel('เลือกไฟล์')).toBeEnabled();
  await expect(page.getByRole('button',{name:'ดาวน์โหลดไฟล์',exact:true})).toHaveCount(0);
  await upload(page,picture());await page.getByRole('button',{name:'แปลงรูปภาพ',exact:true}).click();expect(PNG.sync.read(await exported(page)).width).toBe(160);
});

test('signature placements are immutable while a delayed export is busy',async({page})=>{
  await page.addInitScript(()=>{const read=File.prototype.arrayBuffer;File.prototype.arrayBuffer=async function(){const b=await read.call(this);await new Promise(resolve=>setTimeout(resolve,1200));return b;};});
  await open(page,'sign');await upload(page,await pdf(1));
  const canvas=page.locator('.signature-canvas');await expect(canvas).toBeVisible();const ink=await canvas.boundingBox();await page.mouse.click(ink.x+50,ink.y+35);
  await page.getByRole('button',{name:'วางลายเซ็นหน้านี้',exact:true}).click();const mark=page.locator('.pdf-sign-overlay');const old=await mark.getAttribute('style');const b=await mark.boundingBox();
  await page.getByRole('button',{name:'บันทึก PDF ที่เซ็นแล้ว',exact:true}).click();await expect(mark).toHaveAttribute('aria-disabled','true');
  await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();await page.mouse.move(b.x-80,b.y-40,{steps:8});await page.mouse.up();
  expect(await mark.getAttribute('style')).toBe(old);await exported(page);
});
