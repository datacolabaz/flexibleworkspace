import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AccountController } from './account.controller';
import { AccountService } from './account.service';
import { AppUserEntity } from './entities/app-user.entity';
import { UserRoleEntity } from './entities/user-role.entity';
import { OtpCodeEntity } from './entities/otp-code.entity';
import { RefreshTokenEntity } from './entities/refresh-token.entity';
import { OAuthIdentityEntity } from './entities/oauth-identity.entity';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AppUserEntity,
      UserRoleEntity,
      OtpCodeEntity,
      RefreshTokenEntity,
      OAuthIdentityEntity,
    ]),
    NotificationsModule,
  ],
  controllers: [AuthController, AccountController],
  providers: [AuthService, AccountService],
  exports: [AuthService],
})
export class AuthModule {}
