import { AddressForm } from '../screens/AddressFormScreen';

jest.mock('expo-location', () => ({}));

const valid = {
  label: 'Maison',
  recipientName: 'Kossi Mensah',
  phone: '90 12 34 56',
  district: 'Tokoin',
  city: 'Lomé',
  landmark: 'En face de la pharmacie',
  instructions: '',
  isDefault: true,
};

const errorsOf = (value: unknown) => {
  const r = AddressForm.safeParse(value);
  return r.success ? {} : Object.fromEntries(r.error.issues.map((i) => [i.path[0], i.message]));
};

describe('formulaire d’adresse', () => {
  it('accepte une adresse complète', () => {
    expect(AddressForm.safeParse(valid).success).toBe(true);
  });

  it('le repère est obligatoire (indispensable au livreur)', () => {
    expect(errorsOf({ ...valid, landmark: ' ' })).toMatchObject({ landmark: 'Indiquez un repère pour le livreur' });
  });

  it('refuse un numéro non mobile', () => {
    expect(errorsOf({ ...valid, phone: '22 12 34 56' })).toHaveProperty('phone');
  });

  it('quartier et destinataire requis', () => {
    expect(Object.keys(errorsOf({ ...valid, district: '', recipientName: 'A' })).sort()).toEqual(['district', 'recipientName']);
  });
});
