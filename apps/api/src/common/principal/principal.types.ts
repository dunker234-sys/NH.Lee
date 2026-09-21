import { EmployeeRole, EmployeeStatus } from '@prisma/client';

/**
 * 이 시스템의 모든 데이터 접근은 Principal을 통해 이뤄진다.
 * SYSTEM은 로그인 컨텍스트가 없는 배치·큐 워커 전용 1급 개념이다 —
 * HTTP 요청에서는 절대 등장하지 않는다(JwtAuthGuard/PrincipalGuard는 항상
 * EmployeePrincipal만 만든다).
 */
export type Principal = EmployeePrincipal | SystemPrincipal;

export interface EmployeePrincipal {
  kind: 'EMPLOYEE';
  employeeId: string;
  employeeNo: string;
  role: EmployeeRole;
  status: EmployeeStatus;
}

export interface SystemPrincipal {
  kind: 'SYSTEM';
  jobId: string;
}
