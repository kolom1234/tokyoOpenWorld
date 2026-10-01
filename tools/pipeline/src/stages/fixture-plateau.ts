// plateau-mini 픽스처: 원천 CityGML에서 셀 1개의 건물 몇 동·도로 몇 개만 잘라 같은 파일 이름으로 기록. see docs/14-testing-perf.md §1, docs/modules/pipeline.md
// 자르기는 텍스트 단위(헤더 + 선택한 `<core:cityObjectMember>` 원문 + 닫는 태그)라 원천 바이트를 그대로 보존한다.
// 대형 appearance 블록(텍스처 좌표)은 헤더에서 빠진다 → 픽스처 건물에는 UV/텍스처가 없다.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { type CellKey, cellIdString } from '@sanpo/core';
import { cellBoundsWF, cellOf } from '@sanpo/geo';
import { clipRingsToRect } from '../lib/polygon.ts';
import { parseCityGmlString } from '../readers/plateau/citygml-sax.ts';
import { centroidXZ } from '../readers/plateau/geometry.ts';
import type { NormalizedFeature } from '../readers/plateau/types.ts';
import { plateauFilesForCells } from './normalize-plateau.ts';

const MEMBER_OPEN = '<core:cityObjectMember>';
const MEMBER_CLOSE = '</core:cityObjectMember>';
const MODEL_CLOSE = '</core:CityModel>\n';
const BOM = '﻿';

export interface PlateauMiniOptions {
  sourceId: string;
  /** 원천 루트(`udx/<layer>/*.gml`). */
  rawRoot: string;
  cell: CellKey;
  /** 기록 루트(그 아래 `udx/<layer>/<원래 파일 이름>`). */
  outRoot: string;
  buildings: number;
  roads: number;
  /** 이보다 큰 member(원문 바이트)는 후보에서 뺀다(픽스처 크기 제한). */
  maxMemberBytes: number;
}

interface Candidate {
  file: string;
  start: number;
  chunk: string;
  layer: 'bldg' | 'tran';
  id: string;
  height: number;
}

/** 파일 텍스트 → 헤더(첫 appearance/member 전까지)와 member 원문 목록(시작 위치 포함). */
export function splitCityGml(text: string): { header: string; members: { start: number; chunk: string }[] } {
  const firstMember = text.indexOf(MEMBER_OPEN);
  const firstApp = text.indexOf('<app:appearanceMember>');
  const cut = [firstMember, firstApp].filter((i) => i >= 0);
  const headerEnd = cut.length > 0 ? Math.min(...cut) : text.length;
  const members: { start: number; chunk: string }[] = [];
  for (let i = firstMember; i >= 0; i = text.indexOf(MEMBER_OPEN, i + 1)) {
    const end = text.indexOf(MEMBER_CLOSE, i);
    if (end < 0) break;
    members.push({ start: i, chunk: `\t${text.slice(i, end + MEMBER_CLOSE.length)}\n` });
  }
  return { header: text.slice(0, headerEnd).replace(/[\t ]*$/, ''), members };
}

function inCell(f: NormalizedFeature, cell: CellKey): boolean {
  if (f.layer === 'buildings' || f.layer === 'bridges') {
    const c = centroidXZ(f.surfaces.map((s) => s.ringsWF));
    return c !== null && cellOf(0, c.x, c.z) === cell;
  }
  return clipRingsToRect(f.polygonWF, cellBoundsWF(cell)) !== null;
}

function candidatesOf(file: string, opts: PlateauMiniOptions): { header: string; list: Candidate[] } {
  const text = readFileSync(file, 'utf8');
  const { header, members } = splitCityGml(text);
  const layer = basename(dirname(file)) === 'tran' ? 'tran' : 'bldg';
  const list: Candidate[] = [];
  for (const m of members) {
    if (Buffer.byteLength(m.chunk) > opts.maxMemberBytes) continue;
    const feats = parseCityGmlString(`${header.replace(BOM, '')}\n${m.chunk}${MODEL_CLOSE}`, opts.sourceId);
    const hit = feats.find((f) => inCell(f, opts.cell));
    if (!hit) continue;
    const id = hit.layer === 'roads' ? hit.roadId : hit.gmlId;
    const height = hit.layer === 'buildings' ? (hit.measuredHeightM ?? 0) : 0;
    list.push({ file, start: m.start, chunk: m.chunk, layer, id, height });
  }
  return { header, list };
}

/** 건물 = 높은 순(동률 id 순), 도로 = 작은 원문 순(동률 id 순) — 결정론. */
function pick(all: Candidate[], opts: PlateauMiniOptions): Candidate[] {
  const byId = (a: Candidate, b: Candidate): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const bldg = all
    .filter((c) => c.layer === 'bldg')
    .sort((a, b) => b.height - a.height || byId(a, b))
    .slice(0, opts.buildings);
  const tran = all
    .filter((c) => c.layer === 'tran')
    .sort((a, b) => a.chunk.length - b.chunk.length || byId(a, b))
    .slice(0, opts.roads);
  return [...bldg, ...tran];
}

/** 원천 → plateau-mini GML 파일들. 반환 = 기록한 파일(outRoot 기준 상대 경로)과 고른 id. */
export function extractPlateauMini(opts: PlateauMiniOptions): { files: string[]; ids: string[] } {
  const headers = new Map<string, string>();
  const all: Candidate[] = [];
  for (const file of plateauFilesForCells(opts.rawRoot, [opts.cell])) {
    const { header, list } = candidatesOf(file, opts);
    headers.set(file, header);
    all.push(...list);
  }
  const chosen = pick(all, opts);
  if (chosen.filter((c) => c.layer === 'bldg').length < opts.buildings) {
    throw new Error(`extractPlateauMini: < ${opts.buildings} buildings in ${cellIdString(opts.cell)}`);
  }
  const files: string[] = [];
  for (const file of [...new Set(chosen.map((c) => c.file))].sort()) {
    const members = chosen.filter((c) => c.file === file).sort((a, b) => a.start - b.start);
    const rel = join('udx', basename(dirname(file)), basename(file));
    const out = join(opts.outRoot, rel);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, `${headers.get(file) ?? ''}\n${members.map((m) => m.chunk).join('')}${MODEL_CLOSE}`);
    files.push(rel.replaceAll('\\', '/'));
  }
  return { files, ids: chosen.map((c) => c.id) };
}
