import type { Meeting } from "@app/contracts";

const TEAMS_HOSTS = ["teams.microsoft.com", "teams.live.com", "teams.cloud.microsoft"];

function isTeams(url: string) {
  try {
    const { hostname } = new URL(url);
    return TEAMS_HOSTS.some((host) => hostname === host || hostname.endsWith(`.${host}`));
  } catch {
    return false;
  }
}

/** The Teams pages of a browser or WebView2 that listens for DevTools on `port`. Local only. */
export async function listMeetings(port: number): Promise<Meeting[]> {
  let pages: { id: string; type: string; title: string; url: string }[];
  try {
    const response = await fetch(`http://127.0.0.1:${port}/json`, {
      signal: AbortSignal.timeout(3000),
    });
    pages = await response.json();
  } catch {
    throw new Error(
      `Teams is not reachable on debugging port ${port}. Restart Teams from here, or start Chrome/Edge with --remote-debugging-port=${port}.`,
    );
  }
  return pages
    .filter((page) => page.type === "page" && isTeams(page.url))
    .map(({ id, title }) => ({ id, title }));
}
