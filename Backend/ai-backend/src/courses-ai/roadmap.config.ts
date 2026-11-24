/**
 * Roadmap POR CATEGORÍA. Cada categoría del catálogo es su propio camino: sus recetas reales
 * (de TheMealDB/TheCocktailDB, capadas) + nodos de HABILIDAD curados, INTERCALADOS.
 *
 * - Nodo receta  → idMeal real (o `d_<id>` para bebidas). Reusa el motor de cursos tal cual.
 * - Nodo skill   → habilidad IA generada desde un `seed`, id namespaced `path_<key>` (mismo truco
 *                  que las bebidas `d_`). Se intercala tras `pos` recetas (0 = al inicio).
 *
 * Config curada en código (como BADGE_CATALOG). Añadir una habilidad = una entrada más.
 */
export const SKILL_PREFIX = 'path_';
export const skillIdOf = (key: string) => SKILL_PREFIX + key;

// Cuántas recetas de la categoría entran al roadmap (las primeras N del API).
export const RECIPES_PER_CATEGORY = 12;

export interface SkillNode {
  key: string;   // único global (id = path_<key>)
  pos: number;   // se inserta tras `pos` recetas (0 = antes de la 1ª)
  title: string;
  desc: string;
  seed: string;  // qué enseñar (va al prompt de técnica)
}

export interface CategoryRoadmapDef {
  color: string;
  skills: SkillNode[];
}

