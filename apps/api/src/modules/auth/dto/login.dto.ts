import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'E0001' })
  @IsString()
  employeeNo!: string;

  @ApiProperty()
  @IsString()
  @Length(1, 200)
  password!: string;

  @ApiProperty({ description: '클라이언트가 생성·유지하는 기기 고유값' })
  @IsString()
  @Length(1, 200)
  deviceId!: string;
}
