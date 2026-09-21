import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  currentPassword!: string;

  // 여기 MinLength(8)은 입력 형식의 최소 하한일 뿐이다. 실제 정책(길이·조합 요건)은
  // PasswordPolicyService가 policy_config가 아닌 런타임 설정값으로 검증한다.
  @ApiProperty()
  @IsString()
  @MinLength(8)
  newPassword!: string;
}
