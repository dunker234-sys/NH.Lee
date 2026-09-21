import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsISO8601, ValidateNested } from 'class-validator';
import { CreatePunchDto } from './create-punch.dto';

/** 오프라인 큐에서 온 벌크 업로드. items는 전부 오프라인 유래로 취급한다. */
export class CreatePunchBulkDto {
  @ApiProperty({ type: [CreatePunchDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => CreatePunchDto)
  items!: CreatePunchDto[];

  @ApiProperty({ description: '단말이 마지막으로 서버와 동기화된 시각(ISO 8601) — 단말 시계 조작 탐지용' })
  @IsISO8601()
  lastKnownServerSyncTime!: string;
}
