import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LeaveUnit } from '@prisma/client';
import { IsEnum, IsISO8601, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateLeaveRequestDto {
  @ApiProperty()
  @IsUUID()
  leaveTypeId!: string;

  @ApiProperty({ example: '2026-09-14' })
  @IsISO8601({ strict: true })
  startDate!: string;

  @ApiProperty({ example: '2026-09-14' })
  @IsISO8601({ strict: true })
  endDate!: string;

  @ApiPropertyOptional({ enum: ['FULL', 'HALF_AM', 'HALF_PM', 'QUARTER'] })
  @IsOptional()
  @IsEnum(['FULL', 'HALF_AM', 'HALF_PM', 'QUARTER'])
  unit?: LeaveUnit;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}
