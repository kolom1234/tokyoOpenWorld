// opentype.js 2.0.0(MIT)은 타입 선언이 없다 — 간판 아틀라스(signage/run.ts)가 쓰는 parse만 선언. 글꼴 객체는 atlas.ts GlyphFont로 좁혀 쓴다.
declare module 'opentype.js' {
  const opentype: { parse(buffer: ArrayBuffer): unknown };
  export default opentype;
}
