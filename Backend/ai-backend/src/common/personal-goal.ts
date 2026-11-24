// Meta nutricional PERSONALIZADA (tarjeta de calorías del dashboard).
// Fórmula determinística (Mifflin-St Jeor → TDEE → ajuste por objetivo), NUNCA IA:
// es gratis, instantánea y no alucina números en un tema de salud. La IA entra
// después: el target de kcal por plato se inyecta como hint en la generación.
//
// Ojo al modelo: el tracker solo cuenta platos cocinados EN Savora, así que la
// meta semanal NO es el TDEE×7 (sería inalcanzable) sino kcal-por-plato × platos
// que el usuario quiere cocinar a la semana (mealsPerWeek, default 5).

export const ACTIVITY_FACTORS: Record<string, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  high: 1.725,
};

// Ajuste del TDEE según el objetivo elegido (nutritionGoal).
export const GOAL_ADJUST: Record<string, number> = {
  healthy: 1.0,
  cut: 0.8, // definición ≈ −20%
  bulk: 1.12, // volumen ≈ +12%
  balance: 1.0,
};

// Un plato principal ≈ 35% de las calorías del día.
const MAIN_MEAL_SHARE = 0.35;
const DEFAULT_MEALS_PER_WEEK = 5;

export interface PersonalGoal {
  weeklyKcal: number; // meta del anillo del dashboard
  perMealKcal: number; // target por plato (hint para la IA)
  tdee: number; // mantenimiento diario estimado
}

export interface BodyProfile {
  weightKg?: number | null;
  heightCm?: number | null;
  birthYear?: number | null;
  sex?: string | null;
  activityLevel?: string | null;
  mealsPerWeek?: number | null;
  nutritionGoal?: string | null;
}

export function computePersonalGoal(u: BodyProfile): PersonalGoal | null {
  const { weightKg, heightCm, birthYear, sex } = u;
  if (!weightKg || !heightCm || !birthYear) return null;
  if (sex !== 'male' && sex !== 'female') return null;

  const age = new Date().getUTCFullYear() - birthYear;
  if (age < 13 || age > 100) return null;

  const bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === 'male' ? 5 : -161);
  const tdee = bmr * (ACTIVITY_FACTORS[u.activityLevel ?? ''] ?? ACTIVITY_FACTORS.light);
  const adjusted = tdee * (GOAL_ADJUST[u.nutritionGoal ?? ''] ?? 1.0);

  const perMealKcal = Math.round((adjusted * MAIN_MEAL_SHARE) / 10) * 10;
  const meals = Math.min(21, Math.max(1, u.mealsPerWeek ?? DEFAULT_MEALS_PER_WEEK));

  return { weeklyKcal: perMealKcal * meals, perMealKcal, tdee: Math.round(tdee) };
}
