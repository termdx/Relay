import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, type JwtSignOptions } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { InviteService } from './invite.service';
import { PasswordService } from './password.service';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        // Generated per-workspace by the runtime and injected via the compose
        // .env — fail fast rather than fall back to a guessable default.
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          // Config widens to `string`; the lib wants its literal duration union.
          expiresIn: config.get<string>(
            'JWT_TTL',
            '7d',
          ) as JwtSignOptions['expiresIn'],
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, InviteService, PasswordService],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
