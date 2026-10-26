// LeftRail.tsx — "Film and Print" (`Panels/LeftPanel.swift`):
// Navigator · Settings Clipboard · Film · Film Edge · Date Back · Print · Crop
// · Enlarger. Everything here runs in the engine except Crop (geometry, one
// draw).

import { useEffect, useRef } from 'react';
import { ScrubSlider, Section, ToggleRow, PillMenu, Checkbox, signed, NumberField } from '../controls/controls';
import { FlipH, FlipV, RotateLeft, RotateRight } from '../controls/icons';
import { t, tz, useI18n } from '../i18n';
import {
  editingParams, setEnlarger,
  createHalfFramePair, updatePair, updatePairHole,
  copySettings,
  pasteSettings,
  setGeometry,
  setPages,
  setParams,
  syncSettings,
  useSession,
  zoomToFit,
  sessionStore,
  setView,
} from '../state/session';
import { CLIPBOARD_GROUPS, type ClipboardGroup } from '@shared/clipboard';
import {
  CROP_ASPECT_PICKER,
  type CropAspect,
  aspectCanonical,
  aspectHasOrientation,
  aspectIsPortrait,
  aspectLabel,
  aspectTransposed,
  outputSize,
  straightened,
  turned,
  withAspect,
} from '@shared/geometry';
import { clamp } from '@shared/params';
import { platform, baseName } from '../platform';
import { isRawPath } from '@shared/whiteBalance';
import { decodeSidecar } from '@shared/sidecar';
import { useOutput } from '../canvas/output';
import { canvasGeometry, filmCanvasSize } from '@shared/filmGeometry';
import { frameImages } from '../state/frames';
import { settingsStore } from '../state/settings';
import { StockList } from './StockList';
import { unsupportedReason } from './gate';

export function LeftRail() {
  const { t: tr } = useI18n();
  return (
    <aside className="rail left" data-testid="left-rail">
      <div className="rail-header">{tr('railFilmAndPrint')}</div>
      <div className="hairline" />
      <div className="rail-scroll">
        <NavigatorSection />
        <ClipboardSection />
        <FilmSection />
        <PairSection />
        <FilmEdgeSection />
        <DateBackSection />
        <PrintSection />
        <ToneMaskSection />
        <CropSection />
        <EnlargerSection />
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------- Navigator

function NavigatorSection() {
  const out = useOutput();
  const view = useSession((s) => s.view);
  const canvasPx = useSession((s) => s.canvasPx);
  const native = useSession((s) => s.nativeSize);
  const geometry = useSession((s) => s.sidecar.geometry);
  const params=useSession(s=>s.sidecar.params);
  const badge=useSession(s=>s.badge);
  const o = native ? outputSize(canvasGeometry(params,geometry),filmCanvasSize(native,frameImages.print,params,settingsStore.getState().previewLongEdge,badge==='full')) : null;
  // The part of the output the canvas shows, in output uv.
  const vis =
    o && !view.fit
      ? (() => {
          const w = Math.min(1, canvasPx.width / (o.width * view.zoom));
          const h = Math.min(1, canvasPx.height / (o.height * view.zoom));
          return { x: clamp(view.cx - w / 2, 0, 1 - w), y: clamp(view.cy - h / 2, 0, 1 - h), w, h };
        })()
      : null;
  const pan = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!o || !out) return;
    const r = e.currentTarget.getBoundingClientRect();
    // The output is letterboxed inside the well (object-fit: contain).
    const k = Math.min(r.width / out.width, r.height / out.height);
    const ox = (r.width - out.width * k) / 2;
    const oy = (r.height - out.height * k) / 2;
    const u = clamp((e.clientX - r.left - ox) / (out.width * k), 0, 1);
    const v = clamp((e.clientY - r.top - oy) / (out.height * k), 0, 1);
    const s = sessionStore.getState().view;
    setView({ fit: false, zoom: s.fit ? Math.max(1, sessionStore.getState().fitZoom * 2) : s.zoom, cx: u, cy: v });
  };
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext('2d')!;
    if (!out) {
      ctx.clearRect(0, 0, c.width, c.height);
      return;
    }
    c.width = out.width;
    c.height = out.height;
    ctx.putImageData(new ImageData(new Uint8ClampedArray(out.data), out.width, out.height), 0, 0);
  }, [out]);
  return (
    <Section id="navigator" title={t('sectionNavigator')}>
      <div className="navigator" data-testid="navigator" onPointerDown={pan} onPointerMove={(e) => e.buttons === 1 && pan(e)}>
        <canvas ref={ref} />
        {vis && out && <NavigatorBox vis={vis} aspect={out.width / out.height} />}
        <button className="navigator-fit" onClick={zoomToFit} title={tz('Fit (,)', '适合窗口（,）')}>
          {view.fit ? t('helpFit') : `${Math.round(view.zoom * 100)} %`}
        </button>
      </div>
    </Section>
  );
}

