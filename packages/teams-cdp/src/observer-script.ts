/** Runs inside the Teams page. Reports caption lines through the `__boardroomCaption` binding. */
export const BINDING = "__boardroomCaption";

export const observerScript = `(() => {
  // A new connection replaces the observer of an earlier one, whose binding is gone.
  window.__boardroomObserver?.stop?.();

  const run = Math.random().toString(36).slice(2, 8);
  const ids = new WeakMap();
  const lastSeen = new Map();
  let sequence = 0;
  let visible;

  const CONTAINERS = [
    '[data-tid="closed-caption-v2-window-wrapper"]',
    '[data-tid="closed-captions-v2-items-renderer"]',
    '[data-tid="closed-caption-renderer-wrapper"]',
    '[data-tid*="closed-caption"]',
  ];
  const ITEMS = ".fui-ChatMessageCompact, .fui-ChatMessage, .ui-chat__item";
  const containerSelector = CONTAINERS.join(", ");

  const report = (message) => window.${BINDING}(JSON.stringify(message));

  const scan = () => {
    const texts = document.querySelectorAll('[data-tid="closed-caption-text"]');
    const nowVisible = texts.length > 0 || document.querySelector(containerSelector) !== null;
    if (nowVisible !== visible) {
      visible = nowVisible;
      report({ type: "status", captionsVisible: nowVisible });
    }

    texts.forEach((textElement) => {
      const item = textElement.closest(ITEMS) ?? textElement.parentElement?.parentElement;
      const text = (textElement.textContent ?? "").trim();
      if (!item || !text) return;

      let id = ids.get(item);
      if (!id) {
        id = run + "-" + ++sequence;
        ids.set(item, id);
      }
      if (lastSeen.get(id) === text) return;
      lastSeen.set(id, text);

      const speaker = (item.querySelector('[data-tid="author"]')?.textContent ?? "").trim();
      report({ type: "caption", caption: { id, speaker, text, at: Date.now() } });
    });
  };

  const observer = new MutationObserver(scan);
  observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true });
  const timer = setInterval(scan, 1000);
  window.__boardroomObserver = {
    stop: () => {
      observer.disconnect();
      clearInterval(timer);
    },
  };
  scan();
})();`;
