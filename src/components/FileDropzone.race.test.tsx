import {act,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {FileDropzone} from './FileDropzone';
import * as validation from '../lib/validation';

it('unlocks after busy invalidates an in-flight file validation',async()=>{
  let finish:()=>void=()=>{};
  vi.spyOn(validation,'validateFile').mockImplementation(()=>new Promise<void>(resolve=>{finish=resolve;}));
  const onFiles=vi.fn();const props={accept:'image/png',title:'test',description:'test',onFiles};
  const {rerender}=render(<FileDropzone {...props}/>);
  fireEvent.change(screen.getByLabelText('เลือกไฟล์'),{target:{files:[new File(['x'],'a.png',{type:'image/png'})]}});
  rerender(<FileDropzone {...props} disabled/>);rerender(<FileDropzone {...props}/>);
  await act(async()=>finish());
  await waitFor(()=>expect(screen.getByRole('button',{name:'เลือกไฟล์'})).toBeEnabled());
  expect(onFiles).not.toHaveBeenCalled();vi.restoreAllMocks();
});
