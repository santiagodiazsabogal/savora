import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OpenaiService } from '../ai/openai.service';

const OPTIONS_TRIGGERS = [
  'dame opciones', 'give me options', 'opciones', 'options',
  'no sé qué cocinar', "don't know what to cook", 'qué cocino',
  'what should i cook', 'sugerencias', 'suggestions',
  'recomiéndame', 'recommend me', 'sorpréndeme', 'surprise me',
  'qué hago', 'what do i make',
]

function isOptionsRequest(message: string): boolean {
  const lower = message.toLowerCase().trim()
  return OPTIONS_TRIGGERS.some(trigger => lower.includes(trigger))
}

@Injectable()
export class ChatService {

  constructor(
    private prisma: PrismaService,
    private openaiService: OpenaiService,
  ) {}

  async handleMessage(userId: number, message: string, conversationId?: number, stepContext?: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    if (!conversationId) throw new NotFoundException('You must start a recipe before chatting');

    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { recipe: true },
    });

    if (!conversation || conversation.userId !== userId) {
      throw new NotFoundException('Conversation not found');
    }

    if (!conversation.recipe) throw new NotFoundException('This conversation has no associated recipe');

    await this.prisma.message.create({
      data: { conversationId: conversation.id, role: 'user', content: message },
    });

    // 🎯 Detectar intent "dame opciones"
    // En Modo Cocina (con stepContext) NO ofrecemos opciones: el chef responde
    // siempre acotado al paso actual.
    if (!stepContext && isOptionsRequest(message)) {
      const lang = message.toLowerCase().includes('options') || message.toLowerCase().includes('suggest') ? 'en' : 'es'

      // Obtener historial del usuario para no repetir
      const recentRecipes = await this.prisma.recipe.findMany({
        where: { userId },
        select: { title: true, isFavorite: true },
        orderBy: { createdAt: 'desc' },
        take: 10,
      });
      const recentTitles = recentRecipes.map(r => r.title);
      const favoriteTitles = recentRecipes.filter(r => r.isFavorite).map(r => r.title);

      // 🔥 Método correcto: generarSugerencias
      const suggestions = await this.openaiService.generarSugerencias(
        user,
        null, // sin mealType en el chat — sugerencias libres
        lang,
        recentTitles,
        favoriteTitles,
      );

      const responseContent = `__OPTIONS__${JSON.stringify(suggestions)}`

      await this.prisma.message.create({
        data: { conversationId: conversation.id, role: 'assistant', content: responseContent },
      });

      return {
        conversationId: conversation.id,
        reply: responseContent,
        type: 'options',
        options: suggestions,
        recipeId: conversation.recipe.id,
        isFavorite: conversation.recipe.isFavorite,
      };
    }

    // 🚫 Control de intención culinaria: si el mensaje no es de cocina, el chef
    // redirige amablemente SIN gastar tokens en responder (mismo espíritu que
    // isCookingRelated en recipes/generate, pero consciente del contexto de la receta).
    const related = await this.openaiService.isChatCookingRelated(message, conversation.recipe.title);
    if (!related) {
      const looksEnglish = !/[áéíóúñ¿¡]/i.test(message) &&
        /\b(the|what|how|can|you|is|are|recipe|cook|make|why|do|write|code)\b/i.test(message);
      const reply = looksEnglish
        ? "👨‍🍳 I'm your cooking chef — I can only help with this recipe and cooking. What would you like to know about the dish?"
        : '👨‍🍳 Soy tu chef de cocina: solo puedo ayudarte con esta receta y temas de cocina. ¿Qué quieres saber del plato?';

      await this.prisma.message.create({
        data: { conversationId: conversation.id, role: 'assistant', content: reply },
      });

      return {
        conversationId: conversation.id,
        reply,
        type: 'text',
        recipeId: conversation.recipe.id,
        isFavorite: conversation.recipe.isFavorite,
      };
    }

    // Respuesta normal sobre la receta
    const recipe = conversation.recipe;
    const ingredients = (recipe.ingredients ?? []) as string[];
    const tools = (recipe.tools ?? []) as string[];
    const steps = (recipe.steps ?? []) as string[];

    const recipeContext = `
Receta actual: ${recipe.title}

Ingredientes:
${ingredients.join('\n')}

Implementos:
${tools.join('\n')}

Pasos:
${steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}
`;

    const aiResponse = await this.openaiService.responderPreguntaReceta(recipeContext, message, user, stepContext);

    await this.prisma.message.create({
      data: { conversationId: conversation.id, role: 'assistant', content: aiResponse },
    });

    return {
      conversationId: conversation.id,
      reply: aiResponse,
      type: 'text',
      recipeId: recipe.id,
      isFavorite: recipe.isFavorite,
    };
  }

  async getUserConversations(userId: number) {
    return this.prisma.conversation.findMany({
      where: { userId },
      select: { id: true, title: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getConversationMessages(userId: number, conversationId: number) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { recipe: { select: { id: true, isFavorite: true } } },
    });

    if (!conversation || conversation.userId !== userId) {
      throw new NotFoundException('Conversation not found');
    }

    const messages = await this.prisma.message.findMany({
      where: { conversationId },
      select: { role: true, content: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    const parsedMessages = messages.map(m => {
      if (m.content.startsWith('__OPTIONS__')) {
        try {
          const options = JSON.parse(m.content.replace('__OPTIONS__', ''))
          return { ...m, type: 'options', options }
        } catch {
          return { ...m, type: 'text' }
        }
      }
      return { ...m, type: 'text' }
    })

    return {
      recipeId: conversation.recipe?.id ?? null,
      isFavorite: conversation.recipe?.isFavorite ?? false,
      messages: parsedMessages,
    };
  }
}