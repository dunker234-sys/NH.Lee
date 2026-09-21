import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { IsIn, IsISO8601, IsInt, IsOptional, IsUUID, Min } from 'class-validator';
import { ScheduleAssignmentType } from '@prisma/client';

const ASSIGNMENT_TYPES: readonly ScheduleAssignmentType[] = ['INTERNAL_SUPPORT', 'OTHER_SITE_SUPPORT', 'DAILY_WORKER'];

/** 셀 하나에서 바뀔 수 있는 필드. 전송된 필드만 갱신한다("변경된 셀만 전송"). */
export class PatchScheduleFieldsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  shiftTemplateId?: string;

  @ApiPropertyOptional({ description: 'ISO 8601. 제공 시 workDate를 시업일 기준으로 서버가 재계산한다.' })
  @IsOptional()
  @IsISO8601()
  plannedStartAt?: string;

  @ApiPropertyOptional({ description: 'ISO 8601' })
  @IsOptional()
  @IsISO8601()
  plannedEndAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  plannedBreakMinutes?: number;

  @ApiPropertyOptional({ enum: ASSIGNMENT_TYPES })
  @IsOptional()
  @IsIn(ASSIGNMENT_TYPES)
  assignmentType?: ScheduleAssignmentType;
}

export class PatchScheduleCellDto extends PatchScheduleFieldsDto {
  @ApiProperty({ description: '읽은 시점의 schedule.version — 낙관적 잠금' })
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}
