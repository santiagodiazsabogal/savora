// Jerarquía de planes de Savora.
//   FREE: 3 recetas + guardarlas + chat / sugerencias / receta del día.
//   PRO:  todo lo de FREE (ilimitado) + Duelo de cocina + TTS (voz).
//   CHEF: todo lo de PRO + Cursos (+ Horario y futuras exclusivas).
//
// Se comparan como string para no acoplarse a la regeneración del cliente Prisma:
// el valor 'CHEF' entra al tipo `Plan` recién tras correr `prisma db push`, pero el
// gating ya funciona sin esperar a eso.

/** PRO o CHEF — features premium compartidas (Duelo, TTS, recetas ilimitadas). */
export function isPaid(plan: string | null | undefined): boolean {
  return plan === 'PRO' || plan === 'CHEF';
}

/** Solo CHEF — el tier tope (Cursos, Horario y exclusivas). */
export function isChef(plan: string | null | undefined): boolean {
  return plan === 'CHEF';
}
