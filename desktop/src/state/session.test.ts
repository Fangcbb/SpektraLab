// The store's edit doors, against a stand-in host and platform: what makes an
// undo step and what does not.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const calls: string[] = [];
vi.mock('../host/client', () => {
  class HostCallError extends Error {
    code = 'internal';
  }
  const h = {
    transport:{request:vi.fn(async (_method:string,params:Record<string,unknown>)=>{calls.push('pair:'+String(params.path));return {result:params.pair};})},
    close:vi.fn(async()=>{}),
    setParams: vi.fn(async () => {
      calls.push('set_params');
      return {};
    }),
    render: vi.fn(async (_sid: string, tier: string) => {
      calls.push(`render:${tier}`);
      return { width: 4, height: 4, data: new Uint8Array(64), colorSpace: 'sRGB', tier, reprinted: false, ms: 1 };
    }),
    redecode: vi.fn(async (_sid: string, decode: object) => {
      calls.push('redecode:' + JSON.stringify(decode));
      return { session: 's1', width: 6000, height: 4000, kind: 'raw', metadata: { orientation: 1 }, params: {} };
    }),
  };
  return { HostCallError, host: () => h };
});
vi.mock('../platform', () => ({
  platform: () => ({ log: () => {}, sidecarSave: async () => '' }),
  baseName: (p: string) => p.split(/[\\/]/).pop() ?? p,
  dirName: (p: string) => p,
}));

import { recomputeFilmFormat, requestPrint, requestFullPrint, sessionStore, setDecode, setGeometry, setParams, undo, updatePairHole, flushPairEdits } from './session';
import { host } from '../host/client';
import type { HelloResult } from '@shared/protocol';
import { settingsStore } from './settings';
import {normalizePair,type HalfFramePair} from '@shared/pair';
import { newSidecar } from '@shared/sidecar';

// Undo steps coalesce within 500 ms; each case starts well past the last one.
let clock = 0;
beforeEach(() => {
  clock += 10_000;
  vi.spyOn(performance, 'now').mockReturnValue(clock);
  calls.length = 0;
  sessionStore.setState({
    pair:null,pairFocus:'film',
    selection: '/x/a.cr2',
    engineSession: 's1',
    nativeSize: { width: 6000, height: 4000 },
    sidecar: newSidecar(),
    undo: [],
    redo: [],
    batchExporting: false,
  });
  settingsStore.getState().set('recalculateEffectsAfterCrop', true);
  settingsStore.getState().set('autoFullRender', false);
});

afterEach(() => vi.useRealTimers());

describe('large-photo rendering', () => {
  it('keeps editing at preview resolution by default', async () => {
    vi.useFakeTimers();
    await requestPrint();
    await vi.advanceTimersByTimeAsync(2000);
    expect(calls).toContain('render:live');
    expect(calls).not.toContain('render:full');
  });

  it('renders original resolution when explicitly requested', async () => {
    sessionStore.setState({ hostState: { phase: 'ready', hello: {} as HelloResult } });
    await requestFullPrint();
    expect(calls).toContain('render:full');
  });

  it('supports optional idle full rendering after 1.5 seconds', async () => {
    vi.useFakeTimers();
    settingsStore.getState().set('autoFullRender', true);
    await requestPrint();
    await vi.advanceTimersByTimeAsync(1499);
    expect(calls).not.toContain('render:full');
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toContain('render:full');
  });

  it('stops idle full rendering after device loss', async () => {
    vi.useFakeTimers();
    settingsStore.getState().set('autoFullRender', true);
    vi.mocked(host().render).mockRejectedValueOnce(new Error('Vulkan compute dispatch failed (VkResult -4)'));
    await requestPrint();
    await vi.advanceTimersByTimeAsync(2000);
    expect(settingsStore.getState().autoFullRender).toBe(false);
    expect(calls).not.toContain('render:full');
    expect(sessionStore.getState().lastError).toContain('VkResult -4');
  });
});

