import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { PrismaModule } from '../prisma/prisma.module';
import { OpenaiModule } from '../ai/openai.module';

@Module({
  imports: [PrismaModule, OpenaiModule],
  controllers: [ChatController],
  providers: [ChatService],
})
export class ChatModule {}