import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { kioskApi, KioskApiError } from '../api';
import { deviceStore } from '../deviceStore';

/**
 * QR 표시 모드(계획서 §6/§7) — 사업장 QR(TOTP)을 화면에 표시하고 근로자는
 * 본인 폰(apps/mobile ScanScreen)으로 스캔한다. 이 화면 자체는 타각을
 * 제출하지 않는다(읽기 전용) — 페이로드는 서버가 알려준 6자리 코드
 * 문자열 그대로(추가 인코딩 없음, apps/mobile이 그대로 파싱한다).
 */
export function QrDisplayScreen() {
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      const device = deviceStore.get();
      if (!device) return;
      try {
        const { code, periodSeconds, expiresAt } = await kioskApi.getQrCode(device.credential);
        const dataUrl = await QRCode.toDataURL(code, { width: 320, margin: 1 });
        if (cancelled) return;
        setImageDataUrl(dataUrl);
        setError(null);

        const msUntilExpiry = Math.max(1000, new Date(expiresAt).getTime() - Date.now());
        timerRef.current = setTimeout(refresh, Math.min(msUntilExpiry, periodSeconds * 1000));
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof KioskApiError ? '이 사업장에는 QR이 발급되지 않았습니다.' : '서버에 연결할 수 없습니다.');
        timerRef.current = setTimeout(refresh, 5000);
      }
    }

    refresh();
    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <div className="qr-screen">
      <h1 className="kiosk-title">QR 스캔 타각</h1>
      <p className="kiosk-subtitle">본인 앱의 스캔 화면으로 아래 QR을 스캔하세요.</p>
      {imageDataUrl ? <img src={imageDataUrl} alt="타각용 QR 코드" /> : <p>{error ?? '불러오는 중...'}</p>}
    </div>
  );
}
