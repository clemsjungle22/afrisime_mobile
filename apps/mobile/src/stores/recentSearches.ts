import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

const MAX_RECENT = 8;

type RecentSearchesState = {
  items: string[];
  add: (query: string) => void;
  remove: (query: string) => void;
  clear: () => void;
};

const key = (q: string) => q.trim().toLocaleLowerCase('fr');

/** Recherches récentes, gardées uniquement sur le téléphone. */
export const useRecentSearches = create<RecentSearchesState>()(
  persist(
    (set) => ({
      items: [],
      add: (query) => {
        const q = query.trim();
        if (q.length < 2) return;
        set((s) => ({ items: [q, ...s.items.filter((i) => key(i) !== key(q))].slice(0, MAX_RECENT) }));
      },
      remove: (query) => set((s) => ({ items: s.items.filter((i) => key(i) !== key(query)) })),
      clear: () => set({ items: [] }),
    }),
    {
      name: 'afrisime-recent-searches',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ items: s.items }),
    },
  ),
);
