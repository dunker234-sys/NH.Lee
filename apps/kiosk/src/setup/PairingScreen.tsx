import { useState } from 'react';
import { kioskApi, KioskApiError } from '../api';
import { deviceStore } from '../deviceStore';

interface PairingScreenProps {
  onPaired: () => void;
}

/**
 * 최초 부팅 시 1회 — 관리자가 POST /admin/kiosk-devices로 발급한 페어링
 * 토큰을 그대로 입력한다(계획서 §2.2). 별도 짧은 코드→긴 토큰 교환 단계
 * 없이 같은 값을 페어링과 이후 상시 인증에 그대로 쓴다.
 */
export function PairingScreen({ onPaired }: PairingScreenProps) {
  const [credential, setCredential] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await kioskApi.pair(credential.trim());
      deviceStore.set({ kioskDeviceId: result.kioskDeviceId, siteId: result.siteId, siteName: result.siteName, credential: credential.trim() });
      onPaired();
    } catch (e) {
      setError(e instanceof KioskApiError ? '페어링 토큰이 유효하지 않습니다.' : '서버에 연결할 수 없습니다.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="kiosk-app">
      <h1 className="kiosk-title">키오스크 최초 설정</h1>
      <p className="kiosk-subtitle">관리자가 발급한 페어링 토큰을 입력하세요.</p>
      <form className="pairing-form" onSubmit={handleSubmit}>
        <input
          type="text"
          autoFocus
          value={credential}
          onChange={(e) => setCredential(e.target.value)}
          placeholder="페어링 토큰"
          autoComplete="off"
        />
        {error && <span style={{ color: 'var(--color-danger)' }}>{error}</span>}
        <button type="submit" disabled={submitting || !credential.trim()}>
          {submitting ? '확인 중...' : '설정 완료'}
        </button>
      </form>
    </div>
  );
}
