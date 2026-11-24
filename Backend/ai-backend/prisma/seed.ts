import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

type SeedLesson = {
  order: number
  title: string
  description: string
  difficulty: 'easy' | 'medium' | 'hard'
  hasPrereqWarning?: boolean
  prereqMessage?: string
}

type SeedCourse = {
  slug: string
  title: string
  subtitle: string
  emoji: string
  cookingLevel: 'beginner' | 'intermediate' | 'advanced'
  category: 'italian' | 'asian' | 'latin' | 'pastry' | 'grilling' | 'healthy' | 'general'
  isBase: boolean
  unlockAfterCount: number
  lessons: SeedLesson[]
}

const CATALOG: SeedCourse[] = [
  // ── BEGINNER (4 cursos) ─────────────────────────────────────────────
  {
    slug: 'pasta-italiana-beginner', title: 'Pasta Italiana',
    subtitle: 'Domina las pastas esenciales de Italia',
    emoji: '🍝', cookingLevel: 'beginner', category: 'italian', isBase: true, unlockAfterCount: 0,
    lessons: [
      { order: 1, title: 'Pasta al pomodoro', description: 'La salsa de tomate perfecta, base de todo.', difficulty: 'easy' },
      { order: 2, title: 'Pasta aglio e olio', description: 'Ajo, aceite y perejil: elegancia mínima.', difficulty: 'easy' },
      { order: 3, title: 'Pesto genovese', description: 'Albahaca fresca, piñones y parmesano.', difficulty: 'easy' },
      { order: 4, title: 'Carbonara auténtica', description: 'Sin crema — solo huevo, guanciale y pecorino.', difficulty: 'medium' },
      { order: 5, title: 'Pasta alla norma', description: 'Berenjena frita, ricotta salata y tomate siciliano.', difficulty: 'medium' },
      { order: 6, title: 'Lasaña clásica', description: 'Ragú de res, bechamel y masa fresca.', difficulty: 'hard', hasPrereqWarning: true, prereqMessage: 'Esta lección combina técnicas de las anteriores. Recomendamos haberlas completado.' },
    ],
  },
  {
    slug: 'cocina-mexicana-beginner', title: 'Cocina Mexicana',
    subtitle: 'Sabores auténticos del México de siempre',
    emoji: '🌮', cookingLevel: 'beginner', category: 'latin', isBase: true, unlockAfterCount: 0,
    lessons: [
      { order: 1, title: 'Guacamole perfecto', description: 'El aguacate, el limón y el cilantro en su punto.', difficulty: 'easy' },
      { order: 2, title: 'Arroz a la mexicana', description: 'Sofrito de tomate y técnica del tostado.', difficulty: 'easy' },
      { order: 3, title: 'Tacos de frijoles negros', description: 'Frijoles refritos, queso y salsa verde casera.', difficulty: 'easy' },
      { order: 4, title: 'Quesadillas con rajas', description: 'Chile poblano asado con queso Oaxaca.', difficulty: 'medium' },
      { order: 5, title: 'Enchiladas verdes', description: 'Pollo, salsa de tomatillo y crema agria.', difficulty: 'medium' },
      { order: 6, title: 'Pozole rojo', description: 'Caldo de maíz con chile ancho y guajillo.', difficulty: 'hard', hasPrereqWarning: true, prereqMessage: 'El pozole requiere tiempo y paciencia. Domina las técnicas anteriores primero.' },
    ],
  },
  {
    slug: 'cocina-rapida-beginner', title: 'Cocina Casera Rápida',
    subtitle: 'Come rico sin pasar horas en la cocina',
    emoji: '🥘', cookingLevel: 'beginner', category: 'general', isBase: true, unlockAfterCount: 0,
    lessons: [
      { order: 1, title: 'Huevos revueltos perfectos', description: 'La textura cremosa que nadie enseña.', difficulty: 'easy' },
      { order: 2, title: 'Ensalada completa', description: 'Proteína, grasa buena y vinagreta desde cero.', difficulty: 'easy' },
      { order: 3, title: 'Sopa de verduras express', description: 'Caldo base, mirepoix y tiempo exacto.', difficulty: 'easy' },
      { order: 4, title: 'Arroz básico infalible', description: 'Absorción, proporción y reposo.', difficulty: 'easy' },
      { order: 5, title: 'Pollo a la plancha', description: 'Marinada rápida, sellado perfecto, jugosidad.', difficulty: 'medium' },
      { order: 6, title: 'Wok de verduras y proteína', description: 'Fuego alto, corte correcto y salsa umami.', difficulty: 'medium' },
    ],
  },
  {
    slug: 'cocina-vegetariana-beginner', title: 'Cocina Vegetariana',
    subtitle: 'Platos completos sin carne ni sacrificar sabor',
    emoji: '🥗', cookingLevel: 'beginner', category: 'healthy', isBase: true, unlockAfterCount: 0,
    lessons: [
      { order: 1, title: 'Bowl de quinoa proteico', description: 'Quinoa, legumbres, vegetales asados y tahini.', difficulty: 'easy' },
      { order: 2, title: 'Curry de garbanzos', description: 'Especias tostadas, leche de coco y cilantro.', difficulty: 'easy' },
      { order: 3, title: 'Sopa de lentejas', description: 'Cúrcuma, comino y un toque de limón.', difficulty: 'easy' },
      { order: 4, title: 'Frittata de vegetales', description: 'Técnica italiana: huevo cuajado al horno.', difficulty: 'medium' },
      { order: 5, title: 'Ratatouille provenzal', description: 'Vegetales de verano en capas al horno.', difficulty: 'medium' },
      { order: 6, title: 'Tartaleta de verduras', description: 'Masa quebrada casera y relleno gratinado.', difficulty: 'hard', hasPrereqWarning: true, prereqMessage: 'La masa quebrada requiere técnica. Recomendamos completar las lecciones anteriores.' },
    ],
  },
  // ── INTERMEDIATE (4 cursos) ─────────────────────────────────────────
  {
    slug: 'cocina-japonesa-intermediate', title: 'Cocina Japonesa',
    subtitle: 'Técnicas esenciales del arte culinario japonés',
    emoji: '🍣', cookingLevel: 'intermediate', category: 'asian', isBase: true, unlockAfterCount: 0,
    lessons: [
      { order: 1, title: 'Arroz para sushi', description: 'Vinagre de arroz, temperatura y abanicado.', difficulty: 'easy' },
      { order: 2, title: 'Dashi y miso soup', description: 'El caldo madre japonés con kombu y katsuobushi.', difficulty: 'easy' },
      { order: 3, title: 'Gyoza caseras', description: 'Masa, relleno, plisado y técnica de cocción.', difficulty: 'medium' },
      { order: 4, title: 'Sushi Roll California', description: 'Nori, arroz distribuido y el corte limpio.', difficulty: 'medium' },
      { order: 5, title: 'Ramen Tonkotsu', description: 'Caldo de hueso de cerdo, 12 horas.', difficulty: 'hard', hasPrereqWarning: true, prereqMessage: 'El Tonkotsu requiere manejar el dashi (lección 2). Altamente recomendable haberla completado.' },
      { order: 6, title: 'Tempura crujiente', description: 'Masa fría, aceite caliente y agua con gas.', difficulty: 'hard', hasPrereqWarning: true, prereqMessage: 'Tempura es técnica pura. El manejo del aceite es clave.' },
    ],
  },
  {
    slug: 'cocina-india-intermediate', title: 'Cocina India',
    subtitle: 'Especias, curry y la profundidad de la India',
    emoji: '🍛', cookingLevel: 'intermediate', category: 'general', isBase: true, unlockAfterCount: 0,
    lessons: [
      { order: 1, title: 'Mezcla de especias (masala)', description: 'Tostar, moler y balancear las especias.', difficulty: 'easy' },
      { order: 2, title: 'Arroz Basmati perfecto', description: 'Remojo, proporción y técnica de vapor.', difficulty: 'easy' },
      { order: 3, title: 'Dal Makhani', description: 'Lentejas negras, mantequilla y cocción lenta.', difficulty: 'medium' },
      { order: 4, title: 'Pollo Tikka Masala', description: 'Marinada de yogur, asado y salsa masala.', difficulty: 'medium' },
      { order: 5, title: 'Naan casero', description: 'Masa leudada y cocción en sartén.', difficulty: 'medium' },
      { order: 6, title: 'Biryani de pollo', description: 'Arroz aromático en capas con azafrán.', difficulty: 'hard', hasPrereqWarning: true, prereqMessage: 'El biryani combina arroz y masalas. Recomendamos completar las lecciones anteriores.' },
    ],
  },
  {
    slug: 'mediterranea-intermediate', title: 'Cocina Mediterránea',
    subtitle: 'El aceite de oliva, el mar y el sol en tu plato',
    emoji: '🫒', cookingLevel: 'intermediate', category: 'healthy', isBase: true, unlockAfterCount: 0,
    lessons: [
      { order: 1, title: 'Hummus desde cero', description: 'Garbanzos cocidos, tahini y el truco del hielo.', difficulty: 'easy' },
      { order: 2, title: 'Shakshuka', description: 'Huevos escalfados en salsa de tomate especiada.', difficulty: 'easy' },
      { order: 3, title: 'Falafel crujiente', description: 'Garbanzos crudos, hierbas y fritura perfecta.', difficulty: 'medium' },
      { order: 4, title: 'Tabbouleh libanés', description: 'Perejil, bulgur y proporción exacta de limón.', difficulty: 'medium' },
      { order: 5, title: 'Moussaka griega', description: 'Berenjenas, ragú de cordero y bechamel.', difficulty: 'hard', hasPrereqWarning: true, prereqMessage: 'La moussaka requiere bechamel y cocción al horno. Domina las bases primero.' },
      { order: 6, title: 'Paella valenciana', description: 'Socarrat, caldo casero y el punto del arroz.', difficulty: 'hard', hasPrereqWarning: true, prereqMessage: 'La paella es la lección más técnica. El socarrat requiere experiencia con el fuego.' },
    ],
  },
  {
    slug: 'cocina-latina-intermediate', title: 'Cocina Latinoamericana',
    subtitle: 'De Lima a Buenos Aires, sabores que unen un continente',
    emoji: '🌶️', cookingLevel: 'intermediate', category: 'latin', isBase: true, unlockAfterCount: 0,
    lessons: [
      { order: 1, title: 'Ceviche peruano', description: 'Leche de tigre, corte del pescado y maceración.', difficulty: 'medium' },
      { order: 2, title: 'Arroz con leche criollo', description: 'Canela en rama, leche entera y punto exacto.', difficulty: 'easy' },
      { order: 3, title: 'Empanadas argentinas', description: 'Masa, repulgue y el relleno clásico de carne.', difficulty: 'medium' },
      { order: 4, title: 'Ají de gallina', description: 'Ají amarillo, pan remojado y nueces molidas.', difficulty: 'medium' },
      { order: 5, title: 'Churrasco con chimichurri', description: 'Punto de carne, fuego vivo y salsa verde.', difficulty: 'medium' },
      { order: 6, title: 'Causa limeña', description: 'Papa amarilla, ají amarillo y relleno de atún.', difficulty: 'hard', hasPrereqWarning: true, prereqMessage: 'La causa requiere técnica de capas. Recomendamos completar las lecciones anteriores.' },
    ],
  },
  // ── ADVANCED (2 cursos) ─────────────────────────────────────────────
  {
    slug: 'reposteria-francesa-advanced', title: 'Repostería Francesa',
    subtitle: 'La técnica de la pastelería clásica francesa',
    emoji: '🥐', cookingLevel: 'advanced', category: 'pastry', isBase: true, unlockAfterCount: 0,
    lessons: [
      { order: 1, title: 'Masa choux', description: 'Eclairs, profiteroles y la química del choux.', difficulty: 'medium' },
      { order: 2, title: 'Crème pâtissière', description: 'La crema base de la pastelería francesa.', difficulty: 'medium' },
      { order: 3, title: 'Croissants de mantequilla', description: 'Laminado, vueltas y hojaldrado perfecto.', difficulty: 'hard', hasPrereqWarning: true, prereqMessage: 'El croissant requiere dominio del laminado. Completa la masa choux primero.' },
      { order: 4, title: 'Macarons parisinos', description: 'Merengue francés, tant pour tant y ganache.', difficulty: 'hard', hasPrereqWarning: true, prereqMessage: 'Los macarons son de los más técnicos. Temperatura y humedad son críticas.' },
      { order: 5, title: 'Tarte Tatin', description: 'Caramelización de manzana y masa invertida.', difficulty: 'hard', hasPrereqWarning: true, prereqMessage: 'Requiere manejo del caramelo — domina las lecciones anteriores.' },
      { order: 6, title: 'Soufflé de chocolate', description: 'Timing, temperatura y servicio inmediato.', difficulty: 'hard', hasPrereqWarning: true, prereqMessage: 'El soufflé no espera. Requiere todo lo aprendido en el curso.' },
    ],
  },
  {
    slug: 'bbq-parrilla-advanced', title: 'BBQ y Parrilla',
    subtitle: 'Fuego, humo y el arte del asado perfecto',
    emoji: '🥩', cookingLevel: 'advanced', category: 'grilling', isBase: true, unlockAfterCount: 0,
    lessons: [
      { order: 1, title: 'Fuego y tipos de brasa', description: 'Carbón, leña y la diferencia del calor.', difficulty: 'medium' },
      { order: 2, title: 'Marinadas y rubs secos', description: 'Cómo potenciar el sabor antes de la brasa.', difficulty: 'easy' },
      { order: 3, title: 'Costillas BBQ ahumadas', description: 'Low and slow, glaseado y anillo de humo.', difficulty: 'hard', hasPrereqWarning: true, prereqMessage: 'Las costillas requieren control de temperatura por horas. Domina el fuego primero.' },
      { order: 4, title: 'Brisket de res', description: '14 horas de ahumado, temperatura interna y bark.', difficulty: 'hard', hasPrereqWarning: true, prereqMessage: 'El brisket es la cumbre del BBQ. Requiere experiencia con el ahumado.' },
      { order: 5, title: 'Chimichurri y salsas', description: 'Versión argentina, criolla y chimichurri rojo.', difficulty: 'easy' },
      { order: 6, title: 'Parrillada completa', description: 'Planificación, tiempos y coordinación total.', difficulty: 'hard', hasPrereqWarning: true, prereqMessage: 'Combina todo lo del curso. La coordinación y el fuego simultáneo requieren dominio total.' },
    ],
  },
]

async function main() {
  console.log('🌱 Seeding course catalog...')
  for (const course of CATALOG) {
    const { lessons, ...courseData } = course
    const catalog = await prisma.courseCatalog.upsert({
      where: { slug: courseData.slug },
      update: {},
      create: courseData,
    })
    for (const lesson of lessons) {
      const exists = await prisma.courseCatalogLesson.findFirst({
        where: { catalogId: catalog.id, order: lesson.order },
      })
      if (!exists) {
        await prisma.courseCatalogLesson.create({
          data: { ...lesson, catalogId: catalog.id },
        })
      }
    }
    console.log(`  ✓ ${course.emoji} ${course.title}`)
  }
  console.log(`\n✅ Seed completo: ${CATALOG.length} cursos`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
