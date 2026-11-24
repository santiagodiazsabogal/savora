import { SocialService } from './social.service';

// Retención social + contador de likes de por vida (2026-07-05):
// - toggleLike mantiene User.likesReceivedTotal del AUTOR (sube al like, baja al unlike)
//   → las insignias de likes no pierden progreso cuando los posts viejos se purgan.
// - purgeOldPosts borra los posts vencidos (imagen del bucket + fila) en lotes.
function makePrisma() {
  return {
    socialPost: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    socialLike: {
      findUnique: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
    user: { update: jest.fn() },
    recipe: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    // $transaction estilo array: resuelve las "operaciones" ya lanzadas por los delegates mock.
    $transaction: jest.fn((ops: any[]) => Promise.all(ops)),
  };
}

const storageMock = {
  deleteImages: jest.fn().mockResolvedValue(undefined),
  deleteImage: jest.fn(),
  uploadPostImage: jest.fn(),
};
const openaiMock = { moderateImage: jest.fn() };

describe('SocialService — likes de por vida + retención', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: SocialService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = makePrisma();
    service = new SocialService(prisma as any, storageMock as any, openaiMock as any);
  });

  describe('toggleLike', () => {
    beforeEach(() => {
      prisma.socialPost.findUnique.mockResolvedValue({ id: 'P1', userId: 42 }); // autor = 42
      prisma.socialPost.update.mockResolvedValue({ likeCount: 1 });
      prisma.socialLike.create.mockResolvedValue({});
      prisma.socialLike.delete.mockResolvedValue({});
      prisma.user.update.mockResolvedValue({});
    });

    it('al dar like incrementa likesReceivedTotal del autor', async () => {
      prisma.socialLike.findUnique.mockResolvedValue(null); // no había like

      const res = await service.toggleLike(7, 'P1');

      expect(res.liked).toBe(true);
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 42 },
          data: { likesReceivedTotal: { increment: 1 } },
        }),
      );
    });

    it('al quitar el like decrementa likesReceivedTotal del autor', async () => {
      prisma.socialLike.findUnique.mockResolvedValue({ id: 'L1' }); // ya había like
      prisma.socialPost.update.mockResolvedValue({ likeCount: 0 });

      const res = await service.toggleLike(7, 'P1');

      expect(res.liked).toBe(false);
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 42 },
          data: { likesReceivedTotal: { decrement: 1 } },
        }),
      );
    });
  });

  describe('purgeOldPosts', () => {
    it('borra imagen del bucket + fila de los posts vencidos', async () => {
      prisma.socialPost.findMany
        .mockResolvedValueOnce([
          { id: 'P1', imageUrl: 'https://storage/posts/1.jpg' },
          { id: 'P2', imageUrl: 'https://storage/posts/2.jpg' },
        ])
        .mockResolvedValue([]);

      await service.purgeOldPosts();

      expect(storageMock.deleteImages).toHaveBeenCalledWith([
        'https://storage/posts/1.jpg',
        'https://storage/posts/2.jpg',
      ]);
      expect(prisma.socialPost.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['P1', 'P2'] } },
      });
      // El filtro usa un cutoff en el pasado (createdAt < ahora - retención)
      const where = prisma.socialPost.findMany.mock.calls[0][0].where;
      expect(where.createdAt.lt.getTime()).toBeLessThan(Date.now());
    });

    it('sin posts vencidos no toca el bucket ni la DB', async () => {
      prisma.socialPost.findMany.mockResolvedValue([]);

      await service.purgeOldPosts();

      expect(storageMock.deleteImages).not.toHaveBeenCalled();
      expect(prisma.socialPost.deleteMany).not.toHaveBeenCalled();
    });
  });

  // Guardar receta de un post compartido → copia propia, sin duplicados.
  describe('saveRecipeFromPost', () => {
    const sourceRecipe = {
      id: 55, userId: 42, title: 'Tacos al pastor', description: 'desc', tip: null,
      ingredients: ['a'], tools: ['b'], steps: ['c'], stepTips: null, nutrition: { calories: 400 },
      difficulty: 'easy', cookTime: 30, mealTime: 'dinner',
    };

    it('post que no es de receta → 404', async () => {
      prisma.socialPost.findUnique.mockResolvedValue({ type: 'PHOTO', recipeId: null });
      await expect(service.saveRecipeFromPost(7, 'P1')).rejects.toThrow('Post not found');
    });

    it('si la receta ya es mía no crea copia', async () => {
      prisma.socialPost.findUnique.mockResolvedValue({ type: 'RECIPE', recipeId: 55 });
      prisma.recipe.findUnique.mockResolvedValue({ ...sourceRecipe, userId: 7 });

      const res = await service.saveRecipeFromPost(7, 'P1');

      expect(res).toEqual({ saved: false, alreadySaved: true, recipeId: 55 });
      expect(prisma.recipe.create).not.toHaveBeenCalled();
    });

    it('si ya la guardé antes (mismo título) devuelve esa copia', async () => {
      prisma.socialPost.findUnique.mockResolvedValue({ type: 'RECIPE', recipeId: 55 });
      prisma.recipe.findUnique.mockResolvedValue(sourceRecipe);
      prisma.recipe.findFirst.mockResolvedValue({ id: 99 });

      const res = await service.saveRecipeFromPost(7, 'P1');

      expect(res).toEqual({ saved: false, alreadySaved: true, recipeId: 99 });
      expect(prisma.recipe.create).not.toHaveBeenCalled();
    });

    it('crea la copia con mis userId y los datos de la fuente', async () => {
      prisma.socialPost.findUnique.mockResolvedValue({ type: 'RECIPE', recipeId: 55 });
      prisma.recipe.findUnique.mockResolvedValue(sourceRecipe);
      prisma.recipe.findFirst.mockResolvedValue(null);
      prisma.recipe.create.mockResolvedValue({ id: 100 });

      const res = await service.saveRecipeFromPost(7, 'P1');

      expect(res).toEqual({ saved: true, alreadySaved: false, recipeId: 100 });
      const data = prisma.recipe.create.mock.calls[0][0].data;
      expect(data.userId).toBe(7);
      expect(data.title).toBe('Tacos al pastor');
      expect(data.nutrition).toEqual({ calories: 400 });
      expect(data.stepTips).toBeUndefined(); // null en la fuente → no se manda
    });
  });
});
