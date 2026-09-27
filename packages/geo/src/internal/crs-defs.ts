// EPSG 정의 문자열 고정(외부 조회 금지). pyproj(PROJ 9.5) `CRS.to_proj4()` 출력과 동일한 파라미터. see docs/modules/geo.md
// proj4js의 `tmerc`는 Poder/Engsager 확장 TM(etmerc)으로 구현되어 PROJ 기본 tmerc와 같은 알고리즘이다(+approx 미사용).

/** EPSG:6668 — JGD2011 지리좌표(경도, 위도). 수평 전용. */
export const DEF_EPSG_6668 = '+proj=longlat +ellps=GRS80 +no_defs';

/** EPSG:6697 — JGD2011 + JGD2011 (vertical) height(=T.P.). 수평 정의는 6668과 같고 높이는 그대로 통과한다. */
export const DEF_EPSG_6697 = '+proj=longlat +ellps=GRS80 +vunits=m +no_defs';

/** EPSG:6677 — 평면직각좌표계 IX계(원점 36°N, 139°50′E, k0=0.9999). proj4 입출력은 (easting, northing). */
export const DEF_EPSG_6677 =
  '+proj=tmerc +lat_0=36 +lon_0=139.833333333333 +k=0.9999 +x_0=0 +y_0=0 +ellps=GRS80 +units=m +no_defs';
