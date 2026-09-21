/**
 * ApiAdapter 인증 방식 플러그인. 인사시스템 REST API가 어떤 인증을 쓰든
 * ApiHrSourceAdapter 본체는 건드리지 않고 이 인터페이스의 새 구현체만
 * 추가하면 되게 한다.
 */
export interface HrApiAuthStrategy {
  /** 요청에 실어 보낼 인증 헤더를 만든다. */
  getAuthHeaders(): Promise<Record<string, string>>;
}

export const HR_API_AUTH_STRATEGY = Symbol('HR_API_AUTH_STRATEGY');
