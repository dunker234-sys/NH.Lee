import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

/** 개통 승인 등 siteId 하나만 필요한 액션의 공용 바디 DTO. */
export class SiteIdDto {
  @ApiProperty()
  @IsUUID()
  siteId!: string;
}
