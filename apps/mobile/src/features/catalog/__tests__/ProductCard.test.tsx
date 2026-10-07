import type { Availability, ProductSummary } from '@afrisime/shared';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { useCart } from '@/features/cart/store';
import { ProductCard } from '../components/ProductCard';

jest.mock('expo-router', () => ({ router: { navigate: jest.fn() } }));

const NBSP = ' ';

function makeProduct(availability: Availability, overrides: Partial<ProductSummary> = {}): ProductSummary {
  const price = availability === 'quote_only' ? null : 4750;
  return {
    id: 'prd_1',
    slug: 'riz-parfume',
    name: 'Riz parfumé long grain',
    brand: 'Savana',
    origin: 'imported',
    imageUrl: null,
    badges: [],
    priceFrom: price,
    priceTo: price,
    discountPercent: null,
    color: '#b7862b',
    variantsCount: 1,
    defaultVariant: {
      id: 'var_1',
      sku: 'RIZ-5',
      label: 'Sac 5 kg',
      packaging: 'sac',
      price,
      compareAtPrice: null,
      availability,
      leadTimeDays: availability === 'on_order' ? 3 : null,
      minQuantity: 1,
      isPro: false,
    },
    ...overrides,
  };
}

describe('ProductCard', () => {
  it('disponible : prix affiché, pas de mention de disponibilité', async () => {
    await render(<ProductCard product={makeProduct('available')} onPress={jest.fn()} />);
    expect(screen.getByText(`4${NBSP}750${NBSP}FCFA`)).toBeOnTheScreen();
    expect(screen.queryByText('Disponible')).toBeNull();
  });

  it('sur commande : badge « Sur commande »', async () => {
    await render(<ProductCard product={makeProduct('on_order')} onPress={jest.fn()} />);
    expect(screen.getByText('Sur commande')).toBeOnTheScreen();
  });

  it('indisponible : badge « Temporairement indisponible »', async () => {
    await render(<ProductCard product={makeProduct('unavailable')} onPress={jest.fn()} />);
    expect(screen.getByText('Temporairement indisponible')).toBeOnTheScreen();
  });

  it('sur devis : « Prix sur devis » au lieu d’un montant', async () => {
    await render(<ProductCard product={makeProduct('quote_only')} onPress={jest.fn()} />);
    expect(screen.getAllByText('Prix sur devis').length).toBeGreaterThan(0);
    expect(screen.queryByText(/FCFA/)).toBeNull();
  });

  it('affiche la remise et le nombre de formats', async () => {
    await render(
      <ProductCard
        product={makeProduct('available', { discountPercent: 9, variantsCount: 3, priceTo: 43500 })}
        onPress={jest.fn()}
      />,
    );
    expect(screen.getByText('-9 %')).toBeOnTheScreen();
    expect(screen.getByText(/3 formats/)).toBeOnTheScreen();
    expect(screen.getByText(`Dès${NBSP}4${NBSP}750${NBSP}FCFA`)).toBeOnTheScreen();
  });

  it('ouvre la fiche au toucher, avec un libellé accessible complet', async () => {
    const onPress = jest.fn();
    const product = makeProduct('available');
    await render(<ProductCard product={product} onPress={onPress} />);
    const card = screen.getByRole('button', { name: /^Riz parfumé long grain, Savana/ });
    expect(card.props.accessibilityLabel).toContain('Riz parfumé long grain');
    await fireEvent.press(card);
    expect(onPress).toHaveBeenCalledWith(product);
  });

  it('ajout express : le format principal part au panier sans ouvrir la fiche', async () => {
    useCart.getState().clear();
    const onPress = jest.fn();
    await render(<ProductCard product={makeProduct('available')} onPress={onPress} />);
    await fireEvent.press(screen.getByLabelText('Ajouter Riz parfumé long grain, Sac 5 kg, au panier'));
    expect(onPress).not.toHaveBeenCalled();
    expect(useCart.getState().lines).toEqual([expect.objectContaining({ variantId: 'var_1', quantity: 1 })]);
  });

  it('pas d’ajout express pour un produit indisponible ou sur devis', async () => {
    for (const availability of ['unavailable', 'quote_only'] as const) {
      const { unmount } = await render(<ProductCard product={makeProduct(availability)} onPress={jest.fn()} />);
      expect(screen.queryByLabelText(/^Ajouter .* au panier$/)).toBeNull();
      await unmount();
    }
  });
});
