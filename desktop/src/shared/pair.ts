import { type Adjustments, decodeAdjustments } from './adjustments';
import { DECODE_DEFAULT } from './sidecar';
import { GEOMETRY_DEFAULT,decodeGeometry } from './geometry';
import type { Geometry } from './geometry';
import type { DecodeSettings } from './sidecar';
import type { FileMetadata } from './protocol';
export interface PairHole {
  path:string;
  print?:{brightnessStops:number;yFilterShift:number;mFilterShift:number;preflashExposure:number}|null;
  adjustments?:Adjustments|null;
  printScope?:'frame'|'film';
  exposureScope?:'frame'|'film';
  placement:{scale:number;x:number;y:number;quarterTurns:number};
  exposureEV:number;
  meteredEV?:number|null;
  autoExposure:boolean;
  meterMethod?:string;
  geometry:Geometry;
  decode:DecodeSettings;
  metadata?:FileMetadata;
}
export interface HalfFramePair {
  schemaVersion:number;folder:string;
  left:PairHole|null;right:PairHole|null;
  spacingMM:number;onStrip:boolean;turned:boolean;
}
export const isPair=(path:string|null):boolean=>!!path && /\.spektrapair$/i.test(path);

/** Old pair files may contain only paths. Preserve fields added by the Mac. */
export function normalizePair(raw:HalfFramePair):HalfFramePair {
  const normalize=(hole:PairHole|null):PairHole|null=>hole?{...hole,
    placement:{scale:hole.placement?.scale??1,x:hole.placement?.x??0,y:hole.placement?.y??0,quarterTurns:hole.placement?.quarterTurns??0},
    autoExposure:hole.autoExposure??true,exposureEV:hole.exposureEV??0,
    geometry:hole.geometry?decodeGeometry(hole.geometry):GEOMETRY_DEFAULT,
    decode:{...DECODE_DEFAULT,...hole.decode},adjustments:hole.adjustments?decodeAdjustments(hole.adjustments):null}:null;
  return {...raw,schemaVersion:raw.schemaVersion??1,spacingMM:raw.spacingMM??1,onStrip:raw.onStrip??false,turned:raw.turned??false,left:normalize(raw.left),right:normalize(raw.right)};
}
