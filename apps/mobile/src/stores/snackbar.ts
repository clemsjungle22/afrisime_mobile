import { create } from 'zustand';

export type SnackbarMessage = {
  id: number;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  durationMs: number;
};

type SnackbarState = {
  current: SnackbarMessage | null;
  show: (m: Omit<SnackbarMessage, 'id' | 'durationMs'> & { durationMs?: number }) => void;
  hide: (id?: number) => void;
};

let nextId = 1;

/** Message court en surimpression (« Ajouté au panier », « Article retiré — Annuler »). */
export const useSnackbar = create<SnackbarState>()((set, get) => ({
  current: null,
  show: (m) => set({ current: { durationMs: 4000, ...m, id: nextId++ } }),
  hide: (id) => {
    if (id === undefined || get().current?.id === id) set({ current: null });
  },
}));

export const showSnackbar = (m: Parameters<SnackbarState['show']>[0]) => useSnackbar.getState().show(m);
