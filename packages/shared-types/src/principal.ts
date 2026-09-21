import { EmployeeRole } from './role';

export type OrgScope = { kind: 'ALL' } | { kind: 'SITES'; siteIds: string[] };

export type Principal =
  | { kind: 'EMPLOYEE'; employeeId: string; employeeNo: string; role: EmployeeRole }
  | { kind: 'SYSTEM'; jobId: string };
