import { buildOpenApi } from '@/server/http/openapi';

/** Contrat de l'API (OpenAPI 3.1), à ouvrir dans un outil comme Swagger UI ou Bruno. */
export function GET(req: Request) {
  const { origin } = new URL(req.url);
  return Response.json(buildOpenApi(origin), {
    headers: { 'cache-control': 'public, max-age=300' },
  });
}
