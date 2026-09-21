import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsUUID } from 'class-validator';

const SOURCE_CATEGORIES = ['OVERTIME', 'NIGHT', 'HOLIDAY_WITHIN_8H', 'HOLIDAY_EXCESS_8H'] as const;
export type OvertimeSourceCategory = (typeof SOURCE_CATEGORIES)[number];

export class ConvertCompensatoryLeaveDto {
  @ApiProperty()
  @IsUUID()
  employeeId!: string;

  @ApiProperty()
  @IsUUID()
  sourceOvertimeRequestId!: string;

  @ApiProperty({ enum: SOURCE_CATEGORIES })
  @IsEnum(SOURCE_CATEGORIES)
  sourceCategory!: OvertimeSourceCategory;
}
