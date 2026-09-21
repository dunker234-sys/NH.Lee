import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsOptional, IsString, IsUUID } from 'class-validator';

export class ConfirmSchedulesDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(900)
  @IsUUID('4', { each: true })
  scheduleIds!: string[];

  @ApiPropertyOptional({ description: 'soft-warning이 남아있어도 강제로 확정한다' })
  @IsOptional()
  @IsBoolean()
  override?: boolean;

  @ApiPropertyOptional({ description: 'override=true일 때 필수 — 감사로그에 남는다' })
  @IsOptional()
  @IsString()
  overrideReason?: string;
}
