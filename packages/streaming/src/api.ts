// @sanpo/streaming 공개 계약(타입·인터페이스). M02-T01 = 설정(관심·우선순위·상주 한도)만. see docs/modules/streaming.md, docs/06-world-streaming.md §3–4, §9
import type { ModeId, QualityTier } from '@sanpo/core';

/** 관심점 → 레벨별 원하는 셀 집합 설정(06 §3, ADR-0021). 반경은 관심점~셀 AABB 수평 최단거리(m). */
export interface InterestConfig {
  /** 모드별 L0 로드 반경 R0(품질 배율 전). freecam은 고도 0 m 값이고 `freecamRadiusPerAltitudeM`만큼 커진다. */
  l0RadiusByModeM: Readonly<Record<ModeId, number>>;
  /** freecam R0 = 기본 + 이 값 × 고도(지면 기준 m). */
  freecamRadiusPerAltitudeM: number;
  /** 품질 티어별 R0 배율(07 §9). */
  l0RadiusScaleByTier: Readonly<Record<QualityTier, number>>;
  /** 배율 적용 후 R0 상한. */
  l0RadiusMaxM: number;
  /** 해제 반경 = 로드 반경 × 이 값(히스테리시스). 고도 전환(고고도 진입/이탈)에도 같은 비율을 쓴다. */
  releaseFactor: number;
  /** 이 고도(지면 기준 m) 초과면 L0는 관심점 셀 중심 (2r+1)² 링만 로드한다. */
  highAltitudeM: number;
  /** 고고도 L0 로드 링 반경(셀). 1 = 3×3. */
  highAltitudeLoadRing: number;
  /** 고고도 L0 유지 링 반경(셀, 고도 > highAltitudeM × releaseFactor일 때). 2 = 5×5. */
  highAltitudeKeepRing: number;
  /** L1 로드 반경(고도 ≤ highAltitudeM). */
  l1RadiusM: number;
  /** 고고도 L1 확장: R1 = l1RadiusM + 이 값 × (고도 − highAltitudeM). */
  l1RadiusPerAltitudeM: number;
  /** 확장 후 R1 상한. */
  l1RadiusMaxM: number;
  /** L2 로드 반경. L3는 cells.idx의 전 셀(해제 없음). */
  l2RadiusM: number;
  /** train 진행 방향 가중: 뒤쪽 셀 거리 × (1 + 이 값 × max(0, −cosθ)). 0이면 끔. */
  trainBehindPenalty: number;
  /** 진행 방향 가중을 적용하는 최소 수평 속도(m/s). */
  directionMinSpeedMs: number;
}

/** 요청 우선순위 설정(06 §4, ADR-0021). 점수는 낮을수록 먼저. */
export interface PriorityConfig {
  /** 뷰 쐐기(카메라 forward 수평 반각) 안 셀의 점수 배율. */
  inViewFactor: number;
  /** 뷰 쐐기 수평 반각(도). */
  viewHalfAngleDeg: number;
  /** teleport 관심점 거리 배율. */
  teleportFactor: number;
  /** 발밑 셀(player·teleport가 든 L0 셀) 고정 점수. 다른 모든 점수(≥ 0)보다 작아야 한다. */
  footScore: number;
  /** 부모 선행: 부모가 같은 요청 후보면 자식 점수 ≥ 부모 점수 + 이 값. */
  parentEpsilon: number;
}

export interface StreamingConfig {
  interest: InterestConfig;
  priority: PriorityConfig;
  /** 레벨별 최대 상주 셀 수(소프트 리밋, index = 레벨). 로드 반경 안 셀은 초과해도 해제하지 않는다. */
  residentMax: readonly [number, number, number, number];
}
