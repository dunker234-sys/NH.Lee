import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsUUID } from 'class-validator';

export class SetCutoverDateDto {
  @ApiProperty()
  @IsUUID()
  siteId!: string;

  @ApiProperty({ description: '개통 기준일(YYYY-MM-DD)' })
  @IsDateString()
  cutoverDate!: string;
}
