import { Module } from '@nestjs/common';
import { MarketController } from './market.controller';
import { MarketService } from './market.service';
import { PrismaModule } from '../prisma/prisma.module';
import { OpenaiModule } from '../ai/openai.module';
import { AiUsageModule } from '../ai/ai-usage.module';

// Mercado (grocery list) PRO/CHEF: lista simple de comida genérica (buscador estático en
// el frontend, con emoji) + CRUD + nota opcional por ítem + precio estimado por IA.
@Module({
  imports: [PrismaModule, OpenaiModule, AiUsageModule],
  controllers: [MarketController],
  providers: [MarketService],
})
export class MarketModule {}
