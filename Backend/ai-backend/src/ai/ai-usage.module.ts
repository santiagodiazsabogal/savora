import { Module } from '@nestjs/common';
import { AiUsageService } from './ai-usage.service';
import { PrismaModule } from '../prisma/prisma.module';

// Solo-Prisma (como StatsModule): lo importan los módulos que llaman a OpenAI
// fuera de recipes (courses-ai) sin crear ciclos de DI.
@Module({
  imports: [PrismaModule],
  providers: [AiUsageService],
  exports: [AiUsageService],
})
export class AiUsageModule {}
