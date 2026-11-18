export type StructuredRequest = {
  /** What the model is, and the rules it follows. */
  instructions: string;
  prompt: string;
  /** A JSON Schema the answer must follow. */
  schema: Record<string, unknown>;
};

export type StructuredResponse = {
  /** The parsed answer; still unchecked, so callers validate it. */
  value: unknown;
  durationMs: number;
  /** The model that answered, when the adapter knows it. */
  model?: string;
};

/**
 * A model that answers one question with typed data. Each call stands alone, with no memory of earlier
 * calls and no tools, so what it costs does not grow with the meeting. The graph pipeline depends only
 * on this port; an adapter (today `@app/copilot-sdk`) implements it.
 */
export interface StructuredModel {
  /** Rejects when the call fails, returns something that is not JSON, or `signal` aborts. */
  complete(request: StructuredRequest, signal?: AbortSignal): Promise<StructuredResponse>;
}
