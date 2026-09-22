import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class ProvisionQrPosterDto {
  @ApiProperty()
  @IsUUID()
  siteId!: string;
}
