// Jerarquía de planes (espejo del backend src/common/plans.ts).
//   FREE: 3 recetas + guardarlas + chat / sugerencias / receta del día.
//   PRO:  + Duelo de cocina + TTS (voz) + recetas ilimitadas.
//   CHEF: + Cursos (+ Horario y futuras exclusivas).

/** PRO o CHEF — premium compartido (Duelo, TTS). */
export const isPaid = (plan?: string | null): boolean => plan === 'PRO' || plan === 'CHEF'

/** Solo CHEF — el tier tope (Cursos, Horario). */
export const isChef = (plan?: string | null): boolean => plan === 'CHEF'
