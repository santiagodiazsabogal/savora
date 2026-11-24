import type { CSSProperties } from 'react'
import {
  ChefHat, BookOpen, Award, CookingPot, Utensils, UtensilsCrossed, Flame,
  Heart, HeartHandshake, Gamepad2, Target, Sword, Swords, Crown, Camera,
  ThumbsUp, Sparkles, Castle, Medal, Trophy, Compass, CalendarDays,
  CalendarCheck, Gem, Sprout, Star, Wheat, Fish, Globe, Users, GraduationCap,
  type LucideIcon,
} from 'lucide-react'

// Un icono lucide propio por insignia (reemplaza los emojis, que se veían genéricos).
// Los ids coinciden con BADGE_CATALOG del backend (badges.service.ts).
export const BADGE_ICON: Record<string, LucideIcon> = {
  // recetas (categoría receta)
  recetas_10: ChefHat, recetas_50: BookOpen, recetas_100: Award,
  cocina_10: CookingPot, cocina_25: Utensils, cocina_50: Flame,
  favoritos_10: Heart, favoritos_25: HeartHandshake,
  // duelos
  duelos_jugados_10: Gamepad2, duelos_jugados_25: Target,
  duelos_10: Sword, duelos_25: Swords, duelos_50: Crown,
  // social
  post_primero: Camera, likes_50: ThumbsUp, likes_100: Sparkles,
  // clan
  clan_lider: Castle, clan_top10: Medal, clan_top3: Trophy, clan_top1: Crown,
  // general / cursos
  primer_fuego: Flame, viajero: Compass, tecnico: UtensilsCrossed, constante: CalendarDays,
  racha_30: CalendarCheck, racha_100: Gem,
  nivel_5: Sprout, nivel_10: Star, nivel_15: Award, veterano: Medal,
  pastero: Wheat, marino: Fish, explorador: Globe,
}

export const CATEGORY_ICON: Record<string, LucideIcon> = {
  receta: ChefHat, duelo: Swords, clan: Users, social: Camera, curso: GraduationCap, general: Sparkles,
}

export function badgeIconFor(id: string, categoria?: string): LucideIcon {
  return BADGE_ICON[id] ?? (categoria ? CATEGORY_ICON[categoria] : undefined) ?? Medal
}

// Color del icono según su categoría (var CSS que cambia con el tema). Fallback a primary.
const CATEGORY_COLOR_VAR: Record<string, string> = {
  receta: 'var(--badge-receta)', duelo: 'var(--badge-duelo)', clan: 'var(--badge-clan)',
  social: 'var(--badge-social)', curso: 'var(--badge-curso)', general: 'var(--badge-general)',
}
export function badgeColor(categoria?: string): string {
  return (categoria && CATEGORY_COLOR_VAR[categoria]) ?? 'var(--sv-primary)'
}
// Fondo tenue de la medalla, tintado del color de la categoría.
export function badgeSoftBg(categoria?: string): string {
  return `color-mix(in srgb, ${badgeColor(categoria)} 16%, transparent)`
}

export function categoryIconFor(categoria: string): LucideIcon {
  return CATEGORY_ICON[categoria] ?? Sparkles
}

// Render directo del icono de una insignia (con fallback por categoría y genérico).
export function BadgeIcon({ id, categoria, className, style }: {
  id: string; categoria?: string; className?: string; style?: CSSProperties
}) {
  const Icon = badgeIconFor(id, categoria)
  return <Icon className={className} style={style} />
}
