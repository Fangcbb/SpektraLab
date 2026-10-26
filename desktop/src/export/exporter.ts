// exporter.ts — write the open frame through a recipe (`Export/Exporter.swift`).
//
// The file is the canvas's frame (trap 33): the engine's print, Layer 2, then
// the geometry. With the host's `write_image` (PROTOCOL-REQUESTS R1) the app
// renders `full` as rgba16 in the recipe's space, grades and crops it here —
// the same arithmetic as the canvas shader (`layer2Pixel`, `sourcePoint`) —
// and hands the pixels to the host, which embeds the ICC profile and lands
// the file whole. Without it, `export_image` writes the engine's print and the
// page says that the crop and the grade are not in the file.

import { type Adjustments, PROPHOTO_MID_GREY, SRGB_MID_GREY, isNeutral } from '@shared/adjustments';
import type { HalfFramePair } from '@shared/pair';
import { pixelsInWorker } from '../canvas/pixelWorker';
export { filePixels } from '@shared/pixelEdits';
import { type Geometry, isIdentity, outputSize } from '@shared/geometry';
import { canvasGeometry } from '@shared/filmGeometry';
import type { FilmParams } from '@shared/params';
import type { StockCatalog } from '@shared/stocks';
import { host } from '../host/client';
import { baseName, dirName, joinPath, platform } from '../platform';
import { type ExportRecipe, extensionOf, hostFormat, resolveTarget, stem, stockToken } from './recipes';

export interface FrameToExport {
  path: string;
  session: string;
  params: FilmParams;
  adjustments: Adjustments;
  geometry: Geometry;
  native: { width: number; height: number };
  dateTaken?: string;
  pair?:HalfFramePair|null;
}

export type ExportOutcome =
  | { kind: 'written'; path: string; width: number; height: number; carriesEdits: boolean }
  | { kind: 'skipped'; path: string }
  | { kind: 'failed'; message: string };

export function hostWrites(methods: readonly string[] | undefined): boolean {
  return !!methods?.includes('write_image');
}

export async function targetFor(r: ExportRecipe, f: FrameToExport, catalog: StockCatalog) {
  const dir0 = r.folder.kind === 'fixed' ? r.folder.path : dirName(f.path);
  const dir = r.subfolder.trim() ? joinPath(dir0, r.subfolder.trim()) : dir0;
  const name = baseName(f.path).replace(/\.[^.]+$/, '');
  const date = f.dateTaken ? new Date(f.dateTaken) : new Date();
  const base = stem(r, {
    originalName: name,
    filmStock: stockToken(catalog.stock(f.params.filmStock)?.name ?? f.params.filmStock),
    printStock: f.params.scanFilm ? 'Scan' : stockToken(catalog.stock(f.params.printStock)?.name ?? f.params.printStock),
    date: Number.isFinite(date.getTime()) ? date : new Date(),
  });
  return { dir, base };
}

export function outputFor(r: ExportRecipe, g: Geometry, native: { width: number; height: number }) {
  const o = outputSize(g, native);
  if (!r.longEdge || r.longEdge >= Math.max(o.width, o.height)) return o;
  const k = r.longEdge / Math.max(o.width, o.height);
  return { width: Math.max(1, Math.round(o.width * k)), height: Math.max(1, Math.round(o.height * k)) };
}

export async function exportFrame(r: ExportRecipe, f: FrameToExport, catalog: StockCatalog, methods: readonly string[] | undefined): Promise<ExportOutcome> {
  try {
    f={...f,geometry:canvasGeometry(f.params,f.geometry)};
    const { dir, base } = await targetFor(r, f, catalog);
    await platform().ensureDir(dir);
    const target = await resolveTarget(dir, base, extensionOf(r), r.existing, (p) => platform().pathExists(p), joinPath);
    if (!target) return { kind: 'skipped', path: joinPath(dir, `${base}.${extensionOf(r)}`) };
    if (r.format === 'di') {
      const res = await host().exportDi(f.session, f.params.printStock, target.path);
      return { kind: 'written', path: res.path, width: 0, height: 0, carriesEdits: false };
    }
    const edited = !isIdentity(f.geometry) || (f.adjustments.enabled && !isNeutral(f.adjustments));
    if (hostWrites(methods)) {
      const display = r.colorSpace === 'sRGB' ? 'srgb' : r.colorSpace;
      const rr = await host().transport.request(
        'render',
        { session: f.session, tier: 'full', format: 'rgba16', display },
        { timeoutMs: 1_800_000 },
      );
      const info = rr.result.image as { width: number; height: number; row_bytes: number };
      const src = new Uint16Array(rr.payload.buffer.slice(rr.payload.byteOffset, rr.payload.byteOffset + info.width * info.height * 8));
      const out = outputFor(r, f.geometry, { width: info.width, height: info.height });
      const midGrey = r.colorSpace === 'prophoto' ? PROPHOTO_MID_GREY : SRGB_MID_GREY;
      const pair=f.pair && (f.pair.left?.adjustments || f.pair.right?.adjustments)?{gates:(rr.result.pair_gates as number[][])??[],adjustments:[f.pair.left?.adjustments??null,f.pair.right?.adjustments??null]}:undefined;
      const px = await pixelsInWorker({src,srcSize:info,geometry:f.geometry,adjustments:f.adjustments,out,midGrey,pair});
      const w = await host().transport.request(
        'write_image',
        {
          path: target.path,
          format: hostFormat(r),
          quality: r.format === 'jpeg' ? r.quality : undefined,
          color_space: r.colorSpace,
          width: out.width,
          height: out.height,
          overwrite: target.overwrite,
          source_path: f.path,
        },
        { payload: new Uint8Array(px.buffer), timeoutMs: 600_000 },
      );
      return { kind: 'written', path: String(w.result.path), width: out.width, height: out.height, carriesEdits: true };
    }
    const res = await host().exportImage({
      session: f.session,
      path: target.path,
      format: hostFormat(r),
      quality: r.format === 'jpeg' ? r.quality : undefined,
      color_space: r.colorSpace,
      long_edge: r.longEdge || undefined,
      overwrite: target.overwrite,
    });
    return { kind: 'written', path: res.path, width: res.width, height: res.height, carriesEdits: !edited };
  } catch (e) {
    return { kind: 'failed', message: (e as Error).message };
  }
}

export async function exportCube(printStock: string, suggested: string): Promise<string | null> {
  const p = await platform().pickSave('Export .cube', suggested, 'cube');
  if (!p) return null;
  const r = await host().exportCube(printStock, p);
  return r.path;
}
