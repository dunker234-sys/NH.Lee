import { useQuery } from '@tanstack/react-query';
import { employeesApi } from './api/employeesApi';

/** 승인 목록 API들은 employeeId만 반환한다(조인 없음) — 사업장 선택이
 * 필수인 화면들에서 표시용 이름을 붙이기 위한 공용 조회. */
export function useEmployeeNameMap(siteId: string) {
  const query = useQuery({
    queryKey: ['employees', siteId],
    queryFn: () => employeesApi.list(siteId),
    enabled: siteId !== '',
  });

  const nameById = new Map<string, string>();
  for (const e of query.data ?? []) nameById.set(e.id, `${e.name} (${e.employeeNo})`);

  return { nameById, isLoading: query.isLoading, isError: query.isError };
}
