import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsOptional, IsString, IsUUID, Matches, Min, Max } from 'class-validator';
import { FLEXIBLE_WORK_AGREEMENT_TYPES } from '../../../common/policy/site-labor-agreement-resolver.service';

const TIME_HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export class CreateShiftTemplateDto {
  @ApiProperty()
  @IsUUID()
  siteId!: string;

  @ApiProperty({ example: '조식' })
  @IsString()
  name!: string;

  @ApiProperty({ example: '05:00', description: 'HH:mm' })
  @Matches(TIME_HHMM)
  startTime!: string;

  @ApiProperty({ example: '14:00', description: 'HH:mm' })
  @Matches(TIME_HHMM)
  endTime!: string;

  @ApiPropertyOptional({ example: '12:00', description: 'HH:mm' })
  @IsOptional()
  @Matches(TIME_HHMM)
  breakStartTime?: string;

  @ApiPropertyOptional({ example: '13:00', description: 'HH:mm' })
  @IsOptional()
  @Matches(TIME_HHMM)
  breakEndTime?: string;

  @ApiProperty()
  @IsBoolean()
  crossesMidnight!: boolean;

  @ApiProperty({ type: [Number], description: '1=월 ... 7=일' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(7)
  @Min(1, { each: true })
  @Max(7, { each: true })
  applicableWeekdays!: number[];

  @ApiPropertyOptional({
    enum: FLEXIBLE_WORK_AGREEMENT_TYPES,
    description: '이 템플릿이 유연/선택 근로제 유형에 속하면 지정. 미기입=표준(비유연) 근무.',
  })
  @IsOptional()
  @IsIn(FLEXIBLE_WORK_AGREEMENT_TYPES)
  flexibleWorkType?: string;
}
