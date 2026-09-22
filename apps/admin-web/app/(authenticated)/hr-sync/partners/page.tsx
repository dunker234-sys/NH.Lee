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

/** 파견·협력업체 관리(요구사항서 5장④) — 협력사 등록/비활성화, 소속
 * 직원 개별 등록. 엑셀 일괄 등록은 이 화면 범위 밖(별도 후속 작업). */
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
                  {expandedId === c.id ? '접기' : '직원 등록'}
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
            {expandedId === c.id && <RegisterEmployeeForm company={c} />}
          </div>
        ))}
      </div>
      <ErrorMessage error={deactivateMutation.error} />
    </div>
  );
}
