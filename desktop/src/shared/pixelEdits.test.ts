import {describe,it,expect} from 'vitest';
import {editPixels,filePixels} from './pixelEdits';
import {ADJUSTMENTS_DEFAULT,SRGB_MID_GREY} from './adjustments';
import {GEOMETRY_DEFAULT} from './geometry';
const size={width:5,height:3};
const gates=[[0,0,.4,0,.4,1,0,1],[.6,0,1,0,1,1,.6,1]];
describe('pair grades and export pixels',()=>{
  it('grades each frame independently and preserves the film in the gap',()=>{
    const src=new Uint16Array(size.width*size.height*4).fill(32768);
    const out=filePixels(src,size,GEOMETRY_DEFAULT,ADJUSTMENTS_DEFAULT,size,SRGB_MID_GREY,
      {gates,adjustments:[{...ADJUSTMENTS_DEFAULT,exposure:1},null]});
    const expected=Math.round(Math.pow(Math.pow(32768/65535,2.2)*2,1/2.2)*65535);
    expect(out[0]).toBe(expected);expect(out[8]).toBe(32768);expect(out[12]).toBe(32768);
  });
  it('applies the chosen frame grade before a global turn or crop',()=>{
    const src=new Uint16Array(size.width*size.height*4).fill(20000);
    const out=filePixels(src,size,{...GEOMETRY_DEFAULT,flipH:true},ADJUSTMENTS_DEFAULT,size,SRGB_MID_GREY,
      {gates,adjustments:[{...ADJUSTMENTS_DEFAULT,exposure:1},null]});
    expect(out[0]).toBe(20000);expect(out[16]).toBeGreaterThan(20000);
  });
  it('uses the same arithmetic for preview and export, within 8-bit rounding',()=>{
    const src8=new Uint8Array(size.width*size.height*4).fill(100);
    const src16=Uint16Array.from(src8,x=>x*257);
    const a={...ADJUSTMENTS_DEFAULT,exposure:.5,contrast:10,temperature:-5};
    const p8=editPixels(src8,size,GEOMETRY_DEFAULT,a,size,SRGB_MID_GREY);
    const p16=filePixels(src16,size,GEOMETRY_DEFAULT,a,size,SRGB_MID_GREY);
    for(let i=0;i<p8.length;i++)expect(Math.abs(p8[i]!-p16[i]!/257)).toBeLessThanOrEqual(.5);
  });
});
