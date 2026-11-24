import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UsersModule } from '../users/users.module';
import { EmailService } from './email.service';
import { PrismaModule } from '../prisma/prisma.module';

import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './jwt.strategy';

@Module({
  imports: [
    UsersModule,
    PrismaModule,

    PassportModule.register({
      defaultStrategy: 'jwt',
    }),

    JwtModule.register({
      secret: process.env.JWT_SECRET, // 🔥 SIN fallback
      signOptions: {
        expiresIn: process.env.JWT_EXPIRES_IN as any || '30d',
      },
    }),
  ],

  controllers: [AuthController],

  providers: [
    AuthService,
    EmailService,
    JwtStrategy,
  ],

  exports: [
    AuthService,
    PassportModule,
  ],
})
export class AuthModule {}