export const json = (body: unknown, status = 200) => Response.json(body, { status });

export const errorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

// A JSON body cannot be sent cross-site without a CORS preflight.
export const isJsonRequest = (request: Request) =>
  request.headers.get("content-type")?.includes("application/json") ?? false;

export function parseSessionId(request: Request): number | undefined {
  const value = Number(new URL(request.url).searchParams.get("session"));
  return Number.isInteger(value) && value > 0 ? value : undefined;
}
