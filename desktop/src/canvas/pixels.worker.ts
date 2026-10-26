import { runPixelJob, type PixelJob } from '@shared/pixelEdits';
self.onmessage=(event:MessageEvent<{id:number;job:PixelJob}>)=>{
  const {id,job}=event.data;
  try {const pixels=runPixelJob(job);self.postMessage({id,pixels},{transfer:[pixels.buffer]});}
  catch(error){self.postMessage({id,error:String(error)});}
};