function NavigatorBox({ vis, aspect }: { vis: { x: number; y: number; w: number; h: number }; aspect: number }) {
  // Drawn in the well's own box: the picture's letterbox is computed by CSS
  // with a percentage-based inner frame of the same aspect.
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
      <div style={{ position: 'relative', aspectRatio: String(aspect), maxWidth: '100%', maxHeight: '100%', width: aspect >= 203 / 183 ? '100%' : 'auto', height: aspect >= 203 / 183 ? 'auto' : '100%' }}>
        <div
          style={{
            position: 'absolute',
            left: `${vis.x * 100}%`,
            top: `${vis.y * 100}%`,
            width: `${vis.w * 100}%`,
            height: `${vis.h * 100}%`,
            border: '1px solid var(--accent)',
          }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Clipboard

const GROUP_LABEL: Record<ClipboardGroup, () => string> = {
  filmAndPaper: () => t('clipFilmAndPaper'),
  exposure: () => t('clipExposure'),
  whiteBalance: () => t('clipWhiteBalance'),
  filmEffects: () => t('clipFilmEffects'),
  printEffects: () => t('clipPrintEffects'),
  scenePlacement: () => t('clipScenePlacement'),
};

function ClipboardSection() {
  const groups = useSession((s) => s.clipboardGroups);
  const clip = useSession((s) => s.clipboard);
  const picked = useSession((s) => s.picked);
  const selection = useSession((s) => s.selection);
  const others = picked.filter((p) => p !== selection).length;
  const toggle = (g: ClipboardGroup) =>
    setPages({ clipboardGroups: groups.includes(g) ? groups.filter((x) => x !== g) : CLIPBOARD_GROUPS.filter((x) => x === g || groups.includes(x)) });
  return (
    <Section id="clipboard" title={t('sectionClipboard')}>
      {CLIPBOARD_GROUPS.map((g) => (
        <div className="row toggle-row" key={g}>
          <span className="row-label">{GROUP_LABEL[g]()}</span>
          <Checkbox on={groups.includes(g)} onChange={() => toggle(g)} label={GROUP_LABEL[g]()} />
        </div>
      ))}
      <div className="row" style={{ gap: 8 }}>
        <button className="btn" disabled={!selection || !groups.length} onClick={copySettings} title={t('clipCopyHelp')}>
          {t('clipCopy')}
        </button>
        <button className="btn" disabled={!clip || !selection} onClick={() => void pasteSettings()}>
          {others > 0 ? t('clipPasteTo').replace('%d', String(others + 1)) : t('clipPaste')}
        </button>
        <button className="btn" disabled={!selection || others === 0 || !groups.length} onClick={() => void syncSettings()}>
          {others > 0 ? t('clipSyncTo').replace('%d', String(others)) : t('clipSync')}
        </button>
      </div>
      <div className="caption">{clip ? tz(`Holds: ${clip.sourceName} · ${clip.groups.length} groups`, `内容：${clip.sourceName} · ${clip.groups.length} 组`) : t('clipEmpty')}</div>
    </Section>
  );
}

// --------------------------------------------------------------------- Film

function FilmSection() {
  const catalog = useSession((s) => s.catalog);
  const film = useSession((s) => s.sidecar.params.filmStock);
  const rows = catalog.filmGroups().flatMap((g) => [
    { id: '__g' + g.title, name: g.title === 'Black and white'?tz('Black and white','黑白'):g.title === 'Positive' ? t('filmGroupPositive') : t('filmGroupNegative'), header: true },
    ...g.films.map((f) => ({ id: f.id, name: f.name, cine: f.use === 'cine', cover: catalog.coverURL(f.id) })),
  ]);
  return (
    <Section
      id="film"
      title={t('sectionFilm')}
      menu={[
        {
          label: t('helpUseFilmPaper'),
          disabled: !catalog.stock(film)?.targetPrint,
          onSelect: () => {
            const tp = catalog.stock(film)?.targetPrint;
            if (tp) setParams((p) => ({ ...p, printStock: tp, scanFilm: false }));
          },
        },
      ]}
    >
      <StockList rows={rows} selected={film} onSelect={(id) => setParams((p) => ({ ...p, filmStock: id,printStock:catalog.stock(id)?.monochrome?'ilford_multigrade_iv_rc':catalog.stock(p.printStock)?.monochrome?'kodak_portra_endura':p.printStock }))} testId="film-list" />
    </Section>
  );
}

// ------------------------------------------------- Film Edge, Date Back (stubs)

function FilmEdgeSection() {
  const gate = useSession((s) => s.gate);
  const fe = useSession((s) => s.sidecar.params.filmEdge);
  const reason = unsupportedReason('overscan', gate.overscan);
  return (
    <Section id="filmEdge" title={t('sectionFilmEdge')} unsupported={reason}>
      <ToggleRow label={t('sectionFilmEdge')} on={fe.active} onChange={(v) => setParams((p) => ({ ...p, filmEdge: { ...p.filmEdge, active: v } }))} />
      <PillMenu
        label={t('edgeFormat')}
        disabled={fe.pair}
        value={fe.format}
        options={['135', '135_half', '135_xpan', '120_645', '120_6x6', '120_6x7', '120_6x8', '120_6x9', '120_6x12', '120_6x17'].map((v) => ({ value: v, label: v.replace('_', ' ') }))}
        onChange={(v) => setParams((p) => ({ ...p, filmEdge: { ...p.filmEdge, format: v } }))}
      />
      <PillMenu
        label={t('edgeView')}
        value={fe.view}
        options={[
          { value: 'strip', label: t('edgeViewStrip') },
          { value: 'filed', label: t('edgeViewFiled') },
        ]}
        onChange={(v) => setParams((p) => ({ ...p, filmEdge: { ...p.filmEdge, view: v } }))}
      />
      <PillMenu label={tz('Carrier','片夹')} value={fe.carrier}
        options={[{value:'black',label:tz('Black','黑色')},{value:'open',label:tz('Open','开放')},{value:'none',label:tz('None','无')}]}
        onChange={(v)=>setParams(p=>({...p,filmEdge:{...p.filmEdge,carrier:v}}))}/>
      <PillMenu label={tz('Perforations','齿孔')} value={fe.holes}
        options={[{value:'white',label:tz('Light','透光')},{value:'black',label:tz('Dark','黑色')}]}
        onChange={(v)=>setParams(p=>({...p,filmEdge:{...p.filmEdge,holes:v}}))}/>
      <NumberField label={tz('Frame number','画格编号')} value={fe.frameNumber} decimals={0}
        onCommit={(v)=>setParams(p=>({...p,filmEdge:{...p.filmEdge,frameNumber:clamp(Math.round(v),0,99)}}))}/>
      <label className="row-label">{tz('Edge text (blank: stock name)','片边文字（留空使用胶片名称）')}</label>
      <input aria-label="Film edge text" value={fe.edgeText} onChange={e=>setParams(p=>({...p,filmEdge:{...p.filmEdge,edgeText:e.target.value}}))}/>
      <ScrubSlider label={t('edgeFog')} value={fe.fog} range={[0, 4]} zero={1} onChange={(v) => setParams((p) => ({ ...p, filmEdge: { ...p.filmEdge, fog: v } }))} />
      <ScrubSlider label={t('edgeLeaks')} value={fe.leaks} range={[0, 4]} onChange={(v) => setParams((p) => ({ ...p, filmEdge: { ...p.filmEdge, leaks: v } }))} />
    </Section>
  );
}

function DateBackSection() {
  const gate = useSession((s) => s.gate);
  const d = useSession((s) => s.sidecar.params.dateBack);
  const paired=useSession(s=>s.sidecar.params.filmEdge.pair);
  const reason = unsupportedReason('date_imprint', gate.dateImprint);
  const set = (patch: Partial<typeof d>) => setParams((p) => ({ ...p, dateBack: { ...p.dateBack, ...patch } }));
  return (
    <Section id="dateBack" title={t('sectionDateBack')} unsupported={reason}>
      <ToggleRow label={t('dateImprint')} on={d.active} onChange={(v) => set({ active: v })} />
      <PillMenu
        label={t('dateFace')}
        value={d.face}
        options={[
          { value: 'lcd', label: 'LCD' },
          { value: 'dots', label: t('dateFaceDots') },
          { value: 'data', label: t('dateFaceData') },
        ]}
        onChange={(v) => set({ face: v })}
      />
      <PillMenu
        label={t('dateCorner')}
        value={d.corner}
        options={['br', 'bl', 'tr', 'tl'].map((v) => ({ value: v, label: v.toUpperCase() }))}
        onChange={(v) => set({ corner: v })}
      />
      <PillMenu label={tz('Date order','日期顺序')} value={d.order}
        options={[{value:'japan',label:'YY MM DD'},{value:'us',label:'MM DD YY'}]} onChange={order=>set({order})}/>
      <PillMenu label={tz('Placement','位置')} value={d.placement}
        options={[{value:'frame',label:tz('In frame','画面内')},{value:'margin',label:tz('Film margin','片边')}]}
        onChange={placement=>set({placement})}/>
      <label className="row-label">{tz('Custom date (blank: EXIF)','自定日期（留空使用拍摄日期）')}</label>
      <input aria-label="Custom date" value={d.customText??''} placeholder="'26 10 25" onChange={e=>set({customText:e.target.value || null})}/>
      {paired && <><label className="row-label">{tz('Second frame date (blank: EXIF)','第二格日期（留空使用拍摄日期）')}</label>
        <input aria-label="Second frame date" value={d.customTextB??''} onChange={e=>set({customTextB:e.target.value || null})}/></>}
      <ToggleRow label={tz('Include shooting data','附带拍摄数据')} on={d.withData} onChange={withData=>set({withData})}/>
      <input aria-label="Shooting data" value={d.dataText} placeholder="F5.6 1/250 ISO 100" onChange={e=>set({dataText:e.target.value})}/>
      <ScrubSlider label={t('dateSize')} value={d.size} range={[0.4, 3]} zero={1} onChange={(v) => set({ size: v })} />
      <ScrubSlider label={t('dateBrightness')} sublabel={t('dateStops')} value={d.brightnessEV} range={[-2, 8]} zero={3.5} onChange={(v) => set({ brightnessEV: v })} />
    </Section>
  );
}

// -------------------------------------------------------------------- Print

const POSITIVE_ID = '__positive';
const DIGITAL_ID = '__digital';

function PrintSection() {
  const catalog = useSession((s) => s.catalog);
  const p = useSession((s) => s.sidecar.params);
  const gate = useSession((s) => s.gate);
  const positive = catalog.isPositive(p.filmStock);
  const positiveReason = t('reasonPositiveFilmDisablesPaper');
  const diReason = unsupportedReason('digital_intermediate', gate.digitalIntermediate);
  const rows = [
    ...catalog.paperGroups().flatMap((g) =>
      g.papers.length
        ? [
            { id: '__g' + g.title, name: g.title === 'Still' ? t('printGroupStill') : t('printGroupCine'), header: true },
            ...g.papers.map((s) => ({ id: s.id, name: s.name, cine: s.use === 'cine', disabled: positive || !!s.monochrome!==!!catalog.stock(p.filmStock)?.monochrome, reason: positiveReason })),
          ]
        : [],
    ),
    { id: '__gDigital', name: t('printGroupDigital'), header: true },
    { id: DIGITAL_ID, name: t('printDigitalIntermediate'), disabled: positive || !!diReason, reason: diReason ?? positiveReason },
    { id: '__gPositive', name: tz('Positive', '正片'), header: true },
    { id: POSITIVE_ID, name: t('printNone') },
  ];
  const selected = p.scanFilm || positive ? POSITIVE_ID : p.digitalIntermediate && gate.digitalIntermediate ? DIGITAL_ID : p.printStock;
  return (
    <Section id="print" title={t('sectionPrint')}>
      <StockList
        rows={rows}
        selected={selected}
        testId="paper-list"
        onSelect={(id) => {
          if (id === POSITIVE_ID) setParams((q) => ({ ...q, scanFilm: true, digitalIntermediate: false }));
          else if (id === DIGITAL_ID) setParams((q) => ({ ...q, scanFilm: false, digitalIntermediate: true }));
          else if (!positive) setParams((q) => ({ ...q, printStock: id, scanFilm: false, digitalIntermediate: false }));
        }}
      />
      <ToggleRow label={t('printEffects')} on={p.printEffects} onChange={(v) => setParams((q) => ({ ...q, printEffects: v }))} />
      <ToggleRow
        label={t('printEDR')}
        sublabel={t('statusEDRScope')}
        on={p.extendedDynamicRange}
        disabled={p.scanFilm || positive || !!catalog.stock(p.printStock)?.monochrome}
        reason={t('reasonEDRDisabledInScanFilm')}
        onChange={(v) => setParams((q) => ({ ...q, extendedDynamicRange: v }))}
      />
    </Section>
  );
}

// --------------------------------------------------------------------- Crop

function CropSection() {
  const g = useSession((s) => s.sidecar.geometry);
  const native = useSession((s) => s.nativeSize);
  const size = native ?? { width: 3000, height: 2000 };
  const out = native ? outputSize(g, native) : null;
  const portrait = aspectIsPortrait(g.aspect);
  return (
    <Section
      id="crop"
      title={t('sectionCrop')}
      onReset={() => setGeometry(() => ({ ...g, crop: { x: 0, y: 0, width: 1, height: 1 }, angle: 0, aspect: 'free', intendedSize: null, lockedRatio: null }))}
      resetHelp={t('helpResetCrop')}
      menu={[
        { label: t('helpCropWholeFrame'), onSelect: () => setGeometry((q) => ({ ...q, crop: { x: 0, y: 0, width: 1, height: 1 }, intendedSize: null })) },
        { label: t('helpStraightenZero'), onSelect: () => setGeometry((q) => straightened(q, 0, size)) },
      ]}
    >
      <div className="row">
        <span className="row-label">{t('cropAspect')}</span>
        <PillMenu<CropAspect>
          fill
          value={aspectCanonical(g.aspect)}
          options={CROP_ASPECT_PICKER.map((a) => ({ value: a, label: a === 'free' ? t('cropAspectFree') : a === 'original' ? t('cropAspectOriginal') : aspectLabel(a) }))}
          onChange={(a) => setGeometry((q) => withAspect(q, portrait && aspectHasOrientation(a) ? aspectTransposed(a) : a, size))}
          testId="crop-aspect"
        />
        <Checkbox
          on={portrait}
          disabled={!aspectHasOrientation(g.aspect)}
          label={tz('Portrait', '竖向')}
          onChange={() => setGeometry((q) => withAspect(q, aspectTransposed(q.aspect), size))}
        />
      </div>
      <ScrubSlider
        label={t('cropStraighten')}
        sublabel={t('cropStraightenUnit')}
        value={g.angle}
        range={[-45, 45]}
        snap={0.5}
        format={(v) => signed(1)(v) + '°'}
        onChange={(v) => setGeometry((q) => straightened(q, v, size), { coalesce: true })}
        testId="straighten"
      />
      <div className="row">
        <span className="row-label">{t('cropRotate')}</span>
        <button className="icon-btn" title={tz('Rotate Left (Ctrl+Alt+[)', '向左旋转（Ctrl+Alt+[）')} onClick={() => setGeometry((q) => turned(q, -1))}>
          <RotateLeft />
        </button>
        <button className="icon-btn" title={tz('Rotate Right (Ctrl+Alt+])', '向右旋转（Ctrl+Alt+]）')} onClick={() => setGeometry((q) => turned(q, 1))} data-testid="rotate-right">
          <RotateRight />
        </button>
        <button className="icon-btn" title={tz('Flip Horizontally', '水平翻转')} onClick={() => setGeometry((q) => ({ ...q, flipH: !q.flipH }))}>
          <FlipH />
        </button>
        <button className="icon-btn" title={tz('Flip Vertically', '垂直翻转')} onClick={() => setGeometry((q) => ({ ...q, flipV: !q.flipV }))}>
          <FlipV />
        </button>
      </div>
      {out && (
        <div className="caption num" data-testid="crop-size">
          {out.width} × {out.height} · {((out.width * out.height) / 1e6).toFixed(1)} MP
        </div>
      )}
    </Section>
  );
}

// ----------------------------------------------------------------- Enlarger

function EnlargerSection() {
  const p = useSession((s) => editingParams(s));
  return (
    <Section
      id="enlarger"
      title={t('sectionEnlarger')}
      onReset={() => setEnlarger((q) => ({ ...q, printBrightnessStops: 0, yFilterShift: 0, mFilterShift: 0, preflashExposure: 0 }))}
      resetHelp={t('helpResetEnlarger')}
    >
      <ScrubSlider
        label={tz('Brightness', '亮度')}
        sublabel={tz('stops', '档')}
        value={p.printBrightnessStops}
        range={[-3, 3]}
        snap={0.25}
        format={signed(2)}
        onChange={(v) => setEnlarger((q) => ({ ...q, printBrightnessStops: v }))}
        testId="enlarger-brightness"
      />
      <ScrubSlider
        label={tz('Yellow', '黄')}
        sublabel={tz('→ blue', '→ 蓝')}
        value={p.yFilterShift}
        range={[-1, 1]}
        snap={0.05}
        format={signed(2)}
        gradient="linear-gradient(90deg,#b8a860,#8a8a8a,#6f7fb0)"
        onChange={(v) => setEnlarger((q) => ({ ...q, yFilterShift: v }))}
      />
      <ScrubSlider
        label={tz('Magenta', '品红')}
        sublabel={tz('→ green', '→ 绿')}
        value={p.mFilterShift}
        range={[-1, 1]}
        snap={0.05}
        format={signed(2)}
        gradient="linear-gradient(90deg,#b07cae,#8a8a8a,#7ca87c)"
        onChange={(v) => setEnlarger((q) => ({ ...q, mFilterShift: v }))}
      />
      <ScrubSlider
        label={t('enlargerPreflash')}
        sublabel="×100"
        value={p.preflashExposure * 100}
        range={[0, 3]}
        snap={0.25}
        disabled={!p.printEffects}
        reason={t('reasonPrintEffectsOff')}
        onChange={(v) => setEnlarger((q) => ({ ...q, preflashExposure: clamp(v / 100, 0, 0.03) }))}
      />
    </Section>
  );
}

void sessionStore;

function ToneMaskSection() {
  const p=useSession(s=>editingParams(s).contrastMask);
  const gate=useSession(s=>s.gate.contrastMask);
  const set=(v:Partial<typeof p>)=>setEnlarger(q=>({...q,contrastMask:{...q.contrastMask,...v}}));
  return <Section id="toneMask" title={tz('Tone mask','影调蒙版')} unsupported={unsupportedReason('contrast_mask',gate)}>
    <ToggleRow label={tz('Tone mask','影调蒙版')} on={p.active} onChange={active=>set({active})}/>
    <ScrubSlider label={tz('Highlights','高光')} value={p.highlights} range={[0,3]} onChange={highlights=>set({highlights})}/>
    <ScrubSlider label={tz('Shadows','阴影')} value={p.shadows} range={[0,3]} onChange={shadows=>set({shadows})}/>
    <ScrubSlider label={tz('Core','保护范围')} value={p.core} range={[0,3]} onChange={core=>set({core})}/>
    <ScrubSlider label={tz('Scale','尺度')} value={p.scale} range={[0.002,0.12]} onChange={scale=>set({scale})}/>
    <PillMenu label={tz('Method','方法')} value={p.scheme} options={[{value:'gaussian',label:tz('Gaussian','高斯')},{value:'guided',label:tz('Edge aware','边缘感知')}]} onChange={scheme=>set({scheme})}/>
  </Section>;
}

function PairSection() {
  const pair=useSession(s=>s.pair);
  const focus=useSession(s=>s.pairFocus);
  const side=focus==='film'?'left':focus;
  const hole=pair?.[side];
  const replace=async()=>{
    const paths=await platform().pickFiles(tz('Choose a source photo','选择源照片'));const path=paths[0];if(!path)return;
    const saved=decodeSidecar(await platform().sidecarLoad(path));
    updatePair({[side]:{path,geometry:saved.geometry,decode:saved.decode,exposureEV:0,autoExposure:saved.params.autoExposure,
      placement:{scale:1,x:0,y:0,quarterTurns:0}}});
  };
  return <Section id="halfFramePair" title={tz('Half-frame pair','半格双联')}>
    <button className="btn" onClick={()=>void createHalfFramePair()}>{tz('Create from two photos…','从两张照片创建…')}</button>
    {pair && <>
      <PillMenu label={tz('Frame','画格')} value={focus} options={[{value:'film',label:tz('Whole film','整条胶片')},{value:'left',label:tz('First','第一格')},{value:'right',label:tz('Second','第二格')}]} onChange={v=>sessionStore.setState({pairFocus:v as 'film'|'left'|'right'})}/>
      {focus!=='film' && <>
        <div className="caption">{hole?baseName(hole.path):tz('Empty frame','空画格')}</div>
        <button className="btn" onClick={()=>void replace()}>{tz('Replace photo…','替换照片…')}</button>
        <button className="btn" disabled={!hole || !pair[side==='left'?'right':'left']} onClick={()=>updatePair({[side]:null})}>{tz('Clear frame','清空画格')}</button>
      </>}
      <div className="caption">{tz('Choose a frame to edit its Enlarger and Post-Dev settings.','选择画格后，放大机和后期调色只编辑该画格。')}</div>
      <button className="btn" onClick={()=>updatePair({left:pair.right,right:pair.left})}>{tz('Swap frames','交换画格')}</button>
      <ToggleRow label={tz('Vertical pair','竖向双联')} on={pair.turned} onChange={turned=>updatePair({turned})}/>
      {!pair.onStrip && <ScrubSlider label={tz('Gap (mm)','间距（mm）')} value={pair.spacingMM} range={[0.5,2]} onChange={spacingMM=>updatePair({spacingMM})}/>}
      {hole && focus!=='film' && <>
        <PillMenu label={tz('Enlarger scope','放大机作用范围')} value={hole.printScope??'film'} options={[{value:'frame',label:tz('Frame','仅本格')},{value:'film',label:tz('Frame + film','本格与片基')}]} onChange={printScope=>updatePairHole(side,{printScope:printScope as 'film'|'frame'})}/>
        <button className="btn" onClick={()=>updatePairHole(side,{print:null,adjustments:null})}>{tz('Follow film print and grade','跟随整条胶片的配光与调色')}</button>
        <ToggleRow label={tz('Meter this frame','独立测光')} on={hole.autoExposure} onChange={autoExposure=>updatePairHole(side,{autoExposure,meteredEV:null})}/>
        <PillMenu label={tz('Exposure scope','曝光作用范围')} value={hole.exposureScope??'frame'} options={[{value:'frame',label:tz('Frame','仅本格')},{value:'film',label:tz('Frame + film','本格与片基')}]} onChange={exposureScope=>updatePairHole(side,{exposureScope:exposureScope as 'frame'|'film'})}/>
        <PillMenu label={tz('Metering intent','测光方式')} value={hole.meterMethod??'center_weighted'} options={['center_weighted','balanced','center','protect_highlights','protect_shadows'].map(value=>({value,label:value}))} onChange={meterMethod=>updatePairHole(side,{meterMethod})}/>
        <ScrubSlider label={tz('Frame exposure','本格曝光')} value={hole.exposureEV} range={[-8,8]} onChange={exposureEV=>updatePairHole(side,{exposureEV})}/>
        <ScrubSlider label={tz('Scale','缩放')} value={hole.placement.scale} range={[1,4]} onChange={scale=>updatePairHole(side,{placement:{...hole.placement,scale}})}/>
        <ScrubSlider label={tz('Horizontal position','水平位置')} value={hole.placement.x} range={[-1,1]} onChange={x=>updatePairHole(side,{placement:{...hole.placement,x}})}/>
        <ScrubSlider label={tz('Vertical position','垂直位置')} value={hole.placement.y} range={[-1,1]} onChange={y=>updatePairHole(side,{placement:{...hole.placement,y}})}/>
        <button className="btn" onClick={()=>updatePairHole(side,{placement:{...hole.placement,quarterTurns:(hole.placement.quarterTurns+1)%4}})}>{tz('Rotate this frame','旋转本格')}</button>
        {isRawPath(hole.path) && <>
          <ToggleRow label={tz('As Shot white balance','拍摄白平衡')} on={hole.decode.whiteBalance==='As Shot'} onChange={on=>updatePairHole(side,{decode:{...hole.decode,whiteBalance:on?'As Shot':'Custom'}})}/>
          {hole.decode.whiteBalance!=='As Shot' && <>
            <ScrubSlider label={tz('Temperature','色温')} value={hole.decode.temperature} range={[2000,50000]} onChange={temperature=>updatePairHole(side,{decode:{...hole.decode,temperature},meteredEV:null})}/>
            <ScrubSlider label={tz('Tint','色调')} value={hole.decode.tint} range={[-150,150]} onChange={tint=>updatePairHole(side,{decode:{...hole.decode,tint},meteredEV:null})}/>
          </>}
        </>}
      </>}
    </>}
  </Section>;
}
