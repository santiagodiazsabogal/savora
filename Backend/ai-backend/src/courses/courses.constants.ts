// Niveles de la app basados en lecciones completadas (lessonsCompleted).
export const APP_LEVELS = [
  { key: 'apprentice', name: 'Apprentice',      emoji: '🍳', minLessons: 0   },
  { key: 'cook',       name: 'Cook',            emoji: '👨‍🍳', minLessons: 10  },
  { key: 'chef',       name: 'Chef',            emoji: '⭐', minLessons: 25  },
  { key: 'exec_chef',  name: 'Executive Chef',  emoji: '🎖️', minLessons: 45  },
  { key: 'master',     name: 'Kitchen Master',  emoji: '🏆', minLessons: 70  },
  { key: 'legend',     name: 'Culinary Legend', emoji: '👑', minLessons: 100 },
] as const

export type AppLevel = (typeof APP_LEVELS)[number]

// Especialidades — se desbloquean al completar 1 curso completo de esa categoría.
export const SPECIALIZATIONS: Record<string, { name: string; emoji: string }> = {
  italian:  { name: 'Pasta Master',        emoji: '🍝' },
  asian:    { name: 'Asian Cuisine Expert', emoji: '🍣' },
  latin:    { name: 'Latin American Chef', emoji: '🌶️' },
  pastry:   { name: 'Pastry Artisan',      emoji: '🥐' },
  grilling: { name: 'Grill Master',        emoji: '🥩' },
  healthy:  { name: 'Healthy Chef',        emoji: '🥗' },
  general:  { name: 'Versatile Chef',      emoji: '👨‍🍳' },
}

export const FREE_MAX_ACTIVE_COURSES = 2
export const UNLOCK_AFTER_COURSES = 3
export const REMINDER_MINUTES_BEFORE = 30

// Advertencias cuando el nivel del usuario es menor al del curso (no bloquean).
const LEVEL_WARNING: Record<string, Record<string, string>> = {
  beginner: {
    intermediate: 'This course is intermediate level. If this is your first time cooking, we recommend starting with one of our beginner courses.',
    advanced:     'This course is advanced. Without prior experience it can be very challenging — we recommend completing at least one basic course first.',
  },
  intermediate: {
    advanced: 'This course is designed for advanced cooks. If you don\'t yet have solid experience, we recommend an intermediate course first.',
  },
}

export function computeAppLevel(lessonsCompleted: number) {
  let idx = 0
  for (let i = 0; i < APP_LEVELS.length; i++) {
    if (lessonsCompleted >= APP_LEVELS[i].minLessons) idx = i
    else break
  }
  const current = APP_LEVELS[idx]
  const next = idx + 1 < APP_LEVELS.length ? APP_LEVELS[idx + 1] : null
  return {
    current,
    next,
    progressToNext: next ? lessonsCompleted - current.minLessons : null,
    neededForNext: next ? next.minLessons - current.minLessons : null,
  }
}

export function getLevelWarning(userLevel: string | null, courseLevel: string): string | null {
  if (!userLevel) return null
  return LEVEL_WARNING[userLevel]?.[courseLevel] ?? null
}
