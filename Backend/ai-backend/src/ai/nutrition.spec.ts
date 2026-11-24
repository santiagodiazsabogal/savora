import { OpenaiService } from './openai.service';

// normalizeNutrition no toca la red ni la DB → se prueba directo sobre el prototype
// (el constructor de OpenaiService crea el cliente de OpenAI, no hace falta aquí).
const normalize = (nutrition: any, servings: any) =>
  OpenaiService.prototype.normalizeNutrition.call(null, nutrition, servings);

describe('OpenaiService.normalizeNutrition', () => {
  it('consolida servings + macros redondeados + micros', () => {
    expect(normalize(
      { calories: 320.6, protein: 21.2, carbs: 30, fat: 12.9, vitaminC: 40, calcium: 120.4, iron: 2.53, sodium: 800 },
      4,
    )).toEqual({
      servings: 4, calories: 321, protein: 21, carbs: 30, fat: 13,
      vitaminC: 40, calcium: 120.4, iron: 2.5, sodium: 800,
    });
  });

  it('acepta números que llegan como string', () => {
    expect(normalize({ calories: '450', protein: '18', carbs: '55', fat: '10' }, '2')).toMatchObject({
      servings: 2, calories: 450, protein: 18, carbs: 55, fat: 10,
    });
  });

  it('devuelve null si no hay calorías fiables', () => {
    expect(normalize(undefined, 2)).toBeNull();
    expect(normalize({}, 2)).toBeNull();
    expect(normalize({ calories: 'muchas' }, 2)).toBeNull();
    expect(normalize({ calories: -100 }, 2)).toBeNull();
    expect(normalize({ calories: 0 }, 2)).toBeNull();
  });

  it('clampa servings a [1, 12] y usa 1 si falta', () => {
    expect(normalize({ calories: 200 }, 0)?.servings).toBe(1);
    expect(normalize({ calories: 200 }, null)?.servings).toBe(1);
    expect(normalize({ calories: 200 }, 99)?.servings).toBe(12);
  });

  it('macros faltantes quedan en 0 y micros faltantes/ inválidos en null', () => {
    expect(normalize({ calories: 150 }, 1)).toEqual({
      servings: 1, calories: 150, protein: 0, carbs: 0, fat: 0,
      vitaminC: null, calcium: null, iron: null, sodium: null,
    });
    expect(normalize({ calories: 150, iron: 'poco', sodium: -5 }, 1)).toMatchObject({
      iron: null, sodium: null,
    });
  });
});
