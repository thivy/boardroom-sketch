/** What the person using the app has chosen. */
export type AppSettings = {
  /** Build the meeting graph while a meeting is recorded. It calls a model, so it starts off. */
  liveGraph: boolean;
};

export const DEFAULT_SETTINGS: AppSettings = { liveGraph: false };

/**
 * Where the app's settings are kept. Anything not set yet reads as its default, and `update` changes
 * only the keys it is given.
 */
export interface SettingsStore {
  get(): Promise<AppSettings>;
  update(changes: Partial<AppSettings>): Promise<AppSettings>;
}
