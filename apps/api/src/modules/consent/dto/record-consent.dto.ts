import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

// 이 컨트롤러는 LOCATION_COLLECTION 전용이다 — NOTIFICATION 동의는
// notification-consent.service.ts가 이미 다루는 별개 개념(옵트아웃 기본)이라
// 여기서 함께 취급하지 않는다(계획서 §9 참고).
const SUPPORTED_CONSENT_TYPES = ['LOCATION_COLLECTION'] as const;

export class RecordConsentDto {
  @ApiProperty({ enum: SUPPORTED_CONSENT_TYPES })
  @IsIn(SUPPORTED_CONSENT_TYPES)
  consentType!: (typeof SUPPORTED_CONSENT_TYPES)[number];
}
