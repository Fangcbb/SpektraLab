import { GEOMETRY_DEFAULT, type Geometry, type Size } from './geometry';
import type { FilmParams } from './params';
import type { WireParams } from './protocol';

export const cutsFrame = (p: FilmParams): boolean => p.filmEdge.active || p.dateBack.active;
const GATES: Record<string, [number, number]> = {
  '135': [36.25,24.3], '135_half':[24,18], '135_xpan':[65,24],
  '120_645':[56,41.5], '120_6x6':[56,56], '120_6x7':[69.5,56],
  '120_6x8':[76,56], '120_6x9':[84,56], '120_6x12':[112,56], '120_6x17':[168,56],
};
/** Preserve the crop centre and orientation, fitting inside the selected physical gate. */
export function fitFilmGate(g: Geometry, native: Size | null, format: string, pair=false): Geometry {
  const gate:readonly [number,number] | undefined=pair ? [37,24] : GATES[format]; if(!native || !gate) return g;
  const w=g.crop.width*native.width,h=g.crop.height*native.height;
  const ratio=w>=h?gate[0]/gate[1]:gate[1]/gate[0];
  let width=g.crop.width,height=g.crop.height;
  if(w/h>ratio) width=h*ratio/native.width;
  else height=w/ratio/native.height;
  return {...g,crop:{x:g.crop.x+(g.crop.width-width)/2,y:g.crop.y+(g.crop.height-height)/2,width,height}};
}
export function geometryWire(p: FilmParams, geometry: Geometry): WireParams {
  const g=cutsFrame(p)?geometry:GEOMETRY_DEFAULT;
  return {geometry_crop_x:g.crop.x,geometry_crop_y:g.crop.y,geometry_crop_w:g.crop.width,
    geometry_crop_h:g.crop.height,geometry_rotation_deg:g.angle,geometry_quarter_turns:g.quarterTurns,
    geometry_flip_h:g.flipH,geometry_flip_v:g.flipV};
}
/** Geometry has already been applied before film/date exposure. */
export function canvasGeometry(p: FilmParams, g: Geometry): Geometry {return cutsFrame(p)?GEOMETRY_DEFAULT:g;}
export function filmCanvasSize(source: Size, rendered: Size | null, p: FilmParams, previewEdge: number, full: boolean): Size {
  if(!cutsFrame(p) || !rendered) return source;
  const scale=full?1:Math.max(1,Math.max(source.width,source.height)/previewEdge);
  return {width:Math.round(rendered.width*scale),height:Math.round(rendered.height*scale)};
}
