import { useEffect, useState } from 'react';
import { deviceStore } from './deviceStore';
import type { StoredKioskDevice } from './deviceStore';
import { flushService } from './offline/flush.service';
import { useQueueStatus } from './offline/useQueueStatus';
import { PairingScreen } from './setup/PairingScreen';
import { PunchEntryScreen } from './punch/PunchEntryScreen';
import { PunchResultScreen } from './punch/PunchResultScreen';
import { usePunchFlow } from './punch/usePunchFlow';
import { QrDisplayScreen } from './qr/QrDisplayScreen';

type Mode = 'PUNCH' | 'QR';

function MainFlow({ device }: { device: StoredKioskDevice }) {
  const [mode, setMode] = useState<Mode>('PUNCH');
  const { state, submit } = usePunchFlow();
  const { pendingCount } = useQueueStatus();

  useEffect(() => {
    flushService.trigger(); // 재실행/재연결 시 즉시 플러시 시도(완료조건2).
    const onOnline = () => flushService.trigger();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, []);

  return (
    <>
      <div className="status-bar">
        <span>{device.siteName}</span>
        {pendingCount > 0 && <span style={{ color: 'var(--color-warning)' }}>미전송 {pendingCount}건</span>}
        <button type="button" className="status-bar__mode-toggle" onClick={() => setMode(mode === 'PUNCH' ? 'QR' : 'PUNCH')}>
          {mode === 'PUNCH' ? 'QR 모드' : '사번+PIN 모드'}
        </button>
      </div>

      {mode === 'QR' ? (
        <div className="kiosk-app">
          <QrDisplayScreen />
        </div>
      ) : state.phase === 'RESULT' ? (
        <div className="kiosk-app">
          <PunchResultScreen state={state} />
        </div>
      ) : (
        <PunchEntryScreen submitting={state.phase === 'SUBMITTING'} onSubmit={submit} />
      )}
    </>
  );
}

export default function App() {
  const [device, setDevice] = useState<StoredKioskDevice | null | undefined>(undefined);

  useEffect(() => {
    setDevice(deviceStore.get());
  }, []);

  if (device === undefined) return null; // 최초 렌더 1틱, localStorage 읽기 대기
  if (device === null) return <PairingScreen onPaired={() => setDevice(deviceStore.get())} />;
  return <MainFlow device={device} />;
}
