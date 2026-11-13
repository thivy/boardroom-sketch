type Pending = { resolve: (value: unknown) => void; reject: (error: Error) => void };
type Listener = (params: unknown) => void;

/** A minimal Chrome DevTools Protocol client over the runtime's global WebSocket. */
export class CdpSession {
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();
  private readonly listeners = new Map<string, Listener[]>();

  private constructor(private readonly socket: WebSocket) {
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data)) as {
        id?: number;
        method?: string;
        params?: unknown;
        result?: unknown;
        error?: { message: string };
      };
      if (message.id !== undefined) {
        const call = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) call?.reject(new Error(message.error.message));
        else call?.resolve(message.result);
      } else if (message.method) {
        this.listeners.get(message.method)?.forEach((listener) => listener(message.params));
      }
    });
    socket.addEventListener("close", () => {
      for (const call of this.pending.values())
        call.reject(new Error("DevTools connection closed"));
      this.pending.clear();
    });
  }

  static connect(url: string): Promise<CdpSession> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url);
      socket.addEventListener("open", () => resolve(new CdpSession(socket)), { once: true });
      socket.addEventListener(
        "error",
        () => reject(new Error("Could not open the DevTools socket")),
        { once: true },
      );
    });
  }

  send(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  on(method: string, listener: Listener) {
    this.listeners.set(method, [...(this.listeners.get(method) ?? []), listener]);
  }

  onClose(listener: () => void) {
    this.socket.addEventListener("close", listener, { once: true });
  }

  close() {
    this.socket.close();
  }
}
