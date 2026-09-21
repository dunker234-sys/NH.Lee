import { EmployeePrincipal } from '../api/authApi';

// AuthContext(React)와 목업 API 모듈(순수 모듈, 훅을 쓸 수 없음) 사이의
// 작은 다리 — 목업 데이터를 employeeNo로 시드하기 위해서만 쓴다. 실제
// 인증/인가 판단에는 절대 쓰지 않는다(그건 항상 서버 JWT/principal이 한다).
let current: EmployeePrincipal | null = null;

export const currentPrincipalStore = {
  set(p: EmployeePrincipal | null): void {
    current = p;
  },
  get(): EmployeePrincipal | null {
    return current;
  },
};
