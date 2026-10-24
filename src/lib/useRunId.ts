import { useEffect, useRef } from 'react';

// Every mounted workspace owns its generation. A reset/unmount invalidates pending results.
export function useRunId() {
  const runId=useRef(0);
  useEffect(()=>()=>{runId.current+=1;},[]);
  return runId;
}
