import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

const SUPPORTED_CONSENT_TYPES = ['LOCATION_COLLECTION'] as const;

export class ConsentTypeQueryDto {
  @ApiProperty({ enum: SUPPORTED_CONSENT_TYPES })
  @IsIn(SUPPORTED_CONSENT_TYPES)
  type!: (typeof SUPPORTED_CONSENT_TYPES)[number];
}