describe('the derived film format', () => {
  it('is written without an undo step', () => {
    const before = sessionStore.getState().sidecar.params.filmFormatMM;
    sessionStore.setState({ sidecar: { ...newSidecar(), params: { ...newSidecar().params, filmFormatMM: before + 7 } } });
    recomputeFilmFormat();
    const s = sessionStore.getState();
    expect(s.sidecar.params.filmFormatMM).toBeCloseTo(before, 3);
    expect(s.undo).toHaveLength(0);
  });

  it('rides along with the crop that moved it: one undo step, and undo restores both', async () => {
    const mm0 = sessionStore.getState().sidecar.params.filmFormatMM;
    setGeometry((g) => ({ ...g, crop: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 } }));
    const s = sessionStore.getState();
    expect(s.undo).toHaveLength(1);
    expect(s.sidecar.params.filmFormatMM).not.toBeCloseTo(mm0, 3);
    undo();
    const u = sessionStore.getState();
    expect(u.sidecar.geometry.crop.width).toBe(1);
    expect(u.sidecar.params.filmFormatMM).toBeCloseTo(mm0, 3);
    await vi.waitFor(() => expect(calls).toContain('render:live'));
  });

  it('a real edit still makes an undo step', () => {
    setParams((p) => ({ ...p, exposureCompensationEV: 1 }));
    expect(sessionStore.getState().undo).toHaveLength(1);
  });
});

describe('white balance at decode (R2)', () => {
  const hello = { methods: ['open', 'redecode', 'render'] } as unknown as HelloResult;

  it('a decode edit is one undo step and re-decodes the session, then renders', async () => {
    sessionStore.setState({ hello, frameKind: 'raw' });
    setDecode((d) => ({ ...d, whiteBalance: 'Custom', temperature: 3200, tint: 0 }));
    expect(sessionStore.getState().undo).toHaveLength(1);
    await vi.waitFor(() => expect(calls).toContain('redecode:{"white_balance":{"mode":"custom","temperature_k":3200,"tint":0}}'));
    await vi.waitFor(() => expect(calls.indexOf('render:live')).toBeGreaterThan(calls.findIndex((c) => c.startsWith('redecode'))));
    calls.length = 0;
    undo();
    expect(sessionStore.getState().sidecar.decode.whiteBalance).toBe('As Shot');
    await vi.waitFor(() => expect(calls).toContain('redecode:{"white_balance":{"mode":"as_shot"}}'));
  });

  it('a raster frame is not re-decoded', async () => {
    sessionStore.setState({ hello, frameKind: 'tiff', selection: '/x/a.tif' });
    setDecode((d) => ({ ...d, whiteBalance: 'Custom', temperature: 3200 }));
    await vi.waitFor(() => expect(calls).toContain('render:live'));
    expect(calls.some((c) => c.startsWith('redecode'))).toBe(false);
  });
});

describe('pair edit history and persistence',()=>{
  const pair=normalizePair({schemaVersion:1,folder:'/x',left:{path:'/x/left.jpg'},right:null} as HalfFramePair);
  it('undo restores the pair recipe as well as global editing settings',async()=>{
    vi.useFakeTimers({toFake:['setTimeout','clearTimeout']});
    sessionStore.setState({pair,selection:'/x/two.spektrapair',hostState:{phase:'starting'}});
    updatePairHole('left',{exposureEV:1});
    expect(sessionStore.getState().pair?.left?.exposureEV).toBe(1);
    undo();expect(sessionStore.getState().pair?.left?.exposureEV).toBe(0);
    await flushPairEdits();
  });
  it('flush writes the captured file even if the selection has moved',async()=>{
    vi.useFakeTimers({toFake:['setTimeout','clearTimeout']});
    sessionStore.setState({pair,selection:'/x/two.spektrapair'});
    updatePairHole('left',{exposureEV:2});
    sessionStore.setState({selection:'/x/another.jpg',pair:null});
    await flushPairEdits();
    expect(calls).toContain('pair:/x/two.spektrapair');
    expect(calls).not.toContain('pair:/x/another.jpg');
  });
});
