// 지오펜스 거리 계산. packages/core-rules(근로시간 계산 전용 순수함수 패키지)가
// 아니라 여기 둔다 — 위경도 거리는 근로시간 계산이 아니다. 여기서는 부동소수점을
// 써도 된다: CLAUDE.md 절대 규칙 6("시간 계산에 부동소수점을 쓰지 않는다")은
// 시간 값에 관한 것이지 지리 좌표 계산이 아니다.

export interface GeoPoint {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_M = 6371000;

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function haversineDistanceMeters(a: GeoPoint, b: GeoPoint): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return EARTH_RADIUS_M * c;
}
