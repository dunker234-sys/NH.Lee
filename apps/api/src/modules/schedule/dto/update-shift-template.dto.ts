import { ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsOptional, IsString, Matches, Min, Max } from 'class-validator';
import { FLEXIBLE_WORK_AGREEMENT_TYPES } from '../../../common/policy/site-labor-agreement-resolver.service';

const TIME_HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** siteId는 소유 사업장 고정이라 수정 대상에서 제외한다(옮기려면 새로 만든다). */
export class UpdateShiftTemplateDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: '05:00' })
  @IsOptional()
  @Matches(TIME_HHMM)
  startTime?: string;

  @ApiPropertyOptional({ example: '14:00' })
  @IsOptional()
  @Matches(TIME_HHMM)
  endTime?: string;

  @ApiPropertyOptional({ example: '12:00' })
  @IsOptional()
  @Matches(TIME_HHMM)
  breakStartTime?: string;

  @ApiPropertyOptional({ example: '13:00' })
  @IsOptional()
  @Matches(TIME_HHMM)
  breakEndTime?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  crossesMidnight?: boolean;

  @ApiPropertyOptional({ type: [Number] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(7)
  @Min(1, { each: true })
  @Max(7, { each: true })
  applicableWeekdays?: number[];

  @ApiPropertyOptional({ enum: FLEXIBLE_WORK_AGREEMENT_TYPES })
  @IsOptional()
  @IsIn([...FLEXIBLE_WORK_AGREEMENT_TYPES, null])
  flexibleWorkType?: string | null;
}
