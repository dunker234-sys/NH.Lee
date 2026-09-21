import { IsIn, IsNumber, IsString, Min } from 'class-validator';

export class SetWageRateDto {
  @IsIn(['HOURLY', 'MONTHLY'])
  wageType!: 'HOURLY' | 'MONTHLY';

  @IsNumber()
  @Min(0)
  baseAmount!: number;

  @IsString()
  effectiveStartDate!: string;
}
