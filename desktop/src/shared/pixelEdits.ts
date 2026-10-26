import { type Adjustments, curveTables, layer2Pixel, layer2Uniforms } from './adjustments';
import { type Geometry, sourcePoint } from './geometry';

export interface PairGrades {gates:number[][];adjustments:(Adjustments|null)[]}
function contains(q:number[],x:number,y:number):boolean {
  if(q.length!==8)return false;
  let pos=false,neg=false;
  for(let i=0;i<4;i++){const j=(i+1)%4;const cross=(q[2*j]!-q[2*i]!)*(y-q[2*i+1]!)-(q[2*j+1]!-q[2*i+1]!)*(x-q[2*i]!);pos ||= cross>1e-10;neg ||= cross< -1e-10;}
  return !(pos && neg);
}
function gradeBlocks(a:Adjustments,midGrey:number,pair?:PairGrades) {
  return [a,...(pair?.adjustments.map(own=>own??a)??[])].map(grade=>{const u=layer2Uniforms(grade,midGrey);return {u,tables:u.curvesActive?curveTables(grade.curves):null};});
}
function gradeAt(blocks:ReturnType<typeof gradeBlocks>,x:number,y:number,pair?:PairGrades) {
  const i=pair?.gates.findIndex(q=>contains(q,x,y))??-1;
  return blocks[i+1]??blocks[0]!;
}

export function editPixels(
  src: Uint16Array | Uint8Array,
  srcSize: { width: number; height: number },
  g: Geometry,
  a: Adjustments,
  out: { width: number; height: number },
  midGrey: number,
  pair?: PairGrades,
): Uint16Array | Uint8Array {
  const blocks=gradeBlocks(a,midGrey,pair);
  const { width: W, height: H } = srcSize;
  const max=src instanceof Uint16Array?65535:255;
  const res = src instanceof Uint16Array?new Uint16Array(out.width*out.height*4):new Uint8Array(out.width*out.height*4);
  const k = 1 / max;
  for (let y = 0; y < out.height; y++) {
    for (let x = 0; x < out.width; x++) {
      const s = sourcePoint(g, { x: (x + 0.5) / out.width, y: (y + 0.5) / out.height }, srcSize);
      const fx = Math.min(Math.max(s.x * W - 0.5, 0), W - 1);
      const fy = Math.min(Math.max(s.y * H - 0.5, 0), H - 1);
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const x1 = Math.min(x0 + 1, W - 1);
      const y1 = Math.min(y0 + 1, H - 1);
      const tx = fx - x0;
      const ty = fy - y0;
      const c: [number, number, number] = [0, 0, 0];
      for (let ch = 0; ch < 3; ch++) {
        const p00 = src[(y0 * W + x0) * 4 + ch]!;
        const p01 = src[(y0 * W + x1) * 4 + ch]!;
        const p10 = src[(y1 * W + x0) * 4 + ch]!;
        const p11 = src[(y1 * W + x1) * 4 + ch]!;
        c[ch] = ((p00 * (1 - tx) + p01 * tx) * (1 - ty) + (p10 * (1 - tx) + p11 * tx) * ty) * k;
      }
      const {u,tables}=gradeAt(blocks,s.x,s.y,pair);
      const [r, gg, b] = layer2Pixel(c, u, tables, s.x, s.y);
      const o = (y * out.width + x) * 4;
      res[o] = Math.round(r * max);
      res[o + 1] = Math.round(gg * max);
      res[o + 2] = Math.round(b * max);
      res[o + 3] = max;
    }
  }
  return res;
}

export function filePixels(src:Uint16Array,srcSize:{width:number;height:number},g:Geometry,a:Adjustments,out:{width:number;height:number},midGrey:number,pair?:PairGrades):Uint16Array {
  return editPixels(src,srcSize,g,a,out,midGrey,pair) as Uint16Array;
}
export interface PixelJob {src:Uint8Array|Uint16Array;srcSize:{width:number;height:number};geometry:Geometry;adjustments:Adjustments;out:{width:number;height:number};midGrey:number;pair?:PairGrades}
export const runPixelJob=(job:PixelJob)=>editPixels(job.src,job.srcSize,job.geometry,job.adjustments,job.out,job.midGrey,job.pair);
