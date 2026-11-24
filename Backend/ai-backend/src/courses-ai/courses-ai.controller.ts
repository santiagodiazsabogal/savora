import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  Req,
  UseGuards,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CoursesAiService } from './courses-ai.service';

type AuthRequest = Request & { user?: { id?: number } };

// Cursos: acceso a TODOS los planes (solo JwtAuthGuard). El plan limita el USO (topes de
// lecciones/cursos aplicados en el servicio al completar), no el acceso.
// ThrottlerGuard a nivel de controlador (120/min por IP, ver app.module); las rutas que
// llaman a OpenAI llevan además un @Throttle más estricto (anti-burst) + el tope diario
// de IA por usuario (AiUsageService) en el servicio.
@Controller('courses-ai')
@UseGuards(JwtAuthGuard, ThrottlerGuard)
export class CoursesAiController {
  constructor(private readonly coursesAiService: CoursesAiService) {}

  @Get('catalog')
  getCatalog(
    @Query('category') category: string = 'Chicken',
    @Req() req: AuthRequest,
  ) {
    return this.coursesAiService.getCatalog(this.uid(req), category);
  }

  // Roadmap de una categoría: recetas de la categoría + habilidades intercaladas + estado/cuota.
  @Get('category-roadmap')
  getCategoryRoadmap(
    @Query('category') category: string = 'Chicken',
    @Req() req: AuthRequest,
  ) {
    return this.coursesAiService.getCategoryRoadmap(this.uid(req), category);
  }

  @Get('my')
  getMyCourses(@Req() req: AuthRequest) {
    return this.coursesAiService.getMyCourses(this.uid(req));
  }

  @Get('stats')
  getStats(@Req() req: AuthRequest) {
    return this.coursesAiService.getStats(this.uid(req));
  }

  @Get('badges')
  getBadges(@Req() req: AuthRequest) {
    return this.coursesAiService.getBadges(this.uid(req));
  }

  // Puede disparar UNA generación con OpenAI si el syllabus no está cacheado.
  @Throttle({ default: { limit: 12, ttl: 60_000 } })
  @Get(':idMeal/syllabus')
  getSyllabus(
    @Param('idMeal') idMeal: string,
    @Query('language') language: string,
    @Req() req: AuthRequest,
  ) {
    return this.coursesAiService.getSyllabus(this.uid(req), idMeal, this.lang(language));
  }

  @Get(':idMeal/progress')
  getCourseProgress(@Param('idMeal') idMeal: string, @Req() req: AuthRequest) {
    return this.coursesAiService.getCourseProgress(this.uid(req), idMeal);
  }

  // Cada mensaje = 1 llamada a OpenAI. El chat no consume el tope diario (regla de
  // producto), así que el freno anti-abuso es este throttle.
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post(':idMeal/lessons/:numero/chat')
  chatLesson(
    @Param('idMeal') idMeal: string,
    @Param('numero') numero: string,
    @Body() body: { messages: Array<{ role: 'user' | 'assistant'; content: string }> },
    @Req() req: AuthRequest,
  ) {
    return this.coursesAiService.chatLesson(this.uid(req), idMeal, parseInt(numero), body.messages);
  }

  @Post(':idMeal/lessons/:numero/complete')
  completeLesson(
    @Param('idMeal') idMeal: string,
    @Param('numero') numero: string,
    @Req() req: AuthRequest,
  ) {
    return this.coursesAiService.completeLesson(this.uid(req), idMeal, parseInt(numero));
  }

  @Post(':idMeal/complete')
  completeCourse(@Param('idMeal') idMeal: string, @Req() req: AuthRequest) {
    return this.coursesAiService.completeCourse(this.uid(req), idMeal);
  }

  // gpt-4o visión (la llamada más cara del módulo) → throttle estricto + tope diario.
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  @Post(':idMeal/feedback')
  feedback(
    @Param('idMeal') idMeal: string,
    @Body() body: { image: string; language?: string },
    @Req() req: AuthRequest,
  ) {
    return this.coursesAiService.feedbackResult(this.uid(req), idMeal, body.image, this.lang(body.language));
  }

  // Ayuda visual EN VIVO durante un paso (copiloto). gpt-4o step-aware → mismo throttle + tope.
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  @Post(':idMeal/lessons/:numero/step-help')
  stepHelp(
    @Param('idMeal') idMeal: string,
    @Param('numero') numero: string,
    @Body() body: { image: string; stepText?: string; language?: string },
    @Req() req: AuthRequest,
  ) {
    return this.coursesAiService.stepHelp(
      this.uid(req), idMeal, parseInt(numero), body.stepText ?? '', body.image, this.lang(body.language),
    );
  }

  private uid(req: AuthRequest): number {
    if (!req.user?.id) throw new UnauthorizedException('Not authenticated');
    return req.user.id;
  }

  private lang(language?: string): 'es' | 'en' {
    return language === 'en' ? 'en' : 'es';
  }
}
