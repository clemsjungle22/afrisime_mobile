import { presentAvailability } from '../availability';

describe('presentAvailability', () => {
  it('disponible : ajout au panier', () => {
    const p = presentAvailability('available');
    expect(p).toMatchObject({ action: 'add_to_cart', purchasable: true, label: 'Disponible' });
  });

  it('sur commande : achetable avec mention du délai', () => {
    expect(presentAvailability('on_order', 3)).toMatchObject({
      action: 'order',
      purchasable: true,
      hint: 'Délai : 3 jours',
    });
    expect(presentAvailability('on_order', 1).hint).toBe('Délai : 1 jour');
    expect(presentAvailability('on_order', null).hint).toBe('Délai communiqué à la commande');
  });

  it("indisponible : pas d'ajout, propose une alerte", () => {
    expect(presentAvailability('unavailable')).toMatchObject({
      action: 'notify_me',
      purchasable: false,
      label: 'Temporairement indisponible',
    });
  });

  it('sur devis : pas d’ajout, propose un devis', () => {
    expect(presentAvailability('quote_only')).toMatchObject({
      action: 'request_quote',
      purchasable: false,
      ctaLabel: 'Demander un devis',
    });
  });

  it('chaque état a une action distincte', () => {
    const actions = (['available', 'on_order', 'unavailable', 'quote_only'] as const).map(
      (a) => presentAvailability(a).action,
    );
    expect(new Set(actions).size).toBe(4);
  });
});
