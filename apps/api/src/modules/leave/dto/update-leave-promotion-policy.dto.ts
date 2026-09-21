import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsISO8601, IsOptional, IsUUID, Min, ValidateNested } from 'class-validator';

export class LeavePromotionPolicyValuesDto {
  @ApiProperty() @IsInt() @Min(0) article611FirstNoticeWindowDays!: number;
  @ApiProperty() @IsInt() @Min(0) article611FirstNoticeAnchorMonthsBeforeExpiry!: number;
  @ApiProperty() @IsInt() @Min(0) article611EmployeeResponseWindowDays!: number;
  @ApiProperty() @IsInt() @Min(0) article611SecondNoticeDeadlineMonthsBeforeExpiry!: number;
  @ApiProperty() @IsInt() @Min(0) article612WaveAFirstNoticeWindowDays!: number;
  @ApiProperty() @IsInt() @Min(0) article612WaveAFirstNoticeAnchorMonthsBefore!: number;
  @ApiProperty() @IsInt() @Min(0) article612WaveASecondNoticeDeadlineMonthsBefore!: number;
  @ApiProperty() @IsInt() @Min(0) article612WaveBFirstNoticeWindowDays!: number;
  @ApiProperty() @IsInt() @Min(0) article612WaveBFirstNoticeAnchorMonthsBefore!: number;
  @ApiProperty() @IsInt() @Min(0) article612WaveBSecondNoticeDeadlineDaysBefore!: number;
}

export class UpdateLeavePromotionPolicyDto {
  @ApiPropertyOptional({ description: '생략하면 전사(NULL) 기본값을 갱신' })
  @IsOptional()
  @IsUUID()
  siteId?: string;

  @ApiProperty({ example: '2026-09-01' })
  @IsISO8601({ strict: true })
  effectiveStartDate!: string;

  @ApiProperty({ type: LeavePromotionPolicyValuesDto })
  @ValidateNested()
  @Type(() => LeavePromotionPolicyValuesDto)
  values!: LeavePromotionPolicyValuesDto;
}
