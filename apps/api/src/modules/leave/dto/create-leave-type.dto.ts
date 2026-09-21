import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LeaveCategory, LeaveDeductionUnit } from '@prisma/client';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

const CATEGORIES = ['ANNUAL', 'HALF_DAY', 'QUARTER_DAY', 'CONGRATULATION', 'PUBLIC', 'SICK', 'UNPAID', 'SUBSTITUTE', 'COMPENSATORY'];
const DEDUCTION_UNITS = ['FULL_DAY', 'HALF_DAY', 'HOUR'];

export class CreateLeaveTypeDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  code!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiProperty({ enum: CATEGORIES })
  @IsEnum(CATEGORIES)
  category!: LeaveCategory;

  @ApiProperty()
  @IsBoolean()
  paid!: boolean;

  @ApiProperty({ enum: DEDUCTION_UNITS })
  @IsEnum(DEDUCTION_UNITS)
  deductionUnit!: LeaveDeductionUnit;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  evidenceRequired?: boolean;

  @ApiPropertyOptional({ description: 'null/미기입=신청 기한 없음' })
  @IsOptional()
  @IsInt()
  @Min(0)
  applicationDeadlineDaysBeforeUse?: number;
}
