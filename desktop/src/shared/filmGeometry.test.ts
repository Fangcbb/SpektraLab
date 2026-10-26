import {describe,it,expect} from 'vitest';
import {GEOMETRY_DEFAULT, outputSize} from './geometry';
import {FILM_PARAMS_DEFAULT} from './params';
import {fitFilmGate,geometryWire,canvasGeometry,filmCanvasSize} from './filmGeometry';
import {shootingParams} from './shootingData';
describe('film and date framing',()=>{
  const native={width:6000,height:4000};
  const film={...FILM_PARAMS_DEFAULT,filmEdge:{...FILM_PARAMS_DEFAULT.filmEdge,active:true}};
  it('fits each format inside the source without stretching',()=>{
    for(const [format,ratio] of [['135',36.25/24.3],['135_half',24/18],['135_xpan',65/24],['120_645',56/41.5],['120_6x6',1],['120_6x7',69.5/56],['120_6x8',76/56],['120_6x9',1.5],['120_6x12',2],['120_6x17',3]] as const){
      const g=fitFilmGate(GEOMETRY_DEFAULT,native,format);
      const size=outputSize(g,native);
      expect(size.width/size.height).toBeCloseTo(ratio,2);
      expect(g.crop.x).toBeGreaterThanOrEqual(0);expect(g.crop.y).toBeGreaterThanOrEqual(0);
      expect(g.crop.x+g.crop.width).toBeLessThanOrEqual(1);expect(g.crop.y+g.crop.height).toBeLessThanOrEqual(1);
    }
  });
  it('sends the crop before the film, while canvas and export use no second crop',()=>{
    const g=fitFilmGate(GEOMETRY_DEFAULT,native,'120_6x6');
    expect(geometryWire(film,g).geometry_crop_w).toBeCloseTo(2/3);
    expect(canvasGeometry(film,g)).toEqual(GEOMETRY_DEFAULT);
    expect(geometryWire(FILM_PARAMS_DEFAULT,g).geometry_crop_w).toBe(1);
    expect(canvasGeometry(FILM_PARAMS_DEFAULT,g)).toEqual(g);
  });
  it('scales the rendered film canvas for native-pixel zoom',()=>{
    expect(filmCanvasSize(native,{width:2700,height:2000},film,3000,false)).toEqual({width:5400,height:4000});
  });
});
describe('date-back EXIF data',()=>{
  it('formats the capture day rather than the current day',()=>{
    const p=shootingParams(FILM_PARAMS_DEFAULT,{datetime_original:'2024:06:18 11:22:33',aperture:5.6,shutter_s:1/250,iso:400});
    expect(p.dateBack.text).toBe("'24 6 18");expect(p.dateBack.dataText).toBe('F5.6 1/250 ISO 400');expect(p.filmEdge.fNumber).toBe(5.6);
  });
  it('does not invent EXIF values when absent',()=>{
    const p=shootingParams(FILM_PARAMS_DEFAULT,null);expect(p.dateBack.text).toBe('');expect(p.dateBack.dataText).toBe('');
  });
});
