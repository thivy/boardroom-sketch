const encoder = new TextEncoder();

export const json = (body: unknown, status = 200) => Response.json(body, { status });

export const errorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

/**
 * A JSON body cannot be sent cross-site without a CORS preflight, so endpoints that change something
 * refuse anything else. Returns the response to send, or undefined when the request is JSON.
 */
export function rejectNonJson(request: Request): Response | undefined {
  const isJson = request.headers.get("content-type")?.includes("application/json") ?? false;
  return isJson ? undefined : json({ error: "Expected application/json" }, 415);
}

/** The JSON body, or an empty object when there is none or it is not JSON. */
export async function readJson<T extends object>(request: Request): Promise<Partial<T>> {
  return (await request.json().catch(() => ({}))) as Partial<T>;
}

export const queryParam = (request: Request, name: string) =>
  new URL(request.url).searchParams.get(name);

/** A query parameter that must be a whole number above zero, such as a session id. */
export function idParam(request: Request, name: string): number | undefined {
  const value = Number(queryParam(request, name));
  return Number.isInteger(value) && value > 0 ? value : undefined;
}

export const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
};

export const sseFrame = (event: string, data: unknown) =>
  encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

/** A comment line keeps an idle stream from being closed by proxies. */
export const sseKeepAlive = () => encoder.encode(": ping\n\n");
