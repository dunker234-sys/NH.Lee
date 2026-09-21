'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError } from '../../lib/apiClient';
import { authApi } from '../../lib/api/authApi';
import { authStore } from '../../lib/authStore';
import { getOrCreateDeviceId } from '../../lib/deviceId';

export default function LoginPage() {
  const router = useRouter();
  const [employeeNo, setEmployeeNo] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const deviceId = getOrCreateDeviceId();
      const result = await authApi.login({ employeeNo, password, deviceId });
      authStore.set({ accessToken: result.accessToken, refreshToken: result.refreshToken, employeeNo });
      router.replace('/schedule');
    } catch (e) {
      setError(e instanceof ApiError ? '사번 또는 비밀번호가 올바르지 않습니다.' : '서버에 연결할 수 없습니다.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4 rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-bold">근태관리 관리자 로그인</h1>
        <div className="space-y-1">
          <label htmlFor="employeeNo" className="text-sm text-slate-600">
            사번
          </label>
          <input
            id="employeeNo"
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
            value={employeeNo}
            onChange={(e) => setEmployeeNo(e.target.value)}
            autoComplete="username"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="password" className="text-sm text-slate-600">
            비밀번호
          </label>
          <input
            id="password"
            type="password"
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={submitting || !employeeNo || !password}
          className="w-full rounded-lg bg-blue-600 py-2 font-semibold text-white disabled:opacity-40"
        >
          {submitting ? '로그인 중...' : '로그인'}
        </button>
      </form>
    </main>
  );
}
