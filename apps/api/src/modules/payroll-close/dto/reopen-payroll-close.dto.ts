import { IsString, MinLength } from 'class-validator';

export class ReopenPayrollCloseDto {
  @IsString()
  @MinLength(1)
  reason!: string;
}
