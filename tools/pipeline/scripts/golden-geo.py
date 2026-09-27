#!/usr/bin/env python3
"""@sanpo/geo 골든 값 생성기: pyproj(PROJ)로 기준점 20개의 EPSG:6668 → EPSG:6677 → WF 값을 산출한다.

see docs/14-testing-perf.md §1(골든 값), docs/01-architecture.md §7, docs/modules/geo.md

사용법:
    pip install pyproj==3.7.2
    python3 tools/pipeline/scripts/golden-geo.py            # packages/geo/test/golden.json 재생성
    python3 tools/pipeline/scripts/golden-geo.py --check    # 커밋본과 다르면 종료코드 1

출력은 결정론적이다(입력 순서 고정, float는 Python repr = 최단 왕복 표현).
기준점 위경도는 공개 지도 기준 대략값이며, 랜드마크 이름은 라벨일 뿐 측량 기준점이 아니다.
"""

import json
import math
import sys
from pathlib import Path

import pyproj
from pyproj import CRS, Proj, Transformer

# docs/01-architecture.md §7 — WF 원점(EPSG:6677). packages/geo/src/api.ts WORLD_ORIGIN과 일치해야 한다.
E0 = -12000.0
N0 = -37760.0

OUT = Path(__file__).resolve().parents[3] / "packages" / "geo" / "test" / "golden.json"

# (id, lat, lon, heightTP[m]) — 순서 고정. 높이는 y 통과 검증용(측량값 아님).
POINTS = [
    ("shibuya-scramble", 35.6595, 139.70055, 15.0),
    ("shibuya-station", 35.6580, 139.7016, 16.5),
    ("harajuku-station", 35.6702, 139.7027, 34.0),
    ("shinjuku-station", 35.6896, 139.7006, 38.5),
    ("tocho", 35.6896, 139.6917, 243.0),
    ("meiji-jingu", 35.6764, 139.6993, 36.0),
    ("yoyogi-park", 35.6717, 139.6949, 33.0),
    ("shinjuku-gyoen", 35.6852, 139.7101, 32.0),
    ("yoyogi-station", 35.6830, 139.7020, 37.0),
    ("omotesando", 35.6654, 139.7121, 30.0),
    ("ebisu-station", 35.6467, 139.7101, 20.0),
    ("world-origin", None, None, 0.0),  # WF (0, 0, 0) — 역변환으로 위경도를 정한다
    ("tokyo-station", 35.6812, 139.7671, 3.5),
    ("tokyo-tower", 35.6586, 139.7454, 333.0),
    ("skytree", 35.7101, 139.8107, 634.0),
    ("haneda", 35.5494, 139.7798, 5.0),
    ("oizumi-gakuen", 35.7497, 139.5869, 45.0),
    ("kasai", 35.6437, 139.8616, -1.5),  # 해발 이하(제로미터 지대)
    ("crs-origin", 36.0, 139.0 + 50.0 / 60.0, 0.0),  # IX계 원점 → PRJ (0, 0)
    ("negative-cell-edge", 35.6594, 139.7001, 14.0),  # WF x<0, z>0 근방(음수 셀 인덱스)
]

DECIMALS_ORIGIN = 10  # 원점 역변환 위경도 반올림(1e-10° ≈ 11 µm)


def make_transformers():
    geo = CRS.from_epsg(6668)
    prj = CRS.from_epsg(6677)
    fwd = Transformer.from_crs(geo, prj)  # 권위 축순서: (lat, lon) → (X=북, Y=동)
    inv = Transformer.from_crs(prj, geo)
    return fwd, inv, Proj(prj)


def convergence_deg(proj, lat, lon):
    """도북 − 진북(도, 시계방향 +). PROJ의 meridian_convergence와 부호가 같은지 수치 미분으로 교차 검증한다."""
    factors = proj.get_factors(lon, lat)
    gamma = float(factors.meridian_convergence)
    d = 1e-6
    e1, n1 = proj(lon, lat - d)
    e2, n2 = proj(lon, lat + d)
    numeric = -math.degrees(math.atan2(e2 - e1, n2 - n1))
    if abs(numeric - gamma) > 1e-7:
        raise SystemExit(f"convergence sign/value mismatch at {lat},{lon}: factors={gamma} numeric={numeric}")
    return gamma


def build():
    fwd, inv, proj = make_transformers()
    points = []
    for pid, lat, lon, h in POINTS:
        if lat is None:
            lat, lon = inv.transform(N0, E0)
            lat, lon = round(lat, DECIMALS_ORIGIN), round(lon, DECIMALS_ORIGIN)
        northing, easting = fwd.transform(lat, lon)
        points.append({
            "id": pid,
            "lat": lat,
            "lon": lon,
            "heightTP": h,
            "northing": northing,
            "easting": easting,
            "wf": {"x": easting - E0, "y": h, "z": -(northing - N0)},
            "convergenceDeg": convergence_deg(proj, lat, lon),
        })
    return {
        "generator": "tools/pipeline/scripts/golden-geo.py",
        "pyproj": pyproj.__version__,
        "proj": pyproj.proj_version_str,
        "operation": fwd.description,
        "origin": {"E0": E0, "N0": N0, "epsg": "EPSG:6677"},
        "points": points,
    }


def main():
    text = json.dumps(build(), indent=2, ensure_ascii=False) + "\n"
    if "--check" in sys.argv:
        if OUT.read_text(encoding="utf-8") != text:
            print(f"{OUT} is stale; rerun without --check", file=sys.stderr)
            sys.exit(1)
        return
    OUT.write_text(text, encoding="utf-8")
    print(f"wrote {OUT} ({len(POINTS)} points)")


if __name__ == "__main__":
    main()
