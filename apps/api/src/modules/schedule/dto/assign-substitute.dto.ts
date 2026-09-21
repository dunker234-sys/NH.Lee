import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID } from 'class-validator';
import { ScheduleAssignmentType } from '@prisma/client';

const ASSIGNMENT_TYPES: readonly ScheduleAssignmentType[] = ['INTERNAL_SUPPORT', 'OTHER_SITE_SUPPORT', 'DAILY_WORKER'];

export class AssignSubstituteDto {
  @ApiProperty()
  @IsUUID()
  substituteEmployeeId!: string;

  @ApiProperty({ enum: ASSIGNMENT_TYPES })
  @IsIn(ASSIGNMENT_TYPES)
  assignmentType!: ScheduleAssignmentType;

  @ApiPropertyOptional({ description: '미기입 시 원 배정자의 승인된 휴가/결근 사유로 자동 채움을 시도한다' })
  @IsOptional()
  @IsString()
  reason?: string;
}
