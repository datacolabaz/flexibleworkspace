import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class FacebookLoginDto {
  @ApiProperty({
    description:
      "The user access token returned by Facebook's JS SDK after FB.login() — verified server-side via the Graph API before it's trusted for anything (see AuthService.loginWithFacebook).",
  })
  @IsString()
  @IsNotEmpty()
  accessToken: string;
}
