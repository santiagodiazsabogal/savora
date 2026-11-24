import { Module } from '@nestjs/common';
import { WaitlistController } from './waitlist.controller';
import { WaitlistService } from './waitlist.service';
import { EmailService } from '../auth/email.service';
import { PrismaModule } from '../prisma/prisma.module';

// Waitlist de pre-lanzamiento: registro público con referidos y posición calculada.
// EmailService se provee directo (no lo exporta AuthModule y no tiene dependencias).
@Module({
  imports: [PrismaModule],
  controllers: [WaitlistController],
  providers: [WaitlistService, EmailService],
})
export class WaitlistModule {}
