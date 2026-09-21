import { haversineDistanceMeters } from './haversine.util';

describe('haversineDistanceMeters', () => {
  it('같은 지점의 거리는 0이다', () => {
    expect(haversineDistanceMeters({ lat: 37.5665, lng: 126.978 }, { lat: 37.5665, lng: 126.978 })).toBe(0);
  });

  it('위도 1도 차이는 약 111.32km다(자오선 곡률 반경 기준)', () => {
    const distance = haversineDistanceMeters({ lat: 37.0, lng: 127.0 }, { lat: 38.0, lng: 127.0 });
    expect(distance).toBeGreaterThan(110_000);
    expect(distance).toBeLessThan(112_000);
  });

  it('서울시청(37.5665,126.9780) - 강남역(37.4979,127.0276) 실측 거리(약 9.4km)와 근접한다', () => {
    const distance = haversineDistanceMeters({ lat: 37.5665, lng: 126.978 }, { lat: 37.4979, lng: 127.0276 });
    expect(distance).toBeGreaterThan(8500);
    expect(distance).toBeLessThan(10500);
  });
});
