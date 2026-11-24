import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { BattleGateway } from './battle.gateway';
import { BattleService } from './battle.service';
import { BattleController } from './battle.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { OpenaiModule } from '../ai/openai.module';
import { StatsModule } from '../stats/stats.module';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [
    PrismaModule,
    OpenaiModule,
    StatsModule,
    StorageModule, // fotos de los platos → Supabase Storage (no base64 en la DB)
    // Mismo secret que el resto de la app para validar el token en el handshake WS
    JwtModule.register({
      secret: process.env.JWT_SECRET,
    }),
  ],
  controllers: [BattleController],
  providers: [BattleGateway, BattleService],
})
export class BattleModule {}
