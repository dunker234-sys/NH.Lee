import { BadRequestException } from '@nestjs/common';

/**
 * "지오펜스·기기 신뢰·NFC/QR 검증 실패에도 타각을 절대 거부하지 않는다"는
 * 규칙은 이 파일의 에러들에는 적용되지 않는다 — 존재하지 않는 siteId 같은
 * 구조적 무결성 오류는 그 규칙 밖이다(계획 §3 "절대 거부하지 않는다의 경계").
 */
export class PunchSiteNotFoundError extends BadRequestException {
  constructor(siteId: string) {
    super({ code: 'PUNCH_SITE_NOT_FOUND', message: `사업장(${siteId})을 찾을 수 없습니다.` });
  }
}
