/** Calls the app's own API and returns its JSON; a failed call throws the server's `error` message. */
export async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = await response.json();
  if (!response.ok) throw new Error((body as { error: string }).error);
  return body as T;
}

/** The options for sending `body` as JSON. */
export const jsonRequest = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});
