import { Module } from '@nestjs/common';
import { SocialController } from './social.controller';
import { SocialService } from './social.service';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';
import { OpenaiModule } from '../ai/openai.module';

@Module({
  imports: [PrismaModule, StorageModule, OpenaiModule],
  controllers: [SocialController],
  providers: [SocialService],
})
export class SocialModule {}
