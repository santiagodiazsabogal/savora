// Montos de XP por actividad y umbrales de nivel de cocina.
// Un solo lugar para tunear toda la progresión global.
//
// Curva de nivel (stats.service.calcularNivel): nivel n se alcanza con 100·(n-1)^1.8 XP.
//   nivel 2=100 · 3=348 · 4=723 · 5=1213 · 6=1812 · 7=2505 XP
//
// Pacing buscado (progresión lenta; cocinar = fuente más accesible para todos los planes):
//   - intermedio (nivel 3 ≈ 348 XP)  ≈ 14 recetas cocinadas (~2-3 semanas)
//   - avanzado   (nivel 6 ≈ 1812 XP) ≈ 73 recetas cocinadas (~2-3 meses) o ~17 cursos
//   Cursos/duelos/misiones aceleran (dan más por evento), pero sin disparar el nivel.

export const XP = {
  COOK_MODE: 25,        // terminar el Modo Cocina de una receta (1ª vez por receta)
  DUEL_PLAY: 20,        // participar en un duelo
  DUEL_WIN: 40,         // bonus extra al ganador (ganador = 60 en total)
  LESSON: 10,           // completar una lección de curso (1ª vez)
  COURSE_BASE: 45,      // base por completar un curso entero
  COURSE_PER_LEVEL: 5,  // + por nivelMinimo del curso → curso = COURSE_BASE + nivelMinimo*5
} as const;

// Nivel a partir del cual el cookingLevel sube solo (nunca baja; 'advanced' es el tope).
export const COOKING_LEVEL_THRESHOLDS = {
  intermediate: 3,
  advanced: 6,
} as const;

// Orden de los niveles de cocina para comparar/derivar (beginner < intermediate < advanced).
export const COOKING_LEVELS_ORDER = ['beginner', 'intermediate', 'advanced'] as const;
