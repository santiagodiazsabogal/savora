import { Module } from '@nestjs/common';
import { CoursesAiController } from './courses-ai.controller';
import { CoursesAiService } from './courses-ai.service';
import { ChefGuard } from './chef.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { StatsModule } from '../stats/stats.module';
import { BadgesModule } from '../badges/badges.module';
import { ClansModule } from '../clans/clans.module';
import { AiUsageModule } from '../ai/ai-usage.module';

@Module({
  imports: [PrismaModule, StatsModule, BadgesModule, ClansModule, AiUsageModule],
  controllers: [CoursesAiController],
  providers: [CoursesAiService, ChefGuard],
  exports: [CoursesAiService],
})
export class CoursesAiModule {}
