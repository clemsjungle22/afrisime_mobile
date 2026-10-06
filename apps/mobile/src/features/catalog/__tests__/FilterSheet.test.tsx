import type { ProductListResponse } from '@afrisime/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { FilterSheet } from '../components/FilterSheet';

const mockListProducts = jest.fn<Promise<ProductListResponse>, [Record<string, unknown>]>();

jest.mock('../api', () => ({
  catalogApi: { listProducts: (q: Record<string, unknown>) => mockListProducts(q) },
}));

function response(total: number): ProductListResponse {
  return {
    items: [],
    nextCursor: null,
    total,
    priceBounds: { min: 350, max: 43500 },
    correctedQuery: null,
    facets: {
      category: [
        { value: 'huiles', label: 'Huiles', count: 3 },
        { value: 'boissons', label: 'Boissons', count: 0 },
      ],
      brand: [],
      availability: [],
      packaging: [],
      origin: [{ value: 'local', label: 'Local', count: 2 }],
      offer: [],
    },
  };
}

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <SafeAreaProvider initialMetrics={metrics}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </SafeAreaProvider>
  );
}

async function flushDebounce() {
  await act(async () => {
    jest.advanceTimersByTime(350);
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  mockListProducts.mockReset();
  mockListProducts.mockImplementation((q) => Promise.resolve(response(q.category === 'huiles' ? 3 : 20)));
});

afterEach(() => {
  jest.useRealTimers();
});

describe('FilterSheet', () => {
  it('affiche les facettes avec leurs compteurs et désactive les valeurs à 0', async () => {
    await render(
      <FilterSheet visible filters={{}} facets={undefined} onApply={jest.fn()} onClose={jest.fn()} />,
      { wrapper },
    );
    await flushDebounce();
    expect(await screen.findByText('Huiles (3)')).toBeOnTheScreen();
    expect(screen.getByRole('checkbox', { name: 'Boissons (0)' })).toBeDisabled();
  });

  it('met à jour « Voir N produits » selon le brouillon, puis applique', async () => {
    const onApply = jest.fn();
    const onClose = jest.fn();
    await render(
      <FilterSheet visible filters={{}} facets={undefined} onApply={onApply} onClose={onClose} />,
      { wrapper },
    );
    await flushDebounce();
    expect(await screen.findByText('Voir 20 produits')).toBeOnTheScreen();

    await fireEvent.press(screen.getByText('Huiles (3)'));
    await flushDebounce();
    expect(await screen.findByText('Voir 3 produits')).toBeOnTheScreen();

    await fireEvent.press(screen.getByText('Voir 3 produits'));
    expect(onApply).toHaveBeenCalledWith({ category: 'huiles' });
    expect(onClose).toHaveBeenCalled();
  });

  it('« Effacer » retire les filtres sauf ceux gérés par l’écran', async () => {
    const onApply = jest.fn();
    await render(
      <FilterSheet
        visible
        filters={{ category: 'huiles', origin: 'local', q: 'huile' }}
        facets={undefined}
        hide={['category']}
        onApply={onApply}
        onClose={jest.fn()}
      />,
      { wrapper },
    );
    await flushDebounce();
    await fireEvent.press(screen.getByText('Effacer'));
    await flushDebounce();
    await fireEvent.press(await screen.findByText('Voir 3 produits'));
    expect(onApply).toHaveBeenCalledWith({ category: 'huiles', q: 'huile' });
  });
});
