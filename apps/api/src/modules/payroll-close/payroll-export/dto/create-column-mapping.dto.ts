import { IsArray, IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';

export class CreateColumnMappingDto {
  @IsString()
  name!: string;

  @IsIn(['MONTHLY', 'DAILY'])
  layoutType!: 'MONTHLY' | 'DAILY';

  @IsOptional()
  @IsString()
  siteId?: string;

  @IsArray()
  columns!: { sourceField: string; header: string; order: number; unit: 'MINUTES' | 'HOURS' | 'DAYS' | 'KRW' }[];

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
