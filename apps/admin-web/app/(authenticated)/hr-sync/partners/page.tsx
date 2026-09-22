'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiError } from '../../../../lib/apiClient';
import { usePrincipal } from '../../../../lib/usePrincipal';
import { sitesApi } from '../../../../lib/api/sitesApi';
import { partnerCompanyApi, type PartnerCompany } from '../../../../lib/api/hrSyncApi';

const ALLOWED_ROLES = new Set(['HQ_HR', 'ADMIN']);

function ErrorMessage({ error }: { error: unknown }) {
  if (!(error instanceof ApiError)) return null;
  const message = (error.body as { message?: string } | null)?.message ?? '처리에 실패했습니다.';
  return <p className="mt-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">{message}</p>;
}

function CreatePartnerForm() {
  const queryClient = useQueryClient();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');

  const mutation = useMutation({
    mutationFn: () => partnerCompanyApi.create({ code, name, contactName: contactName || undefined, contactEmail: contactEmail || undefined }),
    onSuccess: () => {
      setCode('');
      setName('');
      setContactName('');
      setContactEmail('');
      queryClient.invalidateQueries({ queryKey: ['partner-companies'] });
    },
  });

  return (
    <form
      className="grid grid-cols-2 gap-4 rounded-xl border border-slate-200 bg-white p-5 md:grid-cols-4"
      onSubmit={(e) => {
        e.preventDefault();
        mutation.mutate();
      }}
    >
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">코드</label>
        <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={code} onChange={(e) => setCode(e.target.value)} />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">업체명</label>
        <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">담당자(선택)</label>
        <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={contactName} onChange={(e) => setContactName(e.target.value)} />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">담당자 이메일(선택)</label>
        <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
      </div>
      <div className="md:col-span-4">
        <button
          type="submit"
          disabled={code.trim() === '' || name.trim() === '' || mutation.isPending}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          협력사 등록
        </button>
        <ErrorMessage error={mutation.error} />
      </div>
    </form>
  );
}

