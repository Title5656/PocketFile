import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

export function Modal({children,onClose,className,labelledBy,describedBy,alert=false}:{children:ReactNode;onClose:()=>void;className:string;labelledBy:string;describedBy?:string;alert?:boolean}) {
  const ref=useRef<HTMLElement>(null);
  const close=useRef(onClose); close.current=onClose;
  useEffect(()=>{
    const dialog=ref.current!;
    const previous=document.activeElement as HTMLElement|null;
    const overflow=document.body.style.overflow;document.body.style.overflow='hidden';
    const backdrop=dialog.parentElement!;
    const siblings=[...backdrop.parentElement!.children].filter(el=>el!==backdrop) as HTMLElement[];
    const inert=siblings.map(el=>el.inert);siblings.forEach(el=>{el.inert=true;});
    const controls=()=>[...dialog.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href],[tabindex="0"]')];
    (controls()[0]||dialog).focus();
    const key=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close.current();}
      if(event.key==='Tab'){
        const c=controls();const first=c[0]||dialog,last=c.at(-1)||dialog;
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
      }
    };
    dialog.addEventListener('keydown',key);
    return ()=>{dialog.removeEventListener('keydown',key);siblings.forEach((el,i)=>{el.inert=inert[i];});document.body.style.overflow=overflow;if(previous?.isConnected)previous.focus();};
  },[]);
  return <div className="dialog-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><section ref={ref} tabIndex={-1} className={className} role={alert?'alertdialog':'dialog'} aria-modal="true" aria-labelledby={labelledBy} aria-describedby={describedBy}>{children}</section></div>;
}
