import * as iconv from 'iconv-lite';

const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf]);

/**
 * 사내 인사시스템 CSV 추출은 대부분 EUC-KR(윈도우 엑셀 "CSV" 저장 기본값)
 * 이거나 UTF-8이다. BOM이 있으면 UTF-8로 확정하고, 없으면 엄격(fatal) UTF-8
 * 디코딩을 시도해 유효하지 않은 바이트 시퀀스가 하나라도 있으면 EUC-KR로
 * 폴백한다 — 순수 ASCII만 있는 파일은 두 인코딩에서 결과가 같으므로 항상
 * 안전하다.
 */
export function decodeCsvBuffer(buffer: Buffer): string {
  if (buffer.length >= 3 && buffer.subarray(0, 3).equals(UTF8_BOM)) {
    return buffer.subarray(3).toString('utf8');
  }

  try {
    const decoder = new TextDecoder('utf-8', { fatal: true });
    return decoder.decode(buffer);
  } catch {
    return iconv.decode(buffer, 'euc-kr');
  }
}
