import { OpenaiService } from './openai.service';

// normalizePrices no toca la red ni la DB → se prueba directo sobre el prototype
// (mismo patrón que nutrition.spec.ts).
const normalize = (rawPrices: any, requested: string[]) =>
  OpenaiService.prototype.normalizePrices.call(null, rawPrices, requested);

describe('OpenaiService.normalizePrices', () => {
  it('matchea por nombre case-insensitive y convierte a centavos', () => {
    const res = normalize(
      [{ name: 'milk', price: 3.49 }, { name: 'EGGS', price: 4.2 }],
      ['Milk', 'Eggs'],
    );
    expect(res.get('Milk')).toBe(349);
    expect(res.get('Eggs')).toBe(420);
  });

  it('clampa fuera de rango ($0.10–$150) y basura → null', () => {
    const res = normalize(
      [
        { name: 'water', price: 0.01 }, // muy barato
        { name: 'truffle', price: 900 }, // muy caro
        { name: 'bread', price: 'NaN' },
        { name: 'cheese' }, // sin precio
        { price: 5 }, // sin nombre
      ],
      ['water', 'truffle', 'bread', 'cheese', 'salt'],
    );
    for (const k of ['water', 'truffle', 'bread', 'cheese', 'salt']) {
      expect(res.get(k)).toBeNull();
    }
  });

  it('respuesta no-array o vacía → todos null', () => {
    expect(normalize(null, ['Milk']).get('Milk')).toBeNull();
    expect(normalize({ foo: 1 }, ['Milk']).get('Milk')).toBeNull();
    expect(normalize([], ['Milk']).get('Milk')).toBeNull();
  });

  it('redondea a centavos', () => {
    const res = normalize([{ name: 'rice', price: 2.999 }], ['rice']);
    expect(res.get('rice')).toBe(300);
  });
});
