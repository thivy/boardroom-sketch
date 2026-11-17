# Meeting graph pipeline

How a live meeting becomes a graph (see [graph-model.md](graph-model.md) for what the graph holds). Of the
four steps in the design, **Triage** and **Extract** are built. **Connect** and **Wrap up** are not.

```
caption lines ─▶ turns ─▶ Triage (advises, async) ─┐
                    └──────────────▶ batch ─▶ Extract ─▶ checks ─▶ graph.apply
```

| What                                                       | Where                                                                 |
| ---------------------------------------------------------- | --------------------------------------------------------------------- |
| Turns, Triage, Extract, the pipeline and the HTTP handlers | `packages/features/src/graph/server/`                                 |
| The model port (`StructuredModel`) and its Copilot adapter | `contracts/src/model.ts`, `copilot-sdk/src/model.ts`                  |
| Pipeline log (verdicts, runs, rejections)                  | `contracts/src/pipeline-log.ts`, `storage-sqlite/src/pipeline-log.ts` |
| Wiring, and the switch                                     | `apps/web/src/graph-handlers.ts`, `storage.ts`                        |

It is **off by default**. Set `GRAPH_PIPELINE=on` and every recording is followed by the pipeline. Each
model call counts against the signed-in Copilot account.

## Turns

Teams gives no end-of-turn marker and rewrites a line while it is spoken, so a turn ends when someone
else starts, after 4 seconds of silence, or (for a long monologue) at the next line break after 45
seconds. Only finished turns go on, and a line that has been handed on is never handed on again.

## Triage

Runs on every finished turn, beside everything else, and **only advises**. Input: the turn, the two before
it, and one line for each open thread (open questions, tentative or challenged decisions, pending actions,
contested claims). Output: `route` (`extract_now` | `batch` | `skip`), `expects`, `touches` (only threads it
was shown) and `wakeConnect`.

- Code holds it to rules: a reply to a question, or a turn touching an open thread, is never skipped.
- It fails open: a failed, late or malformed verdict means the turn goes to Extract like any other.
- At most 2 calls run at once and at most 6 wait; the rest go on without a verdict.
- Every verdict is logged with the model and the time it took.
- `extract_now` flushes the next Extract early; `skip` removes the turn from Extract (it stays in the
  transcript); `wakeConnect` is only logged until Connect exists.

## Extract

One call per batch (up to 8 turns), waiting up to 20 seconds for company. Calls are serial per recording
(one writer). The prompt is the turns (each line labelled `c1`...), the people (`s1`...), open threads,
what the turns touch plus nodes sharing words with them (about 2,000 tokens, labelled `n1`...), and the
vocabulary written from the same constants the store enforces, with one worked example. The model can
only name what it was shown.

It answers `{ changes: [...] }` in a strict schema: `add_node`, `add_edge`, `set_status`, `update_node`,
`link_person`, `add_evidence`, each with quotes. Plain code then:

- **Checks every quote** against the line it names: same words, same order, ignoring case and
  punctuation, at least three words unless it is the whole line. No quote, no change.
- **Holds statuses to the words.** A decision is `decided` only if the line has a decision marker
  (`DECISION_MARKERS`: "decision", "we've decided", "let's go with"...; English only), otherwise it stays
  `tentative`. An action with no owner becomes `requested` (if it has a date) or `intent`. The owner link is
  folded into the node's creation so a committed action has its owner from the start.
- **Refuses** `contradicts` (inferred, so Connect's job), unknown ids, reused refs and unknown ops.
- **Applies** what is left with `graph.apply` in one transaction, as `stated`. The store rejects anything
  that breaks its own rules (transitions, edge endpoints, owner, stale ids) and says why.
- **Logs** the run and every rejection, with the model.

A failed call retries once, then the turns are dropped and the failure logged. A recording is capped at
400 model calls.

## Models

Each call is a new session with no tools. The adapter picks a model per tier (`fast` for Triage, `smart`
for Extract) from `COPILOT_FAST_MODEL` / `COPILOT_SMART_MODEL`, else the first of a short preference list
that the account has (`gpt-5.6-luna`, `mai-code-2-flash`...). **Do not rely on the runtime's own choice
(`auto`)**: it answered the typed prompts with placeholders. The schema is the strict form (every
property required, optional ones nullable) because OpenAI-style models reject anything looser.

**Reasoning effort** is set per tier too: `COPILOT_FAST_EFFORT` / `COPILOT_SMART_EFFORT`, default `none`.
It is sent only when the chosen model lists it in `supportedReasoningEfforts` (some models have none, or
start at `low`), and the effort used is logged with each verdict and run.

## What was measured

A scripted 11-turn meeting through the real pipeline, with `gpt-5.6-luna`:

- Triage took 5 to 8 seconds a turn; Extract took 10 to 16 seconds a batch. The graph therefore trails the
  conversation by roughly 25 to 35 seconds. The design's "under 1 second" and "on screen in 3 to 5 seconds"
  are not reachable through the Copilot SDK.
- Result: 13 nodes, 3 edges, 17 ops. Correct: the decision (with its marker), the owned and dated action,
  the open question, the assumption. One invalid edge was refused by the store and logged.
- `claude-haiku-5.5` returned empty placeholders for the same prompt, and `auto` picked a weak model;
  `gpt-5.6-luna` and `mai-code-2-flash` were consistently good.

Effects of reasoning effort, `gpt-5.6-luna`, a 7-turn extraction and a Triage call, a few runs each (the
spread between runs is large, so treat these as rough):

| Effort  | Triage       | Extract        | Answer                                                                      |
| ------- | ------------ | -------------- | --------------------------------------------------------------------------- |
| `none`  | 4.2 to 5.5 s | 7.8 to 13 s    | Same quality; once 7 of 17 changes were rejected, then 0 in the next 3 runs |
| `low`   | 4.0 to 4.6 s | 12.6 to 13.3 s | Same quality                                                                |
| default | 4.5 to 6.0 s | 13.7 to 17.9 s | Same quality                                                                |
| `high`  |              | 35 s           | Same quality, nearly 3 times slower                                         |

Triage does not speed up, because a trivial call ("reply with ok") already costs 4 to 5 seconds whatever
the effort: that is the fixed price of a session through the Copilot SDK. Extract gains roughly a third.

## Known gaps

- Few edges: the model mostly creates nodes. A late "let's not finalise the twelfth until..." became its
  own node instead of challenging the decision. Connect is meant to find these.
- The model invents a question now and then from a statement of intent.
- Nothing shows the graph yet. Read it at `GET /api/graph?meeting=<id>` (add `asOfOp=<n>` or
  `asOfTime=<ms>` for an earlier moment), a node's history at `/api/graph/history?node=<id>`, and the
  pipeline log at `/api/graph/events?meeting=<id>[&kind=triage|extract|rejection|error]`.
- `supersedes` does not join a decision to a proposal, so "launch moves to 12 January" cannot supersede the
  earlier "launch on 15 December" proposal.
- Connect, Wrap up, the credit cap per meeting (the SDK exposes no billing unit), and calling
  `pruneUnsupported` when a transcript is deleted are not built.
