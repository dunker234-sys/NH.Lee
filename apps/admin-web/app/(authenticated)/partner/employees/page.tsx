'use client';

import { useQuery } from '@tanstack/react-query';
import { usePrincipal } from '../../../../lib/usePrincipal';
import { mePartnerApi } from '../../../../lib/api/hrSyncApi';

const STATUS_LABEL: Record<string, string> = { ACTIVE: '재직', ON_LEAVE: '휴직', RESIGNED: '퇴사' };

/** 협력업체 담당자(PARTNER 역할) self-service 조회(수정사항) — 자사 소속
 * 파견 인력만 GET /me/partner/employees로 필터해 보여준다. */
export default function PartnerEmployeesPage() {
  const principalQuery = usePrincipal();
  const employeesQuery = useQuery({ queryKey: ['me', 'partner-employees'], queryFn: () => mePartnerApi.listMyEmployees() });

  if (principalQuery.isLoading) return <p className="text-slate-500">불러오는 중...</p>;
  const role = principalQuery.data?.principal.role;
  if (role !== 'PARTNER') {
    return <p className="text-slate-600">이 화면은 협력업체 담당자(PARTNER) 계정만 볼 수 있습니다.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold">소속 직원 현황</h1>
      {employeesQuery.isLoading && <p className="text-slate-500">불러오는 중...</p>}
      {employeesQuery.data?.length === 0 && <p className="text-slate-500">등록된 소속 직원이 없습니다.</p>}
      {employeesQuery.data && employeesQuery.data.length > 0 && (
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 text-left text-xs text-slate-500">
            <tr>
              <th className="py-2 pr-4">사번</th>
              <th className="py-2 pr-4">이름</th>
              <th className="py-2 pr-4">상태</th>
              <th className="py-2 pr-4">입사일</th>
              <th className="py-2 pr-4">퇴사일</th>
              <th className="py-2 pr-4">직책</th>
              <th className="py-2 pr-4">부서</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {employeesQuery.data.map((e) => (
              <tr key={e.id}>
                <td className="py-2 pr-4">{e.employeeNo}</td>
                <td className="py-2 pr-4">{e.name}</td>
                <td className="py-2 pr-4">{STATUS_LABEL[e.status] ?? e.status}</td>
                <td className="py-2 pr-4">{e.hireDate.slice(0, 10)}</td>
                <td className="py-2 pr-4">{e.resignationDate ? e.resignationDate.slice(0, 10) : '-'}</td>
                <td className="py-2 pr-4">{e.jobTitle ?? '-'}</td>
                <td className="py-2 pr-4">{e.department ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
