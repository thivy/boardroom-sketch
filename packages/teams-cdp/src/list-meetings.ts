import type { Meeting } from "@app/contracts";
import { CdpSession } from "./cdp";

const TEAMS_HOSTS = ["teams.microsoft.com", "teams.live.com", "teams.cloud.microsoft"];

export type TeamsPage = { id: string; title: string };

/** A Teams meeting and the pages that show it. Popping the captions out adds a page. */
export type MeetingGroup = Meeting & { pageIds: string[] };

function isTeams(url: string) {
  try {
    const { hostname } = new URL(url);
    return TEAMS_HOSTS.some((host) => hostname === host || hostname.endsWith(`.${host}`));
  } catch {
    return false;
  }
}

/** Every Teams page of a browser or WebView2 that listens for DevTools on `port`. Local only. */
export async function listTeamsPages(port: number): Promise<TeamsPage[]> {
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

/** A page belongs to a meeting when its title is the meeting topic, plus Teams' " | org | account" suffix. */
export function isPageOfMeeting(pageTitle: string, topic: string) {
  return pageTitle === topic || pageTitle.startsWith(`${topic} | `);
}

/** Every prefix of a page title split at " | ": the topic is one of them. */
function topicCandidates(title: string) {
  const parts = title.split(" | ");
  return parts.map((_, index) => parts.slice(0, index + 1).join(" | "));
}

// Runs inside a Teams page. Teams keeps every conversation in IndexedDB; a meeting's record has the
// topic that is also the window title, and its id is the meeting thread id.
const lookupScript = (topics: string[]) => `(async () => {
  const wanted = new Set(${JSON.stringify(topics)});
  const names = (await indexedDB.databases()).map((d) => d.name);
  const name = names.find((n) => n && n.startsWith("Teams:conversation-manager:react-web-client"));
  if (!name) return [];
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open(name);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const found = [];
  await new Promise((resolve) => {
    const cursor = db.transaction("conversations").objectStore("conversations").openCursor();
    cursor.onsuccess = () => {
      const row = cursor.result;
      if (!row) return resolve();
      const value = row.value;
      const topic = value.threadProperties && value.threadProperties.topic;
      if (typeof value.id === "string" && value.id.startsWith("19:meeting_") && wanted.has(topic)) {
        const last = value.lastMessage || {};
        found.push({ id: value.id, topic, updated: Date.parse(last.composetime || last.originalarrivaltime || "") || 0 });
      }
      row.continue();
    };
    cursor.onerror = () => resolve();
  });
  db.close();
  return found;
})()`;

async function lookupThreads(webSocketUrl: string, topics: string[]) {
  const session = await CdpSession.connect(webSocketUrl);
  try {
    const result = (await session.send("Runtime.evaluate", {
      expression: lookupScript(topics),
      awaitPromise: true,
      returnByValue: true,
    })) as { result: { value?: { id: string; topic: string; updated: number }[] } };
    return result.result.value ?? [];
  } finally {
    session.close();
  }
}

/**
 * One group per Teams meeting, identified by the meeting thread id read from Teams' own store.
 * Pages that are not a meeting (the main client, chats) are left out.
 */
export async function listMeetingGroups(port: number): Promise<MeetingGroup[]> {
  const pages = await listTeamsPages(port);
  if (pages.length === 0) return [];

  const topics = [...new Set(pages.flatMap((page) => topicCandidates(page.title)))];
  const found = await lookupThreads(`ws://127.0.0.1:${port}/devtools/page/${pages[0].id}`, topics);

  // Several threads can share a topic; the one with the latest message is the live one.
  const byTopic = new Map<string, { id: string; updated: number }>();
  for (const { id, topic, updated } of found) {
    const current = byTopic.get(topic);
    if (!current || updated > current.updated) byTopic.set(topic, { id, updated });
  }

  const groups = new Map<string, MeetingGroup>();
  for (const page of pages) {
    // The longest matching prefix is the most specific topic.
    const topic = topicCandidates(page.title)
      .filter((candidate) => byTopic.has(candidate))
      .sort((a, b) => b.length - a.length)[0];
    if (!topic) continue;
    const id = byTopic.get(topic)!.id;
    const group = groups.get(id) ?? { id, title: topic, pageIds: [] };
    group.pageIds.push(page.id);
    groups.set(id, group);
  }
  return [...groups.values()];
}

export async function listMeetings(port: number): Promise<Meeting[]> {
  return (await listMeetingGroups(port)).map(({ id, title }) => ({ id, title }));
}
