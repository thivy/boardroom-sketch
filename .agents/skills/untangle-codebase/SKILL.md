---
name: untangle-codebase
description: Untangle a whole codebase in one pass, so agents working in it read less per change, break less without noticing, and debug faster.
argument-hint: "[optional area or concern to focus on]"
---

Start a thorough refactor of this codebase and complete it to the end.

Treat this as a goal.

**Why do this at all?**

- **Better output:** agents write better code in a well-structured codebase.
- **Cheaper & faster changes:** agents spend fewer tokens searching and more on the problem.
- **Fewer silent breaks:** agents break less without noticing.
- **Faster debugging:** agents find root causes faster.

**1. Ask**

Besides untangling the codebase, there are two other things you may do:

| Addition     | What it does                                                                         |
| ------------ | ------------------------------------------------------------------------------------ |
| **Comments** | Remove comments that only restate the code.                                          |
| **Tests**    | Remove tests that wouldn't catch a real bug, and fix the ones that fail without one. |

List these (with their exact descriptions) for the user and ask which ones to do. Then do only those. This repo has no test files today (`bun test` finds none), so only offer **Tests** if some exist when you start.

If the user gave an area or concern as an argument, restrict steps 2–5 to it.

**Project constraints (Boardroom Sketch)**

Read `AGENTS.md` first. It is the source of truth for where code may live. Every fix must keep these true, and a fix that moves code must update `AGENTS.md`, the README and `docs/` where they describe it.

