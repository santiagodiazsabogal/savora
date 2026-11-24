// =========================
// Tipos del Duelo de Cocina
// =========================

// my_ingredients/chef_choice = receta compartida (1 plato igual para todos)
// buffet = cada jugador cocina un curso distinto (menú colectivo) · solo privada
// teams = 2 equipos de 2; cada equipo cocina el mismo set de platos · solo privada
export type BattleMode = 'my_ingredients' | 'chef_choice' | 'buffet' | 'teams';
export type BattleStatus = 'waiting' | 'cooking' | 'judging' | 'finished' | 'cancelled';
// 'public' = matchmaking rápido con desconocidos | 'private' = sala con código, inicio del host
export type BattleVisibility = 'public' | 'private';

// Cursos disponibles para Buffet/Equipos (el host reparte uno a cada jugador)
export type BattleCourse = 'starter' | 'main' | 'salad' | 'dessert' | 'drink';
export const BATTLE_COURSES: BattleCourse[] = ['starter', 'main', 'salad', 'dessert', 'drink'];
// Frase en inglés para el prompt de generación, por curso
export const COURSE_PROMPT: Record<BattleCourse, string> = {
  starter: 'appetizer / starter',
  main: 'main course',
  salad: 'salad',
  dessert: 'dessert',
  drink: 'drink / beverage',
};
// Modo teams = exactamente 4 jugadores (2 vs 2)
export const TEAMS_REQUIRED_PLAYERS = 4;
// Set por defecto de cursos (mirror entre equipos / orden del buffet)
export const DEFAULT_COURSE_SET: BattleCourse[] = ['main', 'salad', 'dessert', 'starter'];

// Reglas de negocio del duelo
export const BATTLE_MAX_PLAYERS = 4;
export const BATTLE_MIN_PLAYERS = 2;
export const LOBBY_DURATION_MS = 2 * 60 * 1000; // 2 minutos de lobby (pública)
// Pública: cuenta corta cuando TODOS los presentes están listos pero la sala no está llena (2-3)
export const QUICK_START_MS = 15 * 1000; // 15 segundos
// Sala privada: el host controla el inicio. Este TTL solo limpia salas abandonadas.
export const PRIVATE_LOBBY_TTL_MS = 15 * 60 * 1000; // 15 minutos
export const COOKING_GRACE_MS = 30 * 1000; // margen extra tras el límite para enviar foto
export const FREE_LIMIT = 3; // límite de recetas del plan FREE (mismo valor que recipes)

// Alfabeto sin caracteres ambiguos (sin 0/O/1/I/L) para los códigos de invitación
export const JOIN_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const JOIN_CODE_LENGTH = 6;

// Umbral de solapamiento de ingredientes (Jaccard) para emparejar en modo my_ingredients
export const INGREDIENT_MATCH_THRESHOLD = 0.25;

export type RecipeData = {
  title: string;
  description?: string | null;
  ingredients: string[];
  tools: string[];
  steps: string[];
  stepTips?: (string | null)[]; // un tip por paso, alineado por índice
  difficulty?: string;
  cookTime?: number;
  tip?: string | null;
};

export type JudgeRankingEntry = {
  userId: number;
  rank: number;
  score: number;
  comment: string;
};

export type JudgeResult = {
  ranking: JudgeRankingEntry[];
  summary: string;
};

// Payload mínimo que mandamos al cliente para representar un jugador en la sala
export type PlayerPublic = {
  userId: number;
  name: string | null;
  isReady: boolean;
  isHost: boolean;
  hasSubmittedPhoto: boolean;
  // Buffet/Equipos
  team?: number | null;
  courseLabel?: string | null;
  recipeTitle?: string | null;
  recipe?: RecipeData | null; // solo durante cooking/judging/finished
};

// Datos que el socket adjunta tras autenticar el handshake
export type SocketUser = {
  id: number;
  email: string;
};
