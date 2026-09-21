import { apiFetch } from '../apiClient';

export interface EmployeeSummary {
  id: string;
  employeeNo: string;
  name: string;
  role: string;
}

export const employeesApi = {
  list(siteId: string): Promise<EmployeeSummary[]> {
    return apiFetch(`/employees?siteId=${siteId}`);
  },
};
