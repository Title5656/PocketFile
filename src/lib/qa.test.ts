import { toolCatalog } from '../data/tools';
import { readPreferences } from './preferences';
import { getPdfSignatureBounds } from './pdf';
import { getPhotoPixelSize } from './idPhoto';
import { outputFileName } from './format';
import { PDFDocument } from 'pdf-lib';
import { exportPdfPages } from './pdf';

it('removes OCR/privacy from the catalog and persisted recent tools', () => {
  expect(toolCatalog).toHaveLength(8);
  localStorage.setItem('pocketfile.preferences', JSON.stringify({recentTools:['image-text','privacy','compress']}));
  expect(readPreferences(localStorage).recentTools).toEqual(['compress']);
});

it('anchors rotated signatures at the transformed lower-left corner including CropBox offsets', () => {
  const v = {width:200, height:300, rotation:90, convertToPdfPoint:(x:number,y:number)=>[y+30,x+40]};
  expect(getPdfSignatureBounds(v, {x:.1,y:.2,width:.4}, .5)).toEqual({x:130,y:60,width:80,height:40,rotation:90});
});

it('rejects ID photo physical sizes outside the published 0.2–8 inch range', () => {
  expect(()=>getPhotoPixelSize(.1, 1, 300)).toThrow();
  expect(()=>getPhotoPixelSize(9, 1, 300)).toThrow();
});

it('names edited outputs distinctly and removes filename control characters', () => {
  expect(outputFileName('test\u0000.png','jpg','converted')).toBe('test-converted.jpg');
});

it('rejects PDFs over the 150-page personal-use limit before page export',async()=>{
  const doc=await PDFDocument.create();for(let i=0;i<151;i++)doc.addPage([100,100]);
  await expect(exportPdfPages(await doc.save(),[0])).rejects.toThrow('150 หน้า');
});
