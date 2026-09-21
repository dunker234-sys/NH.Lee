import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';

export class LeaveApproveDto {
  @ApiProperty({ description: '읽은 시점의 version — 낙관적 잠금' })
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}
