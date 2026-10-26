import {describe,it,expect} from 'vitest';
import {normalizePair,type HalfFramePair} from './pair';
import {FILM_PARAMS_DEFAULT,fullDelta,ALL_FEATURES} from './params';

describe('portable imaging recipes',()=>{
  it('opens an older pair containing only paths without losing extra fields',()=>{
    const pair=normalizePair({folder:'/photos',left:{path:'/photos/a.jpg',exposureScope:'film'},right:null} as HalfFramePair);
    expect(pair.left?.placement).toEqual({x:0,y:0,quarterTurns:0,scale:1});
    expect(pair.left?.exposureScope).toBe('film');expect(pair.left?.geometry.crop.width).toBe(1);
    expect(pair.left?.autoExposure).toBe(true);expect(pair.turned).toBe(false);
  });
  it('uses the product black-and-white grain and silver-paper filter-2 calibration',()=>{
    const wire=fullDelta({...FILM_PARAMS_DEFAULT,filmStock:'kodak_tri_x_400',printStock:'ilford_multigrade_iv_rc'},ALL_FEATURES);
    expect(wire.grain_sublayers_active).toBe(false);expect(wire.grain_amount).toBe(1.7);
    expect(wire.y_filter_neutral).toBe(68);expect(wire.m_filter_neutral).toBe(0);
  });
});
