import { CoursesAiService } from './courses-ai.service';

const svc = (prisma: any) => new CoursesAiService(prisma, {} as any, {} as any, {} as any, {} as any);

function basePrisma(plan: string, opts: any = {}) {
  return {
    user: { findUnique: jest.fn().mockResolvedValue({ plan }) },
    userMealDbCourse: {
      findMany: jest.fn().mockResolvedValue(opts.doneMeals ?? []),
      count: jest.fn().mockResolvedValue(opts.coursesDone ?? 0),
      findUnique: jest.fn().mockResolvedValue(opts.existingCourse ?? null),
      create: jest.fn().mockResolvedValue({}),
    },
    userMealDbLesson: {
      count: jest.fn().mockResolvedValue(opts.lessonsDone ?? 0),
      findUnique: jest.fn().mockResolvedValue(opts.lessonAlready ?? null),
      upsert: jest.fn().mockResolvedValue({}),
    },
    mealDbCourse: { findUnique: jest.fn().mockResolvedValue(opts.course ?? null) },
    userMission: { findMany: jest.fn().mockResolvedValue([]) },
  };
}

describe('CoursesAiService — roadmap por categoría + topes', () => {
  const realFetch = global.fetch;
  afterEach(() => { global.fetch = realFetch; });

  // Mock de TheMealDB filter.php → N recetas.
  function mockRecipes(n: number) {
    const meals = Array.from({ length: n }, (_, i) => ({
      idMeal: String(1000 + i), strMeal: `Dish ${i}`, strMealThumb: `t${i}`,
    }));
    global.fetch = jest.fn().mockResolvedValue({ json: async () => ({ meals }) }) as any;
  }

  it('intercala habilidades + recetas; 1er nodo current, resto locked; último final', async () => {
    mockRecipes(5);
    const { nodes, quota } = await svc(basePrisma('FREE')).getCategoryRoadmap(1, 'Chicken');
    expect(nodes[0]).toMatchObject({ key: 'path_chicken_prep', type: 'skill', state: 'current' });
    expect(nodes[1].type).toBe('recipe');
    expect(nodes.some(n => n.key === 'path_chicken_roast' && n.type === 'skill')).toBe(true);
    expect(nodes.filter(n => n.type === 'recipe')).toHaveLength(5);
    expect(nodes[nodes.length - 1].final).toBe(true);
    expect(nodes.filter(n => n.state === 'current')).toHaveLength(1); // solo un frontier
    expect(quota).toMatchObject({ plan: 'FREE', lessonLimit: 3, courseLimit: 0 });
  });

  it('cap de recetas: no pasa de RECIPES_PER_CATEGORY (12)', async () => {
    mockRecipes(50);
    const { nodes } = await svc(basePrisma('CHEF')).getCategoryRoadmap(1, 'Beef');
    expect(nodes.filter(n => n.type === 'recipe').length).toBeLessThanOrEqual(12);
  });

  it('CHEF: cuota ilimitada (null)', async () => {
    mockRecipes(3);
    const { quota } = await svc(basePrisma('CHEF')).getCategoryRoadmap(1, 'Pasta');
    expect(quota).toMatchObject({ plan: 'CHEF', lessonLimit: null, courseLimit: null });
  });

  it('TOPE FREE: la 4ª lección nueva lanza LESSON_LIMIT_REACHED', async () => {
    const service = svc(basePrisma('FREE', { lessonAlready: null, lessonsDone: 3 }));
    await expect(service.completeLesson(1, 'path_chicken_prep', 4)).rejects.toThrow('LESSON_LIMIT_REACHED');
  });

  it('TOPE PRO: completar el 4º curso lanza COURSE_LIMIT_REACHED', async () => {
    const service = svc(basePrisma('PRO', {
      course: { nivelMinimo: 2, strArea: 'x', strCategory: 'y', lecciones: [] },
      lessonsDone: 5, existingCourse: null, coursesDone: 3,
    }));
    await expect(service.completeCourse(1, '52982')).rejects.toThrow('COURSE_LIMIT_REACHED');
  });
});
