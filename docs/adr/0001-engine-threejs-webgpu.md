# ADR-0001: Engine: three.js WebGPURenderer + TSL
- Status: Accepted
- Date: 2026-09-27

## Context
브라우저 배포(Cloudflare) 필수, 최대한 사실적인 그래픽 요구. 후보: three.js, Babylon.js, 네이티브 엔진(Unreal/Unity) 웹 빌드.

## Decision
three.js 0.186.x `WebGPURenderer`(WebGL2 자동 폴백) + TSL 노드 머티리얼을 사용한다. 대기는 @takram/three-atmosphere(webgpu).

## Consequences
사실적 렌더 부품(SunLight CSM, SSGI/SSR/GTAO/TRAA, ClusteredLights)을 addon으로 확보. 대신 addon API 변동이 잦아 버전 고정 + 업그레이드 태스크 운영 필요.

## Alternatives
Babylon.js(우수하나 지리·대기 생태계 열세), Unreal/Unity(브라우저 요구와 불일치, 번들 과대).
