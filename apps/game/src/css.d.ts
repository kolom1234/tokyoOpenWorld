// Vite 처리 선언: CSS 부수 효과 import(UI 글꼴 @font-face — main.ts), define `__SANPO_VERSION__`(번들 커밋 — 오류 보고 M11-T03),
// `__SANPO_DEBUG_TOOLS__`(진단 도구 포함 — production 배포 빌드 false, ADR-0103).
declare module '*.css';
declare const __SANPO_VERSION__: string;
declare const __SANPO_DEBUG_TOOLS__: boolean;
