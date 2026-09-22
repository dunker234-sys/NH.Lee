import { apiFetch } from '../apiClient';

export interface SetEmployeeProtectedStatusInput {
  statusType: string;
  effectiveStartDate: string;
  effectiveEndDate?: string;
}

/** STEP12 §A3. 백엔드는 HQ_HR 역할만 허용한다(EmployeesController @Roles('HQ_HR')).
 * 조회(GET) 엔드포인트는 아직 없다 — 등록만 가능하다. */
export const employeeProtectedStatusApi = {
  set: (employeeId: string, input: SetEmployeeProtectedStatusInput): Promise<void> =>
    apiFetch(`/employees/${employeeId}/protected-status`, { method: 'POST', body: input }),
};
