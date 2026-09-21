import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class UpdateLeaveTypeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  evidenceRequired?: boolean;

  @ApiPropertyOptional({ description: 'null=신청 기한 없음으로 초기화' })
  @IsOptional()
  @IsInt()
  @Min(0)
  applicationDeadlineDaysBeforeUse?: number;
}