function RegisterEmployeeForm({ company }: { company: PartnerCompany }) {
  const [employeeNo, setEmployeeNo] = useState('');
  const [name, setName] = useState('');
  const [primarySiteId, setPrimarySiteId] = useState('');
  const [hireDate, setHireDate] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const sitesQuery = useQuery({ queryKey: ['sites', 'mine'], queryFn: () => sitesApi.listMine() });

  const mutation = useMutation({
    mutationFn: () => partnerCompanyApi.registerEmployee(company.id, { employeeNo, name, primarySiteId, hireDate }),
    onSuccess: () => {
      setResult(`${name}(${employeeNo}) 등록 완료`);
      setEmployeeNo('');
      setName('');
    },
  });

  const canSubmit = employeeNo.trim() !== '' && name.trim() !== '' && primarySiteId !== '' && hireDate !== '';

  return (
    <form
      className="mt-3 grid grid-cols-2 gap-3 rounded-lg border border-slate-100 bg-slate-50 p-4 md:grid-cols-4"
      onSubmit={(e) => {
        e.preventDefault();
        setResult(null);
        mutation.mutate();
      }}
    >
      <input placeholder="사번" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" value={employeeNo} onChange={(e) => setEmployeeNo(e.target.value)} />
      <input placeholder="이름" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" value={name} onChange={(e) => setName(e.target.value)} />
      <select className="rounded-lg border border-slate-300 px-3 py-2 text-sm" value={primarySiteId} onChange={(e) => setPrimarySiteId(e.target.value)}>
        <option value="">사업장 선택</option>
        {sitesQuery.data?.items.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <input type="date" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" value={hireDate} onChange={(e) => setHireDate(e.target.value)} />
      <div className="md:col-span-4">
        <button
          type="submit"
          disabled={!canSubmit || mutation.isPending}
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
        >
          직원 등록
        </button>
        {result && <span className="ml-3 text-sm text-green-700">{result}</span>}
        <ErrorMessage error={mutation.error} />
      </div>
    </form>
  );
}

function RegisterAdminForm({ company }: { company: PartnerCompany }) {
  const [employeeNo, setEmployeeNo] = useState('');
  const [name, setName] = useState('');
  const [primarySiteId, setPrimarySiteId] = useState('');
  const [issued, setIssued] = useState<{ employeeNo: string; tempPassword: string } | null>(null);
  const sitesQuery = useQuery({ queryKey: ['sites', 'mine'], queryFn: () => sitesApi.listMine() });

  const mutation = useMutation({
    mutationFn: () => partnerCompanyApi.registerAdmin(company.id, { employeeNo, name, primarySiteId }),
    onSuccess: (data) => {
      setIssued({ employeeNo: data.employeeNo, tempPassword: data.tempPassword });
      setEmployeeNo('');
      setName('');
    },
  });

  const canSubmit = employeeNo.trim() !== '' && name.trim() !== '' && primarySiteId !== '';

  return (
    <div className="mt-3 rounded-lg border border-slate-100 bg-slate-50 p-4">
      <p className="text-xs text-slate-500">
        발급된 계정은 admin-web에 로그인해 자사 소속 파견 인력 현황을 조회할 수 있습니다(PARTNER 역할, 최소 화면만 노출).
      </p>
      <form
        className="mt-2 grid grid-cols-2 gap-3 md:grid-cols-4"
        onSubmit={(e) => {
          e.preventDefault();
          setIssued(null);
          mutation.mutate();
        }}
      >
        <input placeholder="사번" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" value={employeeNo} onChange={(e) => setEmployeeNo(e.target.value)} />
        <input placeholder="담당자 이름" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" value={name} onChange={(e) => setName(e.target.value)} />
        <select className="rounded-lg border border-slate-300 px-3 py-2 text-sm" value={primarySiteId} onChange={(e) => setPrimarySiteId(e.target.value)}>
          <option value="">소속 사업장 선택</option>
          {sitesQuery.data?.items.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={!canSubmit || mutation.isPending}
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
        >
          계정 발급
        </button>
      </form>
      {issued && (
        <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-semibold">계정이 발급됐습니다. 이 화면을 벗어나면 임시 비밀번호를 다시 볼 수 없습니다.</p>
          <p className="mt-1">
            사번: <span className="font-mono">{issued.employeeNo}</span> · 임시 비밀번호: <span className="font-mono">{issued.tempPassword}</span>
          </p>
        </div>
      )}
      <ErrorMessage error={mutation.error} />
    </div>
  );
}

function ResignEmployeeForm({ company }: { company: PartnerCompany }) {
  const [employeeId, setEmployeeId] = useState('');
  const [resignationDate, setResignationDate] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const queryClient = useQueryClient();
  // 협력사 소속 직원 목록을 따로 조회하는 엔드포인트가 없어 인건비 확인
  // 조회(재직자만 반환)를 직원 선택 목록으로 재사용한다.
  const workersQuery = useQuery({
    queryKey: ['partner-labor-cost', company.id, 'resign-picker'],
    queryFn: () => partnerCompanyApi.laborCost(company.id, new Date().toISOString().slice(0, 10)),
  });

  const mutation = useMutation({
    mutationFn: () => partnerCompanyApi.resignEmployee(company.id, employeeId, { resignationDate }),
    onSuccess: () => {
      const worker = workersQuery.data?.find((w) => w.employeeId === employeeId);
      setResult(`${worker?.name ?? employeeId} 퇴사 처리 완료`);
      setEmployeeId('');
      setResignationDate('');
      queryClient.invalidateQueries({ queryKey: ['partner-labor-cost', company.id] });
    },
  });

  const canSubmit = employeeId !== '' && resignationDate !== '';

  return (
    <div className="mt-3 rounded-lg border border-slate-100 bg-slate-50 p-4">
      <form
        className="grid grid-cols-2 gap-3 md:grid-cols-4"
        onSubmit={(e) => {
          e.preventDefault();
          setResult(null);
          mutation.mutate();
        }}
      >
        <select className="rounded-lg border border-slate-300 px-3 py-2 text-sm" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
          <option value="">퇴사 처리할 직원 선택</option>
          {workersQuery.data?.map((w) => (
            <option key={w.employeeId} value={w.employeeId}>
              {w.name} ({w.employeeNo})
            </option>
          ))}
        </select>
        <input type="date" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" value={resignationDate} onChange={(e) => setResignationDate(e.target.value)} />
        <button
          type="submit"
          disabled={!canSubmit || mutation.isPending}
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
        >
          퇴사 처리
        </button>
      </form>
      {result && <p className="mt-2 text-sm text-green-700">{result}</p>}
      <ErrorMessage error={mutation.error} />
    </div>
  );
}

function LaborCostTable({ company }: { company: PartnerCompany }) {
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().slice(0, 10));
  const laborCostQuery = useQuery({
    queryKey: ['partner-labor-cost', company.id, asOfDate],
    queryFn: () => partnerCompanyApi.laborCost(company.id, asOfDate),
  });

  return (
    <div className="mt-3 rounded-lg border border-slate-100 bg-slate-50 p-4">
      <p className="text-xs text-slate-500">등록된 임금요율 기준입니다(실제 지급액이 아닙니다).</p>
      <label className="mt-2 flex items-center gap-2 text-sm text-slate-600">
        기준일
        <input type="date" className="rounded-lg border border-slate-300 px-2 py-1 text-sm" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} />
      </label>
      {laborCostQuery.data?.length === 0 && <p className="mt-2 text-sm text-slate-400">재직 중인 파견직원이 없습니다.</p>}
      {laborCostQuery.data && laborCostQuery.data.length > 0 && (
        <table className="mt-2 w-full text-sm">
          <thead className="text-left text-xs text-slate-500">
            <tr>
              <th className="py-1 pr-3">사번</th>
              <th className="py-1 pr-3">이름</th>
              <th className="py-1 pr-3">요율 유형</th>
              <th className="py-1 pr-3">금액</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {laborCostQuery.data.map((row) => (
              <tr key={row.employeeId}>
                <td className="py-1 pr-3">{row.employeeNo}</td>
                <td className="py-1 pr-3">{row.name}</td>
                <td className="py-1 pr-3">{row.wageType === 'HOURLY' ? '시급' : row.wageType === 'MONTHLY' ? '월급' : '미등록'}</td>
                <td className="py-1 pr-3">{row.baseAmount != null ? `${row.baseAmount.toLocaleString('ko-KR')}원` : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

type PartnerTab = 'ADMIN' | 'ONBOARD' | 'OFFBOARD' | 'LABOR_COST';
const TAB_LABEL: Record<PartnerTab, string> = {
  ADMIN: '협력업체 관리자 등록',
  ONBOARD: '파견직 입사자 등록',
  OFFBOARD: '파견직 퇴사자 등록',
  LABOR_COST: '파견직 인건비 확인',
};

function PartnerCompanyTabs({ company }: { company: PartnerCompany }) {
  const [tab, setTab] = useState<PartnerTab>('ONBOARD');
  return (
    <div className="mt-3">
      <div className="flex flex-wrap gap-1 border-b border-slate-200">
        {(Object.keys(TAB_LABEL) as PartnerTab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-t-lg px-3 py-1.5 text-xs font-semibold ${tab === t ? 'bg-blue-50 text-blue-700' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>
      {tab === 'ADMIN' && <RegisterAdminForm company={company} />}
      {tab === 'ONBOARD' && <RegisterEmployeeForm company={company} />}
      {tab === 'OFFBOARD' && <ResignEmployeeForm company={company} />}
      {tab === 'LABOR_COST' && <LaborCostTable company={company} />}
    </div>
  );
}

/** 파견·협력업체 관리(요구사항서 5장④, 수정사항으로 4개 소분류 재구성) —
 * 협력사 등록/비활성화 + 소속 회사별 4개 탭(관리자 등록/입사자 등록/퇴사자
 * 등록/인건비 확인). 엑셀 일괄 등록은 이 화면 범위 밖(별도 후속 작업). */
export default function PartnerCompaniesPage() {
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const principalQuery = usePrincipal();
  const listQuery = useQuery({ queryKey: ['partner-companies'], queryFn: () => partnerCompanyApi.list() });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => partnerCompanyApi.deactivate(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['partner-companies'] }),
  });

  if (principalQuery.isLoading) return <p className="text-slate-500">불러오는 중...</p>;
  const role = principalQuery.data?.principal.role;
  if (!role || !ALLOWED_ROLES.has(role)) {
    return <p className="text-slate-600">이 화면은 HQ_HR·ADMIN 권한만 볼 수 있습니다.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-bold">협력업체 관리</h1>
      <CreatePartnerForm />

      <div className="flex flex-col gap-3">
        {(listQuery.data ?? []).length === 0 && <p className="text-sm text-slate-400">등록된 협력사가 없습니다.</p>}
        {listQuery.data?.map((c) => (
          <div key={c.id} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-700">
                  {c.name} <span className="font-normal text-slate-400">({c.code})</span>
                  {!c.active && <span className="ml-2 text-xs text-slate-400">비활성</span>}
                </p>
                {(c.contactName || c.contactEmail) && (
                  <p className="text-xs text-slate-500">
                    {c.contactName} {c.contactEmail}
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setExpandedId(expandedId === c.id ? null : c.id)} className="text-sm text-blue-600 underline">
                  {expandedId === c.id ? '접기' : '관리'}
                </button>
                {c.active && (
                  <button
                    type="button"
                    disabled={deactivateMutation.isPending}
                    onClick={() => deactivateMutation.mutate(c.id)}
                    className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-600 disabled:opacity-40"
                  >
                    비활성화
                  </button>
                )}
              </div>
            </div>
            {expandedId === c.id && <PartnerCompanyTabs company={c} />}
          </div>
        ))}
      </div>
      <ErrorMessage error={deactivateMutation.error} />
    </div>
  );
}
