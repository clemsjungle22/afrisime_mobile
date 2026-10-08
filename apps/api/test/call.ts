type Handler = (req: Request, ctx?: { params?: Promise<Record<string, string>> }) => Promise<Response>;

type CallOptions = {
  body?: unknown;
  token?: string | null;
  params?: Record<string, string>;
  headers?: Record<string, string>;
};

/** Appelle une route Next.js comme le ferait l'app : JSON, en-tête Authorization, paramètres d'URL. */
export async function call(handler: Handler, method: string, url: string, options: CallOptions = {}) {
  const headers: Record<string, string> = { ...options.headers };
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  if (options.token) headers.authorization = `Bearer ${options.token}`;
  const res = await handler(
    new Request(`http://localhost${url}`, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    }),
    options.params ? { params: Promise.resolve(options.params) } : undefined,
  );
  const text = await res.text();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- corps JSON libre, vérifié par les assertions
  const body: any = text ? JSON.parse(text) : null;
  return { status: res.status, headers: res.headers, body };
}
