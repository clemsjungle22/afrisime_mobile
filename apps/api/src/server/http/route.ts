import { z } from 'zod';
import { type AuthContext, authenticate } from '../auth/context';
import { newId } from '../ids';
import { log } from '../log';
import { ApiError, errorBody } from './errors';

type Schema = z.ZodType;
type Out<S> = S extends Schema ? z.output<S> : undefined;

type AuthMode = 'none' | 'optional' | 'required';
type AuthOf<A> = A extends 'required' ? AuthContext : A extends 'optional' ? AuthContext | null : null;

export type RouteContext<Q, B, A = 'none'> = {
  req: Request;
  requestId: string;
  query: Out<Q>;
  body: Out<B>;
  params: Record<string, string>;
  /** Client connecté : obligatoire (401 sinon), facultatif ou ignoré selon `auth`. */
  auth: AuthOf<A>;
};

type Spec<Q, B, R extends Schema, A extends AuthMode> = {
  auth?: A;
  /** Paramètres d'URL (?a=b), validés et convertis. */
  query?: Q;
  /** Corps JSON, validé. */
  body?: B;
  /** Forme de la réponse : vérifiée AVANT envoi, un écart devient une erreur serveur (jamais une fuite). */
  response: R;
  /** Réponses personnalisées (client connecté) : jamais mises en cache par un intermédiaire. */
  privateWhenAuthenticated?: boolean;
  status?: number;
  headers?: Record<string, string>;
};

const REQUEST_ID = /^[\w-]{8,64}$/;

function json(status: number, data: unknown, requestId: string, headers?: Record<string, string>) {
  return Response.json(data, {
    status,
    headers: { 'x-request-id': requestId, 'cache-control': 'no-store', ...headers },
  });
}

function validationError(error: z.ZodError, where: 'query' | 'body') {
  return new ApiError('VALIDATION_ERROR', where === 'body' ? 'Corps de requête invalide.' : 'Paramètres invalides.', {
    issues: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
  });
}

/**
 * Enveloppe un handler Next.js : identifiant de requête, validation des entrées et de la sortie,
 * format d'erreur unique ({ error: { code, message, requestId } }) et journal d'accès.
 */
export function route<
  Q extends Schema | undefined = undefined,
  B extends Schema | undefined = undefined,
  R extends Schema = Schema,
  A extends AuthMode = 'none',
>(spec: Spec<Q, B, R, A>, handler: (ctx: RouteContext<Q, B, A>) => Promise<z.input<R>> | z.input<R>) {
  return async (req: Request, context?: { params?: Promise<Record<string, string | string[]>> }): Promise<Response> => {
    const started = performance.now();
    const incoming = req.headers.get('x-request-id');
    const requestId = incoming && REQUEST_ID.test(incoming) ? incoming : newId('req');
    const path = new URL(req.url).pathname;
    let status = 500;

    try {
      const mode: AuthMode = spec.auth ?? 'none';
      const auth = mode === 'none' ? null : await authenticate(req);
      if (mode === 'required' && !auth) throw new ApiError('UNAUTHENTICATED', 'Connectez-vous pour continuer.');

      const raw = (await context?.params) ?? {};
      const params = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v.join('/') : v]));

      let query: unknown = undefined;
      if (spec.query) {
        const parsed = spec.query.safeParse(Object.fromEntries(new URL(req.url).searchParams));
        if (!parsed.success) throw validationError(parsed.error, 'query');
        query = parsed.data;
      }

      let body: unknown = undefined;
      if (spec.body) {
        let input: unknown;
        try {
          input = await req.json();
        } catch {
          throw new ApiError('VALIDATION_ERROR', 'Corps JSON attendu.');
        }
        const parsed = spec.body.safeParse(input);
        if (!parsed.success) throw validationError(parsed.error, 'body');
        body = parsed.data;
      }

      const result = await handler({
        req,
        requestId,
        params,
        query: query as Out<Q>,
        body: body as Out<B>,
        auth: auth as AuthOf<A>,
      });
      const checked = spec.response.safeParse(result);
      if (!checked.success) {
        log.error('réponse non conforme au contrat', { requestId, path, issues: checked.error.issues.slice(0, 5) });
        throw new Error('Réponse non conforme au contrat');
      }
      status = spec.status ?? 200;
      if (status === 204) return new Response(null, { status, headers: { 'x-request-id': requestId } });
      const headers = auth && spec.privateWhenAuthenticated ? { ...spec.headers, 'cache-control': 'private, no-store' } : spec.headers;
      return json(status, checked.data, requestId, headers);
    } catch (error) {
      if (error instanceof ApiError) {
        status = error.status;
        const headers: Record<string, string> = {};
        const retryIn = (error.details as { retryIn?: unknown } | undefined)?.retryIn;
        if (status === 429 && typeof retryIn === 'number') headers['retry-after'] = String(retryIn);
        return json(status, errorBody(error.code, error.message, requestId, error.details), requestId, headers);
      }
      status = 500;
      log.error('erreur non gérée', { requestId, path, error });
      return json(status, errorBody('INTERNAL_ERROR', 'Une erreur est survenue. Réessayez.', requestId), requestId);
    } finally {
      log.info('requête', { requestId, method: req.method, path, status, ms: Math.round(performance.now() - started) });
    }
  };
}
