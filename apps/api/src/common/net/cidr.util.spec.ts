import { ipToInt, isIpInCidr, parseCidr } from './cidr.util';

describe('cidr.util', () => {
  describe('ipToInt', () => {
    it('정상 IPv4 주소를 정수로 변환한다', () => {
      expect(ipToInt('0.0.0.0')).toBe(0);
      expect(ipToInt('255.255.255.255')).toBe(0xffffffff);
      expect(ipToInt('203.0.113.5')).toBe(203 * 2 ** 24 + 0 * 2 ** 16 + 113 * 2 ** 8 + 5);
    });

    it('IPv4가 아니면 null을 반환한다(판정 불가는 항상 거부로 이어져야 한다)', () => {
      expect(ipToInt('::1')).toBeNull();
      expect(ipToInt('not-an-ip')).toBeNull();
      expect(ipToInt('1.2.3')).toBeNull();
      expect(ipToInt('1.2.3.4.5')).toBeNull();
      expect(ipToInt('256.0.0.1')).toBeNull();
    });
  });

  describe('parseCidr', () => {
    it('정상 CIDR을 파싱한다', () => {
      expect(parseCidr('203.0.113.0/24')).toEqual({ base: ipToInt('203.0.113.0'), prefixLength: 24 });
      expect(parseCidr('10.0.0.5/32')).toEqual({ base: ipToInt('10.0.0.5'), prefixLength: 32 });
    });

    it('잘못된 CIDR 문자열은 throw한다(조용히 무의미해지지 않는다)', () => {
      expect(() => parseCidr('203.0.113.0')).toThrow();
      expect(() => parseCidr('203.0.113.0/33')).toThrow();
      expect(() => parseCidr('203.0.113.0/-1')).toThrow();
      expect(() => parseCidr('not-an-ip/24')).toThrow();
      expect(() => parseCidr('203.0.113.0/abc')).toThrow();
    });
  });

  describe('isIpInCidr', () => {
    it('/24 대역 안의 주소는 허용된다', () => {
      expect(isIpInCidr('203.0.113.5', '203.0.113.0/24')).toBe(true);
      expect(isIpInCidr('203.0.113.255', '203.0.113.0/24')).toBe(true);
    });

    it('/24 대역 밖의 주소는 거부된다', () => {
      expect(isIpInCidr('203.0.114.1', '203.0.113.0/24')).toBe(false);
      expect(isIpInCidr('202.0.113.5', '203.0.113.0/24')).toBe(false);
    });

    it('/32(단일 호스트)는 정확히 그 주소만 허용한다', () => {
      expect(isIpInCidr('10.0.0.5', '10.0.0.5/32')).toBe(true);
      expect(isIpInCidr('10.0.0.6', '10.0.0.5/32')).toBe(false);
    });

    it('/0은 모든 IPv4 주소를 허용한다(경계값)', () => {
      expect(isIpInCidr('1.2.3.4', '0.0.0.0/0')).toBe(true);
      expect(isIpInCidr('255.255.255.255', '0.0.0.0/0')).toBe(true);
    });

    it('IPv4가 아닌 입력은 항상 거부한다', () => {
      expect(isIpInCidr('::1', '0.0.0.0/0')).toBe(false);
      expect(isIpInCidr('garbage', '10.0.0.0/8')).toBe(false);
    });
  });
});
