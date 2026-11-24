import { Module } from '@nestjs/common';
import { OpenaiService } from './openai.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule], // 🔥 ESTA LÍNEA ES LA CLAVE
  providers: [OpenaiService],
  exports: [OpenaiService]
})
export class OpenaiModule {}