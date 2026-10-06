import { priceRangeLabel, summaryPriceLabel, variantDiscountPercent, variantPriceLabel } from '../pricing';

const NBSP = ' ';

describe('summaryPriceLabel', () => {
  it('sur devis quand il n’y a pas de prix', () => {
    expect(summaryPriceLabel({ priceFrom: null, priceTo: null })).toBe('Prix sur devis');
  });

  it('prix unique', () => {
    expect(summaryPriceLabel({ priceFrom: 2500, priceTo: 2500 })).toBe(`2${NBSP}500${NBSP}FCFA`);
  });

  it('« Dès » pour une fourchette', () => {
    expect(summaryPriceLabel({ priceFrom: 4750, priceTo: 43500 })).toBe(`Dès${NBSP}4${NBSP}750${NBSP}FCFA`);
  });
});

describe('priceRangeLabel', () => {
  it('fourchette comme sur le site', () => {
    expect(priceRangeLabel({ priceFrom: 4750, priceTo: 43500 })).toBe(
      `4${NBSP}750 – 43${NBSP}500${NBSP}FCFA`,
    );
  });

  it('null sur devis', () => {
    expect(priceRangeLabel({ priceFrom: null, priceTo: null })).toBeNull();
  });
});

describe('variantes', () => {
  it('libellé de prix', () => {
    expect(variantPriceLabel({ price: null })).toBe('Prix sur devis');
    expect(variantPriceLabel({ price: 600 })).toBe(`600${NBSP}FCFA`);
  });

  it('remise seulement si le prix barré est supérieur', () => {
    expect(variantDiscountPercent({ price: 4750, compareAtPrice: 5200 })).toBe(9);
    expect(variantDiscountPercent({ price: 4750, compareAtPrice: 4750 })).toBeNull();
    expect(variantDiscountPercent({ price: 4750, compareAtPrice: null })).toBeNull();
    expect(variantDiscountPercent({ price: null, compareAtPrice: 5000 })).toBeNull();
  });
});
