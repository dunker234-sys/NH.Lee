import { IsIn, IsOptional, IsString } from 'class-validator';

export class ExportPayrollCloseDto {
  @IsIn(['EXCEL', 'CSV'])
  format!: 'EXCEL' | 'CSV';

  @IsOptional()
  @IsString()
  columnMappingId?: string;
}
