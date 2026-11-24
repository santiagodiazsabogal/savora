import { IsArray, IsIn, IsInt, IsNumber, IsOptional, IsString, Matches, Max, Min } from 'class-validator'

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  name?: string

  @IsOptional()
  @IsString()
  cookingLevel?: string

  @IsOptional()
  @IsString()
  dietType?: string

  @IsOptional()
  @IsString()
  goal?: string

  @IsOptional()
  @IsString()
  allergies?: string

  @IsOptional()
  @IsString()
  username?: string

  // Objetivo nutricional de la tarjeta de calorías del dashboard (meta semanal).
  @IsOptional()
  @IsIn(['healthy', 'cut', 'bulk', 'balance'])
  nutritionGoal?: string

  // Datos corporales OPCIONALES para personalizar la meta (fórmula Mifflin-St Jeor).
  @IsOptional() @IsNumber() @Min(25) @Max(350)
  weightKg?: number

  @IsOptional() @IsNumber() @Min(100) @Max(250)
  heightCm?: number

  @IsOptional() @IsInt() @Min(1926) @Max(2013) // edad mínima 13 (política de la app)
  birthYear?: number

  @IsOptional() @IsIn(['male', 'female'])
  sex?: string

  @IsOptional() @IsIn(['sedentary', 'light', 'moderate', 'high'])
  activityLevel?: string

  @IsOptional() @IsInt() @Min(1) @Max(21)
  mealsPerWeek?: number

  // Despensa (PantryCheck / My Kitchen): lista de ingredientes que el usuario tiene en casa.
  // Se sanitiza en el service (trim, dedup, topes) antes de guardar.
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  pantry?: string[]

  // Utensilios (cajón de My Kitchen): misma sanitización que la despensa.
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  utensils?: string[]

  // ZIP de EE.UU. para precios reales de Kroger en el mercado (opcional).
  @IsOptional()
  @Matches(/^\d{5}$/, { message: 'ZIP_INVALID' })
  zipCode?: string

  // timeAvailable eliminado — ahora es contextual por receta, no un atributo permanente
}