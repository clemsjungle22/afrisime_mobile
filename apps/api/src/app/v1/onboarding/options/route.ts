import { OnboardingOptions } from '@afrisime/shared';
import { getOnboardingOptions } from '@/server/catalog/service';
import { PUBLIC_CACHE } from '@/server/http/params';
import { route } from '@/server/http/route';

export const dynamic = 'force-dynamic';

/** Listes de l'inscription : types de client, agences, CGU en vigueur. */
export const GET = route({ response: OnboardingOptions, headers: PUBLIC_CACHE }, () => getOnboardingOptions());
