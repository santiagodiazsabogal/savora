import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ClansController } from './clans.controller';
import { ClansService } from './clans.service';
import { ClansGateway } from './clans.gateway';
import { PaidGuard } from './paid.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { OpenaiModule } from '../ai/openai.module';
import { StatsModule } from '../stats/stats.module';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [
    PrismaModule,
    JwtModule.register({ secret: process.env.JWT_SECRET }),
    OpenaiModule,
    StatsModule,
    StorageModule, // imágenes del chat → Supabase Storage (no base64 en la DB)
  ],
  controllers: [ClansController],
  providers: [ClansService, ClansGateway, PaidGuard],
  exports: [ClansService],
})
export class ClansModule {}
