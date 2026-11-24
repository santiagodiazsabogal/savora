import {
  Body,
  Controller,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TtsService } from './tts.service';
import { TtsRequestDto } from './dto/tts-request.dto';

@Controller('tts')
@UseGuards(JwtAuthGuard)
export class TtsController {
  constructor(private readonly ttsService: TtsService) {}

  // POST /api/tts/speak → devuelve audio/mpeg (solo PRO)
  @Post('speak')
  async speak(
    @Body() dto: TtsRequestDto,
    @Req() req: Request & { user?: { id?: number } },
    @Res() res: Response,
  ) {
    if (!req.user?.id) throw new UnauthorizedException('Not authenticated');

    const audio = await this.ttsService.synthesize(dto.text, req.user.id);

    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Length': String(audio.length),
      // El audio de un texto dado nunca cambia → cacheable agresivamente.
      'Cache-Control': 'private, max-age=31536000, immutable',
    });
    res.send(audio);
  }
}
