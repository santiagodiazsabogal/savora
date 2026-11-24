import { computePersonalGoal } from './personal-goal';

// La meta personalizada es fórmula pura (sin IA): Mifflin-St Jeor → TDEE →
// ajuste por objetivo → kcal por plato (35% del día) × platos/semana.
describe('computePersonalGoal', () => {
  const base = {
    weightKg: 70,
    heightCm: 175,
    birthYear: new Date().getUTCFullYear() - 25, // 25 años
    sex: 'male',
    activityLevel: 'moderate',
    mealsPerWeek: 5,
    nutritionGoal: 'healthy',
  };

  it('devuelve null si faltan datos corporales', () => {
    expect(computePersonalGoal({})).toBeNull();
    expect(computePersonalGoal({ ...base, weightKg: null })).toBeNull();
    expect(computePersonalGoal({ ...base, sex: 'other' })).toBeNull();
  });

  it('devuelve null fuera del rango de edad razonable (13-100)', () => {
    const thisYear = new Date().getUTCFullYear();
    expect(computePersonalGoal({ ...base, birthYear: thisYear - 10 })).toBeNull();
    expect(computePersonalGoal({ ...base, birthYear: thisYear - 120 })).toBeNull();
  });

  it('calcula BMR/TDEE correctos (hombre 25a, 70kg, 175cm, moderado)', () => {
    const g = computePersonalGoal(base)!;
    // BMR = 10*70 + 6.25*175 - 5*25 + 5 = 1673.75 → TDEE ×1.55 ≈ 2594
    expect(g.tdee).toBe(2594);
    // por plato: 2594*0.35 = 908 → redondeado a decena = 910; semanal = ×5
    expect(g.perMealKcal).toBe(910);
    expect(g.weeklyKcal).toBe(4550);
  });

  it('definición baja la meta y volumen la sube', () => {
    const cut = computePersonalGoal({ ...base, nutritionGoal: 'cut' })!;
    const bulk = computePersonalGoal({ ...base, nutritionGoal: 'bulk' })!;
    const healthy = computePersonalGoal(base)!;
    expect(cut.perMealKcal).toBeLessThan(healthy.perMealKcal);
    expect(bulk.perMealKcal).toBeGreaterThan(healthy.perMealKcal);
  });

  it('la fórmula de mujer resta 161 en el BMR', () => {
    const female = computePersonalGoal({ ...base, sex: 'female' })!;
    const male = computePersonalGoal(base)!;
    expect(female.tdee).toBeLessThan(male.tdee);
  });

  it('sin mealsPerWeek usa 5 por defecto', () => {
    const g = computePersonalGoal({ ...base, mealsPerWeek: null })!;
    expect(g.weeklyKcal).toBe(g.perMealKcal * 5);
  });
});
