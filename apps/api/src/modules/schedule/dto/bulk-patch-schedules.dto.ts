import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsUUID, Min, ValidateNested } from 'class-validator';
import { PatchScheduleFieldsDto } from './patch-schedule-cell.dto';

export class BulkPatchScheduleCellDto extends PatchScheduleFieldsDto {
  @ApiProperty()
  @IsUUID()
  id!: string;

  @ApiProperty({ description: '읽은 시점의 schedule.version — 낙관적 잠금' })
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

/** 변경된 셀만 담아 보낸다. 트랜잭션 안에서 처리되며 하나라도 충돌하면
 * 전체 롤백한다(부분 적용 없음). */
export class BulkPatchSchedulesDto {
  @ApiProperty({ type: [BulkPatchScheduleCellDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(900)
  @ValidateNested({ each: true })
  @Type(() => BulkPatchScheduleCellDto)
  cells!: BulkPatchScheduleCellDto[];
}
