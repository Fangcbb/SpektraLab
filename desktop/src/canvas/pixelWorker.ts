import { runPixelJob, type PixelJob } from '@shared/pixelEdits';
let worker:Worker|null=null;
let seq=0;
const waiting=new Map<number,{resolve:(pixels:Uint8Array|Uint16Array)=>void;reject:(error:Error)=>void}>();
/** Transfer ownership of the source; large exports never block the UI thread. */
export function pixelsInWorker(job:PixelJob):Promise<Uint8Array|Uint16Array> {
  if(typeof Worker==='undefined')return Promise.resolve(runPixelJob(job));
  try {
    if(!worker){
      worker=new Worker(new URL('./pixels.worker.ts',import.meta.url),{type:'module'});
      worker.onmessage=(event:MessageEvent<{id:number;pixels?:Uint8Array|Uint16Array;error?:string}>)=>{
        const pending=waiting.get(event.data.id);waiting.delete(event.data.id);
        if(event.data.pixels)pending?.resolve(event.data.pixels);else pending?.reject(new Error(event.data.error??'Pixel worker failed'));
      };
      const fail=()=>{worker?.terminate();worker=null;for(const pending of waiting.values())pending.reject(new Error('Pixel worker failed'));waiting.clear();};
      worker.onerror=fail;worker.onmessageerror=fail;
    }
  }catch {return Promise.resolve(runPixelJob(job));}
  return new Promise((resolve,reject)=>{const id=++seq;waiting.set(id,{resolve,reject});worker!.postMessage({id,job},[job.src.buffer as ArrayBuffer]);});
}