// Cada categoría del catálogo → color + habilidades intercaladas.
export const CATEGORY_ROADMAP: Record<string, CategoryRoadmapDef> = {
  Chicken: {
    color: '#F59E0B',
    skills: [
      { key: 'chicken_prep', pos: 0, title: 'Prepping Chicken', desc: 'Trim, portion and handle raw poultry safely.', seed: 'Cómo preparar pollo: limpiar y recortar, porcionar (pechuga, muslo, alas), deshuesar básico, y manejo SEGURO de pollo crudo (contaminación cruzada, tabla aparte, lavado de manos).' },
      { key: 'chicken_roast', pos: 4, title: 'Roasting & Grilling', desc: 'Juicy chicken with crispy skin and safe doneness.', seed: 'Asar y grillar pollo: sazonado y salmuera rápida, temperatura del horno/parrilla, punto de cocción seguro (75°C interno), piel crujiente, y reposo antes de cortar.' },
    ],
  },
  Beef: {
    color: '#EF4444',
    skills: [
      { key: 'beef_cuts', pos: 0, title: 'Beef Cuts 101', desc: 'Know the cuts and cut against the grain.', seed: 'Cortes de res: identificar cortes comunes y para qué sirven, cortar A CONTRAPELO (against the grain) para ternura, y recortar grasa/plata.' },
      { key: 'beef_steak', pos: 4, title: 'Steak to Doneness', desc: 'Sear, hit the right temp and rest.', seed: 'Cocinar un filete al punto: secar y sazonar, sellar en sartén bien caliente, temperaturas internas por término (rare a well done), aceite/superficie caliente (seguridad), y reposar la carne.' },
    ],
  },
  Pork: {
    color: '#FB7185',
    skills: [
      { key: 'pork_basics', pos: 0, title: 'Pork Basics', desc: 'Cuts, marinating and safe temperature.', seed: 'Básicos del cerdo: cortes comunes, marinar, temperatura interna segura, y evitar secarlo.' },
      { key: 'pork_crackling', pos: 4, title: 'Roast & Crackling', desc: 'Roast pork with crunchy crackling.', seed: 'Asar cerdo con chicharrón/crackling crujiente: secar la piel, marcar, sal, calor alto inicial (cuidado con salpicaduras y horno caliente), y reposo.' },
    ],
  },
  Seafood: {
    color: '#22D3EE',
    skills: [
      { key: 'seafood_fish', pos: 0, title: 'Handling Fish', desc: 'Freshness, filleting and crispy skin.', seed: 'Manejo de pescado: señales de frescura, filetear y quitar espinas, y lograr piel crujiente sin sobrecocer.' },
      { key: 'seafood_shellfish', pos: 4, title: 'Cooking Shellfish', desc: 'Shrimp and mussels without overcooking.', seed: 'Cocinar mariscos: limpiar y desvenar camarón, cocinar mejillones/almejas (descartar los cerrados), y no pasarse de cocción (quedan gomosos).' },
    ],
  },
  Pasta: {
    color: '#FBBF24',
    skills: [
      { key: 'pasta_dough', pos: 0, title: 'Fresh Pasta', desc: 'Make dough, roll and cut from scratch.', seed: 'Pasta fresca desde cero: masa (harina y huevo), amasar y reposar, estirar fino y cortar; alternativa sin máquina.' },
      { key: 'pasta_sauce', pos: 4, title: 'Al Dente & Sauce', desc: 'Cook al dente and emulsify the sauce.', seed: 'Cocer pasta al dente, salar bien el agua (agua hirviendo: seguridad), reservar agua de cocción y emulsionar la salsa con la pasta.' },
    ],
  },
  Vegetarian: {
    color: '#84CC16',
    skills: [
      { key: 'veg_knife', pos: 0, title: 'Veggie Knife Skills', desc: 'Dice, julienne and chiffonade safely.', seed: 'Cortes de verduras: agarre seguro del cuchillo (garra), picar cebolla, brunoise, juliana y chiffonade; cuchillo afilado (seguridad).' },
      { key: 'veg_roast', pos: 4, title: 'Roast & Sauté', desc: 'Caramelize vegetables for deep flavor.', seed: 'Asar y saltear verduras: cortar parejo, no amontonar la bandeja, caramelización (Maillard), y punto crujiente-tierno.' },
    ],
  },
  Vegan: {
    color: '#22C55E',
    skills: [
      { key: 'vegan_protein', pos: 0, title: 'Plant Proteins', desc: 'Tofu, tempeh and legumes done right.', seed: 'Proteínas vegetales: prensar y marinar tofu, cocinar tempeh, y legumbres (remojo/cocción); lograr buena textura.' },
      { key: 'vegan_umami', pos: 4, title: 'Building Umami', desc: 'Deep flavor without animal products.', seed: 'Construir umami sin productos animales: hongos, tomate, soya/miso, levadura nutricional, ahumados y ácidos para balancear.' },
    ],
  },
  Breakfast: {
    color: '#F97316',
    skills: [
      { key: 'breakfast_eggs', pos: 0, title: 'Egg Techniques', desc: 'Scramble, omelette, poach and fry.', seed: 'Técnicas de huevo: revueltos cremosos, omelette francesa, pochar, y fritos (estrellado/volteado); control de calor.' },
      { key: 'breakfast_batter', pos: 3, title: 'Pancakes & Batters', desc: 'Mix batters and control griddle heat.', seed: 'Panqueques y masas de desayuno: mezclar sin sobrebatir, reposar, y controlar el calor de la plancha/sartén (superficie caliente: seguridad).' },
    ],
  },
  SidesStarters: {
    color: '#A3E635',
    skills: [
      { key: 'sides_knife', pos: 0, title: 'Prep & Knife Skills', desc: 'Clean, even cuts for sides and starters.', seed: 'Prep para acompañamientos y entradas: cortes limpios y parejos, mise en place, y organización.' },
      { key: 'sides_dressing', pos: 4, title: 'Dressings & Balance', desc: 'Season and balance flavors.', seed: 'Aderezos y balance: vinagretas (ratio aceite:ácido), sal en el momento justo, y balancear ácido/dulce/salado.' },
    ],
  },
  Dessert: {
    color: '#F472B6',
    skills: [
      { key: 'dessert_baking', pos: 0, title: 'Baking Basics', desc: 'Measure, mix and know your oven.', seed: 'Básicos de repostería: medir con precisión (peso), métodos de mezcla (cremado, plegado), y conocer el horno.' },
      { key: 'dessert_chocolate', pos: 4, title: 'Chocolate & Caramel', desc: 'Melt, temper and make caramel safely.', seed: 'Chocolate y caramelo: fundir/atemperar chocolate, hacer caramelo (¡MUY caliente, riesgo de quemadura!), y ganache.' },
    ],
  },
  Cocktail: {
    color: '#A78BFA',
    skills: [
      { key: 'cocktail_shake', pos: 0, title: 'Shake vs Stir', desc: 'When to shake or stir, and dilution.', seed: 'Coctelería base: cuándo agitar (con cítricos) vs remover (solo licores), técnica de agitado, hielo y dilución, colar.' },
      { key: 'cocktail_layer', pos: 4, title: 'Layering & Fusions', desc: 'Muddle, layer and build flavor fusions.', seed: 'Técnicas de bar: macerar (muddling), hacer capas por densidad, escarchar el vaso, y crear fusiones de sabor equilibradas.' },
    ],
  },
  Juice: {
    color: '#34D399',
    skills: [
      { key: 'juice_extract', pos: 0, title: 'Juicing & Blending', desc: 'Extract and get the right texture.', seed: 'Jugos y licuados: extraer (exprimir/licuar/colar), texturas, y conservar frescura y nutrientes.' },
      { key: 'juice_balance', pos: 4, title: 'Balance & Garnish', desc: 'Balance sweet/tart and finish it.', seed: 'Balancear un jugo/bebida: dulce vs ácido, dilución, y decoración/garnish.' },
    ],
  },
  Miscellaneous: {
    color: '#94A3B8',
    skills: [
      { key: 'misc_basics', pos: 0, title: 'Kitchen Fundamentals', desc: 'Mise en place and seasoning.', seed: 'Fundamentos de cocina: mise en place, sazonar por capas, probar y ajustar, y seguridad básica (cuchillo y calor).' },
    ],
  },
};

// Mapa plano id(path_<key>) → skill (+ color de su categoría), para el lookup del syllabus.
export const SKILL_BY_ID: Record<string, SkillNode & { color: string }> = Object.fromEntries(
  Object.values(CATEGORY_ROADMAP).flatMap(cat =>
    cat.skills.map(s => [skillIdOf(s.key), { ...s, color: cat.color }] as const),
  ),
);
export const skillById = (id: string) => SKILL_BY_ID[id] ?? null;
