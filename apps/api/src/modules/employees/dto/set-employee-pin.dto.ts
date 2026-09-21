import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';

export class SetEmployeePinDto {
  @ApiProperty({ description: '4~6자리 숫자 — 키오스크 타각용 PIN' })
  @Matches(/^\d{4,6}$/)
  pin!: string;
}
