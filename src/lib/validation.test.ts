import { validateDimensions, validateTarget, assertBatchBudget, validateFile } from './validation';

it('rejects blank, nonfinite, fractional, negative and oversized dimensions', () => {
  for (const bad of ['', '0','-1','1.5','Infinity','12001']) expect(()=>validateDimensions(bad,'300')).toThrow();
  expect(validateDimensions('600','300')).toEqual({width:600,height:300});
  expect(()=>validateDimensions('12000','12000')).toThrow();
});
it('rejects invalid compression targets instead of silently coercing them', () => {
  for (const bad of [0,-1,Infinity,NaN,100001]) expect(()=>validateTarget(bad)).toThrow();
  expect(validateTarget(200)).toBe(204800);
});
it('bounds batch count and aggregate bytes including already queued files', () => {
  expect(()=>assertBatchBudget(Array.from({length:21},()=>({size:1})))).toThrow();
  expect(()=>assertBatchBudget([{size:101*1024*1024}])).toThrow();
});
it('rejects a renamed text file and oversize input before decoding', async () => {
  await expect(validateFile(new File(['hello'],'fake.pdf',{type:'application/pdf'}),'pdf')).rejects.toThrow();
  const f = new File(['x'],'big.png',{type:'image/png'}); Object.defineProperty(f,'size',{value:26*1024*1024});
  await expect(validateFile(f,'image')).rejects.toThrow();
});

it('rejects an 80 MP PNG from its header before any decoder allocation',async()=>{
  const b=new Uint8Array(24);b.set([137,80,78,71,13,10,26,10]);const d=new DataView(b.buffer);d.setUint32(16,10000);d.setUint32(20,8000);
  await expect(validateFile(new File([b],'huge.png',{type:'image/png'}),'image')).rejects.toThrow('40 ล้าน');
});
