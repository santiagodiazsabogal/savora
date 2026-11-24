import {
  Controller, Post, Get, Patch, Delete,
  Body, Param, ParseIntPipe, Req, UseGuards,
  UnauthorizedException, BadRequestException, Query,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { RecipesService } from './recipes.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Request } from 'express';

// ThrottlerGuard a nivel de controlador (120/min por IP por defecto, ver app.module);
// las rutas de IA pesadas llevan además un @Throttle más estricto (anti-burst). El tope
// de COSTO real (por usuario/día) lo aplica recipes.service (ver enforceDailyAiLimit).
@Controller('recipes')
@UseGuards(ThrottlerGuard)
export class RecipesController {

  constructor(private recipesService: RecipesService) {}

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @UseGuards(JwtAuthGuard)
  @Post('generate')
  async generateRecipe(
    @Body('message') message: string,
    @Body('language') language: string,
    @Req() req: Request & { user?: any },
  ) {
    if (!req.user?.id) throw new UnauthorizedException('Not authenticated');
    if (!message?.trim()) throw new BadRequestException('Message is required');
    return this.recipesService.generateRecipe(req.user.id, message, language === 'es' ? 'es' : 'en');
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @UseGuards(JwtAuthGuard)
  @Post('analyze-fridge')
  async analyzeFridge(
    @Body('images') images: string[],
    @Body('mealTime') mealTime: string,
    @Body('language') language: string,
    @Body('textIngredients') textIngredients: string,
    @Req() req: Request & { user?: any },
  ) {
    if (!req.user?.id) throw new UnauthorizedException('Not authenticated');

    const hasImages = Array.isArray(images) && images.length > 0
    const hasText = typeof textIngredients === 'string' && textIngredients.trim().length > 3

    if (!hasImages && !hasText) {
      throw new BadRequestException('Provide images or text ingredients');
    }
    if (hasImages && images.length > 3) {
      throw new BadRequestException('Maximum 3 images allowed');
    }

    const meal = ['breakfast','lunch','dinner','snack','dessert','drink','cocktail','surprise'].includes(mealTime) ? mealTime : 'lunch';
    const lang = language === 'es' ? 'es' : 'en';

    return this.recipesService.analyzeFridge(
      req.user.id,
      hasImages ? images : [],
      meal,
      lang,
      hasText ? textIngredients.trim() : undefined,
    );
  }

  // 🔎 Solo consulta la receta del día cacheada — NO genera ni gasta el límite
  @UseGuards(JwtAuthGuard)
  @Get('daily')
  async getDailyRecipe(
    @Query('mealTime') mealTime: string,
    @Query('language') language: string,
    @Req() req: Request & { user?: any },
  ) {
    if (!req.user?.id) throw new UnauthorizedException('Not authenticated');
    const meal = ['breakfast','lunch','dinner','snack','dessert','drink','cocktail','surprise'].includes(mealTime) ? mealTime : 'lunch';
    return this.recipesService.getDailyRecipe(req.user.id, meal, language === 'es' ? 'es' : 'en', false);
  }

  // ✨ Genera la receta del día bajo demanda — consume el límite FREE
  @UseGuards(JwtAuthGuard)
  @Post('daily')
  async generateDailyRecipe(
    @Query('mealTime') mealTime: string,
    @Query('language') language: string,
    @Req() req: Request & { user?: any },
  ) {
    if (!req.user?.id) throw new UnauthorizedException('Not authenticated');
    const meal = ['breakfast','lunch','dinner','snack','dessert','drink','cocktail','surprise'].includes(mealTime) ? mealTime : 'lunch';
    return this.recipesService.getDailyRecipe(req.user.id, meal, language === 'es' ? 'es' : 'en', true);
  }

  @UseGuards(JwtAuthGuard)
  @Get('suggestions')
  async getSuggestions(
    @Query('mealType') mealType: string,
    @Query('language') language: string,
    @Req() req: Request & { user?: any },
  ) {
    if (!req.user?.id) throw new UnauthorizedException('Not authenticated');
    return this.recipesService.getSuggestions(req.user.id, mealType || null, language === 'es' ? 'es' : 'en');
  }

  // 🔥 Calorías consumidas esta semana (recetas con Modo Cocina terminado + nutrición)
  @UseGuards(JwtAuthGuard)
  @Get('weekly-nutrition')
  async getWeeklyNutrition(@Req() req: Request & { user?: any }) {
    if (!req.user?.id) throw new UnauthorizedException('Not authenticated');
    return this.recipesService.getWeeklyNutrition(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  async getUserRecipes(@Req() req: Request & { user?: any }) {
    if (!req.user?.id) throw new UnauthorizedException('Not authenticated');
    return this.recipesService.getUserRecipes(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('folders')
  async getUserFolders(@Req() req: Request & { user?: any }) {
    if (!req.user?.id) throw new UnauthorizedException('Not authenticated');
    return this.recipesService.getUserFolders(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('folders')
  async createFolder(@Body('name') name: string, @Req() req: Request & { user?: any }) {
    if (!req.user?.id) throw new UnauthorizedException('Not authenticated');
    return this.recipesService.createFolder(req.user.id, name);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('folders/:folderId')
  async renameFolder(
    @Param('folderId', ParseIntPipe) folderId: number,
    @Body('name') name: string,
    @Req() req: Request & { user?: any },
  ) {
    if (!req.user?.id) throw new UnauthorizedException('Not authenticated');
    return this.recipesService.renameFolder(req.user.id, folderId, name);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('folders/:folderId')
  async deleteFolder(
    @Param('folderId', ParseIntPipe) folderId: number,
    @Req() req: Request & { user?: any },
  ) {
    if (!req.user?.id) throw new UnauthorizedException('Not authenticated');
    return this.recipesService.deleteFolder(req.user.id, folderId);
  }

  // =========================
  // 🗓️ PLANIFICADOR SEMANAL (PRO/CHEF)
  // Rutas declaradas ANTES de :id para que 'meal-plan' no caiga en ParseIntPipe.
  // =========================
  @UseGuards(JwtAuthGuard)
  @Get('meal-plan')
  async getMealPlan(
    @Query('weekStart') weekStart: string,
    @Query('language') language: string,
    @Req() req: Request & { user?: any },
  ) {
    if (!req.user?.id) throw new UnauthorizedException('Not authenticated');
    return this.recipesService.getMealPlan(req.user.id, weekStart, language === 'es' ? 'es' : 'en');
  }

  @UseGuards(JwtAuthGuard)
  @Post('meal-plan')
  async setMealPlanSlot(
    @Body('date') date: string,
    @Body('mealTime') mealTime: string,
    @Body('recipeId') recipeId: number | null,
    @Body('title') title: string,
    @Body('description') description: string,
    @Req() req: Request & { user?: any },
  ) {
    if (!req.user?.id) throw new UnauthorizedException('Not authenticated');
    if (!date) throw new BadRequestException('date is required');
    return this.recipesService.setMealPlanSlot(req.user.id, { date, mealTime, recipeId: recipeId ?? null, title, description });
  }

  @UseGuards(JwtAuthGuard)
  @Post('meal-plan/generate')
  async generateWeeklyMenu(
    @Body('weekStart') weekStart: string,
    @Body('meals') meals: string[],
    @Body('language') language: string,
    @Body('preferences') preferences: any,
    @Req() req: Request & { user?: any },
  ) {
    if (!req.user?.id) throw new UnauthorizedException('Not authenticated');
    if (!weekStart) throw new BadRequestException('weekStart is required');
    const prefs = preferences && typeof preferences === 'object' ? preferences : {};
    return this.recipesService.generateWeeklyMenu(
      req.user.id, weekStart, Array.isArray(meals) ? meals : [],
      language === 'es' ? 'es' : 'en', prefs,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post('meal-plan/:entryId/prepare')
  async prepareMealPlanEntry(
    @Param('entryId', ParseIntPipe) entryId: number,
    @Body('language') language: string,
    @Req() req: Request & { user?: any },
  ) {
    if (!req.user?.id) throw new UnauthorizedException('Not authenticated');
    return this.recipesService.prepareMealPlanEntry(req.user.id, entryId, language === 'es' ? 'es' : 'en');
  }

  @UseGuards(JwtAuthGuard)
  @Patch('meal-plan/:entryId')
  async moveMealPlanSlot(
    @Param('entryId', ParseIntPipe) entryId: number,
    @Body('date') date: string,
    @Body('mealTime') mealTime: string,
    @Req() req: Request & { user?: any },
  ) {
    if (!req.user?.id) throw new UnauthorizedException('Not authenticated');
    return this.recipesService.moveMealPlanSlot(req.user.id, entryId, { date, mealTime });
  }

  @UseGuards(JwtAuthGuard)
  @Delete('meal-plan/:entryId')
  async removeMealPlanSlot(
    @Param('entryId', ParseIntPipe) entryId: number,
    @Req() req: Request & { user?: any },
  ) {
    if (!req.user?.id) throw new UnauthorizedException('Not authenticated');
    return this.recipesService.removeMealPlanSlot(req.user.id, entryId);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async getRecipeById(
    @Param('id', ParseIntPipe) recipeId: number,
    @Req() req: Request & { user?: any },
  ) {
    if (!req.user?.id) throw new UnauthorizedException('Not authenticated');
    return this.recipesService.getRecipeById(req.user.id, recipeId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async deleteRecipe(
    @Param('id', ParseIntPipe) recipeId: number,
    @Req() req: Request & { user?: any },
  ) {
    if (!req.user?.id) throw new UnauthorizedException('Not authenticated');
    return this.recipesService.deleteRecipe(req.user.id, recipeId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id/favorite')
  async toggleFavorite(
    @Param('id', ParseIntPipe) recipeId: number,
    @Req() req: Request & { user?: any },
  ) {
    if (!req.user?.id) throw new UnauthorizedException('Not authenticated');
    return this.recipesService.toggleFavorite(req.user.id, recipeId);
  }

  // Terminar el Modo Cocina → exige foto del plato (verificada con visión IA) y
  // otorga XP (1ª vez por receta). Idempotente.
  @UseGuards(JwtAuthGuard)
  @Post(':id/cooked')
  async markRecipeCooked(
    @Param('id', ParseIntPipe) recipeId: number,
    @Body('photoBase64') photoBase64: string,
    @Req() req: Request & { user?: any },
  ) {
    if (!req.user?.id) throw new UnauthorizedException('Not authenticated');
    return this.recipesService.markRecipeCooked(req.user.id, recipeId, photoBase64);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id/folder')
  async moveToFolder(
    @Param('id', ParseIntPipe) recipeId: number,
    @Body('folderId') folderId: number | null,
    @Req() req: Request & { user?: any },
  ) {
    if (!req.user?.id) throw new UnauthorizedException('Not authenticated');
    return this.recipesService.moveRecipeToFolder(req.user.id, recipeId, folderId ?? null);
  }
}