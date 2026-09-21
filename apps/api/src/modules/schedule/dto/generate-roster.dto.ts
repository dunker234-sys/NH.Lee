import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsISO8601, IsInt, IsUUID, Max, Min, ValidateNested } from 'class-validator';

/**
 * 반복 규칙 표현: cycleLengthDays 길이의 pattern 배열을 anchorDate부터
 * 순환 적용한다. 주 단위 순환(cycleLengthDays=7), N일 주기(3조 2교대 등,
 * cycleLengthDays=N), 격주(cycleLengthDays=14) 모두 이 하나의 표현으로
 * 커버한다 — 별도 반복 유형 enum을 두지 않는다. pattern[i]가 null이면
 * 그 날은 휴무(Schedule 행을 만들지 않는다).
 */
export class RosterAssignmentRuleDto {
  @ApiProperty()
  @IsUUID()
  employeeId!: string;

  @ApiProperty({ minimum: 1, maximum: 90 })
  @IsInt()
  @Min(1)
  @Max(90)
  cycleLengthDays!: number;

  @ApiProperty({
    type: [String],
    description: 'cycleLengthDays와 같은 길이. 각 원소는 shiftTemplateId 또는 null(휴무).',
    nullable: true,
  })
  @IsArray()
  pattern!: (string | null)[];

  @ApiProperty({ example: '2026-09-01', description: 'pattern[0]이 적용되는 기준일(YYYY-MM-DD)' })
  @IsISO8601({ strict: true })
  anchorDate!: string;
}

export class GenerateRosterDto {
  @ApiProperty()
  @IsUUID()
  siteId!: string;

  @ApiProperty({ example: '2026-09-01' })
  @IsISO8601({ strict: true })
  startDate!: string;

  @ApiProperty({ example: '2026-09-30', description: 'inclusive' })
  @IsISO8601({ strict: true })
  endDate!: string;

  @ApiProperty({ type: [RosterAssignmentRuleDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => RosterAssignmentRuleDto)
  assignments!: RosterAssignmentRuleDto[];
}
