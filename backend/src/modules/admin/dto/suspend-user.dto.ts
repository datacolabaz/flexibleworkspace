import { IsBoolean, IsString, MinLength } from 'class-validator';

export class SuspendUserDto {
  @IsBoolean()
  suspended: boolean;

  @IsString()
  @MinLength(3)
  reason: string;
}
