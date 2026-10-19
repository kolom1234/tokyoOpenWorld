// 장면에서 영구히 빼는 오브젝트의 렌더러 캐시 해제(M11-T02 누수 수정): three r186 RenderObject는 메시(Object3D)·머티리얼의 'dispose' 이벤트로만
// 캐시(RenderObjects 체인 맵)에서 빠진다 — geometry.dispose()만으로는 남고, 공유 머티리얼의 리스너가 RenderObject → 메시 → 정점 배열을 붙잡는다
// (1시간 소크 힙 +92 MB/분). 그래서 빼는 하위 트리의 모든 오브젝트에 'dispose'를 보낸다(머티리얼·공유 지오메트리는 건드리지 않는다).
import type { Object3D } from 'three';

export function releaseRenderObjects(root: Object3D): void {
  root.traverse((o) => {
    (o as Object3D & { dispatchEvent(e: { type: 'dispose' }): void }).dispatchEvent({ type: 'dispose' });
  });
}
