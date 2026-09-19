import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class GoogleLoginDto {
  @ApiProperty({
    description:
      "The ID token returned by Google Identity Services' Sign in with Google button (a signed JWT, verified server-side against Google's public keys — never a bare access token or profile object the client could forge).",
  })
  @IsString()
  @IsNotEmpty()
  idToken: string;
}
