import { Module } from '@nestjs/common';
import { RecipesController } from './recipes.controller';
import { RecipesService } from './recipes.service';
import { PrismaService } from '../prisma/prisma.service';
import { OpenaiService } from '../ai/openai.service';
import { CacheModule } from '../cache/cache.module';
import { StatsModule } from '../stats/stats.module';

@Module({
  imports: [CacheModule, StatsModule],
  controllers: [RecipesController],
  providers: [RecipesService, PrismaService, OpenaiService],
  exports: [RecipesService],
})
export class RecipesModule {}