- **Layers (enforced by `.oxlintrc.json`; don't loosen the rules to make a fix fit):**
  - `apps/web` is routing, layout and `*-handlers.ts` wiring only. No feature code, no `node:*`, no `@github/copilot-sdk`, no `@app/contracts`.
  - `packages/features/src/<feature>/server` knows only the ports in `@app/contracts`: no React, no `@app/ui`, no adapters, no `../client`. `client` never imports `server`.
  - Adapters (`teams-cdp`, `storage-sqlite`, `copilot-sdk`) implement a port and import no features, UI or web framework.
  - `packages/ui` and `packages/features` import no web framework (`@tanstack/react-start`, `@tanstack/react-router`).
  - The captions and graph features never import each other. `apps/web` joins them (for example the transcripts page `actions` slot).
- **Rules live in one place.** Graph vocabulary and rules live in `packages/contracts/src/graph-vocabulary.ts` and `docs/graph-model.md`, never in an adapter or the model prompts. A model only proposes; plain code validates.
- **Server state on the client** goes through TanStack Query hooks in features. Never create a `QueryClient` or provider there.
- **Leave alone:** `apps/web/src/routeTree.gen.ts` (generated), the shared ui-sdk wrappers in `packages/ui/src/components`, `bun.lock` and `bunfig.toml` (the hoisted linker is deliberate), and the desktop updater and signing setup unless that is the area asked about.
- **Public contracts stay put:** HTTP routes under `apps/web/src/routes/api`, the `@app/features/*` entry points in `packages/features/package.json`, and the SQLite schema and migrations. Changing one is a behavior change, not a refactor. Ask first.
- **Run server code with Node**, not Bun (`node:sqlite`).

Places to look first:

- The feature servers in `packages/features/src/{captions,chat,graph}/server` each define their own `json`, `isJson` and query-parameter helpers, and build server-sent event streams by hand.
- Long functions that mix validation, state and streaming, such as `chat/server/handlers.ts` `message()`, `captions/server/recorder.ts` and `graph/server/pipeline.ts`.
- `chat/server` imports `captions/server/export`. Check whether that is a hidden link between features.
- Prompts, model choice and effort in `packages/copilot-sdk` and the graph server.

**2. List every problem**

Don't change anything yet.

Go through the codebase asking one thing: **should these pieces change together?** Write down every place the code gets the answer wrong, as in the [decision log example](#decision-log-example). There are only three ways to get it wrong.

**Hidden links:** pieces that must change together, where the code doesn't show it.

- Copies of logic or values: change one and the others must change too, but nothing says so.
- A module that reads a global or file set by another module: change that module and this one breaks, but nothing shows it (self-contained code).
- A feature split across folders by layer, or related code in different folders: one change needs all of them, but the layout hides that (domain-driven code, colocation).
- A call order or convention callers just have to know: change it and callers break, but nothing warns them (explicit over implicit).

**Needless links:** pieces tied together that change for different reasons.

- Callers that depend on internals: the internals change for their own reasons, and the callers break anyway (encapsulation).
- Stable code that imports something more volatile: the stable code has to change whenever the volatile code does (dependency direction).
- A general function with a parameter only one workflow understands: the function has to change whenever that workflow does (caller vocabulary).
- A shallow module: its interface changes whenever its internals do, so its callers change with it (deep modules).

**Surplus:** pieces with no reason of their own to change.

- Wrappers: they only change when the thing they wrap does (pass-through wrappers).
- Extension points and config for things that never vary: nothing will ever change them (speculative generality).
- Dead code: nothing uses it, so nothing will ever need it to change.

Also write down every **special case**: code that exists for one situation instead of following from how the system works. Each one is a requirement the design never accounted for, so use them to work out what the system needs to be.

- An `if` for one value
- A parameter for a specific caller
- A swallowed exception
- A retry or sleep
- A disabled test

**3. Redesign from first principles**

Work out the fixes as if the system had known today's requirements from the start. Look for the one fix behind several problems, which often looks nothing like them. Don't fix special cases one by one.

Ask the same thing of every fix, even one that looks better in the code: pieces that change together end up together, pieces that don't aren't tied, and everything depends on what changes less.

Write each fix above the problems it solves, as in the [decision log example](#decision-log-example).

**4. Fix everything on the list**

Remove the special cases the redesign makes unnecessary, and keep the ones the system still needs. Don't go looking for bugs separately. A structural fix may fix some along the way, which is fine.

If the user chose Comments:

- Comments that restate the implementation, like `// sort first so the binary search works`, only change when it does, so they have no reason of their own to change. Remove them, even if they're phrased as a why.
- Comments about something outside the code, like `// the proxy drops websockets, so we poll`, change when that does, and the code can't show it. Keep them.
- Comments that explain a workaround in the codebase, like `// wait 100ms because the cache isn't ready yet`, only change when the problem behind the workaround does. They go when the redesign removes that problem.

If the user chose Tests, do this last, because tests are your regression safety net. A test should fail on a regression, and only then:

- Tests that repeat the implementation only change when it does, so they have no reason of their own to change. They check the same interpretation against itself, so remove them.
- Tests tied to internals break when the code changes but behavior doesn't, so they change for the wrong reason. Rewrite them to depend on behavior, which changes less.
- Tests that can't fail pass whatever the code does, so no change ever affects them. They aren't checking anything, so remove them.

**5. Check, and repeat until done**

Have subagents search for special cases, hidden links, needless links and surplus. **Do not stop until there is nothing worth fixing left.**

You're done when:

- **As few special cases are left in the system as possible.** How many remain is the best measure of how close you are.
- A typical change lands in one place.
- Every import is reasonable, and nothing imports anything more volatile than itself.
- Subagents have no issues left that are worth fixing.
- Intended behavior is the same as when you started, apart from bugs the refactor fixed. Test this at the end.

Check after every batch of fixes, not only at the end. Use the repo's pinned Bun (`bun@1.4.4`; for example `npm exec --yes --package=bun@1.4.4 -- bun run <script>`):

- `bun run typecheck`, `bun run lint` and `bun run build`. The build catches import and bundling problems that typecheck misses.
- `bun run fmt` on the files you touched only. `bun run fmt:check` across the whole repo may already fail on files you didn't touch; don't reformat them.
- For anything the types and build can't prove (recording, live graph, chat streaming, exports), exercise the real endpoint with Node and compare responses before and after. Say what you ran and what you couldn't run.
- Search for stale references to anything you moved or renamed, including `AGENTS.md`, the README and `docs/`.

**Tips**

- **Start from a skeleton:** script away the function bodies, so the whole codebase fits in context.
- **Summarize with subagents:** have them summarize parts of the codebase, so you can reason across all of it at once.
- **Check the dependency graph often:** script one that shows what imports what, and rerun it as you go.
- **Enter where leverage is highest:** start looking there first.
- **Keep a decision log:** compaction is less of a problem that way.
- **Use Git as evidence:** for how often pieces change, and what changes together. The worktree may hold unrelated uncommitted changes, so check `git status` first and never revert what you didn't change.
- **Name files for what they do:** no `index.ts` for real code. Entry points that only re-export are fine, because `package.json` `exports` points at them.
- **Comments in this repo:** keep only the ones that need it. Short doc comments on exported handlers that state the route and its parameters are part of the API and stay.

<a id="decision-log-example"></a>**Decision log example**

The list of problems:

```md
- `ui/LogoutDialog.tsx:30` waits 100ms after closing and hopes the message input can take focus by then.
- `ui/Toolbar.tsx:40` and `ui/Menu.tsx:22` call the same actions, each with its own check for when they're disabled.
- `checkout/submit.ts:9` depends directly on `payments/stripe.ts`.
- `shortcuts/keymap.ts:18` has a switch with one case per action, separate from the menu's list.
- `ui/CommandPalette.tsx:55` keeps its own list of actions, and it's missing the newer ones.
- `ui/SettingsDialog.tsx:61` sets a global `skipRefocus` flag to stop the logout dialog it opens from sending focus to the message input.
- `history/undo.ts:30` has a special case for every action that can be undone.
- `refunds/refund.ts:22` wraps every Stripe call in `if (order.provider === "paypal")`.
- Every action handler has to call `track()` by hand, and some don't.
- `ui/Toolbar.test.tsx` and `ui/Menu.test.tsx` test the same actions separately.
```

Then with the fixes:

```md
- Make the general `Dialog` give focus back to whatever had it before it opened, so the wait and the flag can both go.
  - `ui/LogoutDialog.tsx:30` waits 100ms after closing and hopes the message input can take focus by then.
  - `ui/SettingsDialog.tsx:61` sets a global `skipRefocus` flag to stop the logout dialog it opens from sending focus to the message input.
- Define a `PaymentProvider` interface that Stripe and PayPal both implement, so checkout and refunds no longer know which one they're using.
  - `checkout/submit.ts:9` depends directly on `payments/stripe.ts`.
  - `refunds/refund.ts:22` wraps every Stripe call in `if (order.provider === "paypal")`.
- Make every user action a command with a name, a handler and an undo, so the toolbar, menu, shortcuts, palette and undo history all run from one list.
  - `ui/Toolbar.tsx:40` and `ui/Menu.tsx:22` call the same actions, each with its own check for when they're disabled.
  - `shortcuts/keymap.ts:18` has a switch with one case per action, separate from the menu's list.
  - `ui/CommandPalette.tsx:55` keeps its own list of actions, and it's missing the newer ones.
  - `history/undo.ts:30` has a special case for every action that can be undone.
  - Every action handler has to call `track()` by hand, and some don't.
  - `ui/Toolbar.test.tsx` and `ui/Menu.test.tsx` test the same actions separately.
```
