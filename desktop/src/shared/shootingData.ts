import type { FilmParams } from './params';
import type { FileMetadata } from './protocol';
/** Only measured EXIF values become marks; no invented capture date. */
export function shootingParams(p: FilmParams, metadata: FileMetadata | null): FilmParams {
  const d=p.dateBack;
  const day=metadata?.datetime_original?.match(/^(\d{4})[:-](\d{2})[:-](\d{2})/);
  const yy=day?`'${day[1]!.slice(-2)}`:'';
  const text=day?(d.order==='us'?`${Number(day[2])} ${Number(day[3])} ${yy}`:`${yy} ${Number(day[2])} ${Number(day[3])}`):d.text;
  const data: string[]=[];
  if(metadata?.aperture) data.push(`F${metadata.aperture.toFixed(1)}`);
  if(metadata?.shutter_s) data.push(metadata.shutter_s<1?`1/${Math.round(1/metadata.shutter_s)}`:`${metadata.shutter_s.toFixed(1)}S`);
  if(metadata?.iso) data.push(`ISO ${Math.round(metadata.iso)}`);
  if(metadata?.focal_mm) data.push(`${Math.round(metadata.focal_mm)}MM`);
  return {...p,filmEdge:{...p.filmEdge,fNumber:p.filmEdge.fNumber || metadata?.aperture || 0},
    dateBack:{...d,text,dataText:d.dataText || data.join(' ')}};
}
