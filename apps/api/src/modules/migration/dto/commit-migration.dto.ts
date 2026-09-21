import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class CommitMigrationDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  commitToken!: string;
}
