import { afterAll, beforeAll, expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import { act } from "react";

const dom = new JSDOM("", { pretendToBeVisual: true, url: "http://localhost" });
const globals = {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  HTMLFieldSetElement: dom.window.HTMLFieldSetElement,
  HTMLInputElement: dom.window.HTMLInputElement,
  HTMLTextAreaElement: dom.window.HTMLTextAreaElement,
  HTMLButtonElement: dom.window.HTMLButtonElement,
  Event: dom.window.Event,
  MouseEvent: dom.window.MouseEvent,
  KeyboardEvent: dom.window.KeyboardEvent,
  Element: dom.window.Element,
  Node: dom.window.Node,
  MutationObserver: dom.window.MutationObserver,
  getComputedStyle: dom.window.getComputedStyle,
  requestAnimationFrame: dom.window.requestAnimationFrame,
  cancelAnimationFrame: dom.window.cancelAnimationFrame,
  IS_REACT_ACT_ENVIRONMENT: true,
};
const original = Object.getOwnPropertyDescriptors(globalThis);

beforeAll(() => {
  for (const [name, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, name, { value, writable: true, configurable: true });
  }
  dom.window.HTMLElement.prototype.showPopover = () => {};
  dom.window.HTMLElement.prototype.hidePopover = () => {};
  dom.window.Element.prototype.getAnimations = () => [];
  dom.window.Element.prototype.scrollIntoView = () => {};
  dom.window.Element.prototype.checkVisibility = () => true;
});

afterAll(() => {
  for (const name of Object.keys(globals)) {
    const descriptor = original[name];
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  }
  dom.window.close();
});

test("the agent finds named shared controls and calls their application handlers", async () => {
  const { createRoot } = await import("react-dom/client");
  const { createAgent } = await import("@ui-sdk/react/agent");
  const { Button } = await import("./button");
  const { Input } = await import("./input");
  const { Switch } = await import("./switch");
  const { Textarea } = await import("./textarea");

  const agent = createAgent();
  const root = createRoot(document.body.appendChild(document.createElement("main")));
  const events: unknown[] = [];

  try {
    await act(async () => {
      root.render(
        <>
          <Input aria-label="Graph search" onValueChange={(value) => events.push(value)} />
          <Textarea aria-label="Draft message" onValueChange={(value) => events.push(value)} />
          <Switch aria-label="Build graph live" onCheckedChange={(value) => events.push(value)} />
          <Button
            onClick={() => {
              events.push("cleared");
            }}
          >
            Clear search
          </Button>
        </>,
      );
    });

    expect(
      agent
        .snapshot()
        .filter((entry) => !entry.offPage)
        .map((entry) => entry.label)
        .sort(),
    ).toEqual(["Build graph live", "Clear search", "Draft message", "Graph search"]);

    await act(async () => {
      const result = await agent.act({
        steps: [
          { ref: "Graph search", action: "setValue", args: ["Atlas"] },
          { ref: "Draft message", action: "setValue", args: ["Summarize"] },
          { ref: "Build graph live", action: "setChecked", args: [true] },
          { ref: "Clear search", action: "press" },
        ],
      });
      expect(result.ok, result.error?.message).toBe(true);
    });
    expect(events).toEqual(["Atlas", "Summarize", true, "cleared"]);
  } finally {
    await act(async () => root.unmount());
  }
});
