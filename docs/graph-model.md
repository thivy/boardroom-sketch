# Meeting graph model

A meeting's graph holds what was _meant_ rather than just what was said: proposals, decisions, actions,
questions, risks and claims, the edges between them, and who they involve. This page describes the
schema and the rules that guard it. It covers storage only; nothing extracts or draws the graph yet.

| What                                       | Where                                                          |
| ------------------------------------------ | -------------------------------------------------------------- |
| Vocabulary, transitions, edge rules (pure) | `packages/contracts/src/graph-vocabulary.ts`                   |
| Records and the `GraphStore` port          | `packages/contracts/src/graph.ts`                              |
| SQLite tables                              | `packages/storage-sqlite/src/graph-schema.ts` (module `graph`) |
| SQLite implementation (`graphSqlite(db)`)  | `packages/storage-sqlite/src/graph.ts`                         |

The rules live in `contracts` so any adapter enforces the same ones. The SQLite `CHECK` constraints are
generated from the same constants, so the database refuses what the types refuse. The cost: changing the
vocabulary needs a new migration step that rebuilds the table, because SQLite cannot alter a `CHECK`.

## Scope and identity

- One graph per **meeting** (`graph_nodes.meeting_id` references `meetings`). All recordings of a meeting
  share it. Deleting the meeting deletes its graph.
- Ids are generated (UUIDs). Edges carry `meeting_id` and use composite foreign keys, so an edge between
  two meetings cannot exist, in code or by hand.
- **People are not nodes.** They are the transcript's `speakers`, linked through `graph_node_person`.
  Only someone who spoke in the meeting can be linked.

## Nodes

`graph_nodes`: `type`, `status`, `title`, `topic_id`, `origin` (`inferred` | `stated` | `human`), `confidence` (0 to 1),
`attrs` (JSON, per type), `merged_into`, `deleted_at`, timestamps.

Type attributes: `action` has `dueAt` / `dueText`; `entity` has `kind` (`system`, `vendor`, `artefact`);
the rest have none. Unknown attributes are rejected.

### Statuses and allowed transitions

A node is created in an _initial_ status (the first one listed, unless noted). Everything else is reached
by `setStatus`, which rejects a move that is not in this table.

| Type         | From         | May move to                                                     |
| ------------ | ------------ | --------------------------------------------------------------- |
| `topic`      | `active`     | `parked`, `closed`                                              |
|              | `parked`     | `active`, `closed`                                              |
|              | `closed`     | `active`                                                        |
| `proposal`   | `proposed`   | `challenged`, `adopted`, `rejected`, `withdrawn`                |
|              | `challenged` | `proposed`, `adopted`, `rejected`, `withdrawn`                  |
|              | `adopted`    | final                                                           |
|              | `rejected`   | `proposed` (raised again)                                       |
|              | `withdrawn`  | `proposed` (raised again)                                       |
| `decision`   | `tentative`  | `decided`, `challenged`, `reversed`                             |
|              | `decided`    | `challenged`, `reversed`, `superseded`, `confirmed`             |
|              | `challenged` | `tentative`, `decided`, `reversed`, `superseded`                |
|              | `confirmed`  | `challenged`, `reversed`, `superseded`                          |
|              | `reversed`   | `tentative`, `decided` (reinstated)                             |
|              | `superseded` | final                                                           |
| `action`     | `intent`     | `requested`, `committed`, `dropped`                             |
|              | `requested`  | `committed`, `dropped`                                          |
|              | `committed`  | `done`, `dropped`, `orphaned`                                   |
|              | `done`       | `committed` (reopened)                                          |
|              | `orphaned`   | `requested`, `committed`, `dropped`                             |
|              | `dropped`    | final                                                           |
| `question`   | `open`       | `answered`, `deferred`, `dropped`                               |
|              | `deferred`   | `open`, `answered`, `dropped`                                   |
|              | `answered`   | `open` (answer disputed)                                        |
|              | `dropped`    | final                                                           |
| `risk`       | `raised`     | `mitigating`, `accepted`, `escalated`, `closed`                 |
|              | `mitigating` | `raised` (mitigation failed), `accepted`, `escalated`, `closed` |
|              | `escalated`  | `mitigating`, `accepted`, `closed`                              |
|              | `accepted`   | `escalated`, `closed`                                           |
|              | `closed`     | `raised` (reopened)                                             |
| `claim`      | `assumed`    | `asserted`, `contested`, `confirmed`, `retracted`               |
|              | `asserted`   | `contested`, `confirmed`, `retracted`                           |
|              | `contested`  | `asserted`, `confirmed`, `retracted`                            |
|              | `confirmed`  | `contested`, `retracted`                                        |
|              | `retracted`  | final                                                           |
| `constraint` | `stated`     | `confirmed`, `lifted`                                           |
|              | `confirmed`  | `lifted`                                                        |
|              | `lifted`     | `stated` (reimposed)                                            |
| `entity`     | `mentioned`  | final                                                           |

Creating a node directly in a later status is allowed only for: `decision` (`tentative`, `decided`),
`action` (`intent`, `requested`, `committed`) and `claim` (`assumed`, `asserted`).

### Status preconditions

Several statuses only restate something the graph can already show. Letting both be stored independently
means they can disagree, so these are refused unless the thing they restate exists.

| Move                                 | Needs                                                                               |
| ------------------------------------ | ----------------------------------------------------------------------------------- |
| `decision` → `decided`, `confirmed`  | the change carries a transcript quote (a rationale alone is not enough)             |
| `action` → `committed`               | an `owner`                                                                          |
| `proposal`/`decision` → `challenged` | a `challenges` edge pointing at it, or a `challenged_by` person                     |
| `claim` → `contested`                | a `challenges`, `contradicts` or `conflicts_with` edge, or a `challenged_by` person |
| `decision` → `superseded`            | a `supersedes` edge pointing at it                                                  |
| `question` → `answered`              | an `answers` edge pointing at it, or an `answered_by` person                        |
| `risk` → `mitigating`                | a `mitigates` edge pointing at it                                                   |

They are checked when the status changes. Removing the edge later is not re-checked, with one exception:
the last `owner` of a `committed` action cannot be removed (move it to `orphaned` first).

## Edges

`graph_edges`: `type`, `family` (derived from the type and checked), `src_id`, `dst_id`, `origin`,
`confidence`, `rationale`, `deleted_at`. At most one live edge per `(src, dst, type)`; adding it again
records the new evidence against the existing edge, and `stated` beats `inferred`.

**Symmetric** edges are stored once with the smaller id as `src` (the database checks this). `edgesOf`
returns them as `both` from either end.

| Family   | Type             | Sym. | From                                        | To                                     |
| -------- | ---------------- | ---- | ------------------------------------------- | -------------------------------------- |
| `build`  | `supports`       |      | proposal, decision, claim, risk, constraint | proposal, decision, claim, action      |
|          | `leads_to`       |      | any except topic and entity                 | any except topic and entity            |
|          | `answers`        |      | proposal, decision, claim                   | question                               |
|          | `resolves`       |      | decision, action                            | question, risk, constraint             |
|          | `mitigates`      |      | proposal, decision, action, constraint      | risk                                   |
|          | `addresses`      |      | proposal, decision, action                  | question, risk, constraint             |
|          | `creates`        |      | proposal, decision                          | action, risk, constraint, question     |
|          | `combines_with`  | yes  | proposal                                    | proposal                               |
| `oppose` | `challenges`     |      | proposal, claim, risk, constraint, question | proposal, decision, claim, action      |
|          | `blocks`         |      | decision, action, claim, risk, constraint   | proposal, decision, action             |
|          | `contradicts`    | yes  | claim                                       | claim                                  |
|          | `conflicts_with` | yes  | proposal, decision, claim                   | proposal, decision, claim              |
| `revise` | `supersedes`     |      | proposal, decision (same type)              | proposal, decision (same type)         |
|          | `corrects`       |      | claim, action (same type)                   | claim, action (same type)              |
| `plan`   | `depends_on`     |      | proposal, decision, action                  | decision, action, question, constraint |
|          | `relies_on`      |      | proposal, decision, action                  | claim, constraint, entity              |
| `struct` | `about`          |      | any except topic                            | topic                                  |
|          | `alternative_to` | yes  | proposal                                    | proposal                               |
|          | `refers_to`      |      | any except topic and entity                 | entity                                 |

`contradicts` (two claims cannot both be true) is the stronger of the two oppositions. Unless a speaker
said so, it is `inferred`, and every inferred edge or node must carry a rationale. `conflicts_with`
(two positions disagree) may be stated.

## People

`graph_node_person (node_id, speaker_id, role)`. A role only attaches to the node types it makes sense for.

| Role            | Attaches to                                   |
| --------------- | --------------------------------------------- |
| `proposed_by`   | proposal                                      |
| `decided_by`    | decision                                      |
| `owner`         | action, risk                                  |
| `challenged_by` | proposal, decision, claim, action, constraint |
| `asked_by`      | question                                      |
| `answered_by`   | question                                      |
| `raised_by`     | risk, claim, constraint, topic                |
| `mentioned`     | any                                           |

## History, provenance and time travel

Every change is one row in `graph_ops` (`create_node`, `update_node`, `set_status`, `merge_nodes`,
`delete_node`, `add_edge`, `delete_edge`, `link_person`, `unlink_person`, `add_evidence`) written in the
same transaction as the change, with the quotes that justify it in `graph_evidence`.

- Creating a node or edge needs at least one quote. Any other change needs a quote or, for something the
  system worked out itself, a rationale.
- A quote refers to a caption (by session and caption id) and keeps its own copy of the words, because
  Teams keeps rewriting caption text while it is live.
- Evidence is deleted with its caption. After a transcript is deleted, `pruneUnsupported(meetingId)`
  removes nodes and edges that no longer have any evidence. Nothing calls it yet.

**Provenance.** Every change has a `source`: `inferred`, `stated` or `human`, ranked in that order
(`human` highest). A node's or edge's `origin` is the source that created it, and a person's edit makes a
node `human`. A change may only overwrite something of equal or lower rank, so a model can never change
what a person confirmed (`outranked`), and an inferring step can never change what somebody said. A
person's own confirmation is exempt from the "decided/confirmed needs a quote" precondition, since the
confirmation is the evidence.

**Replayable ops.** Each op's `detail` holds everything it changed (a merge lists every edge it moved,
folded or dropped), so `replayGraph(meetingId, ops)` in `contracts` rebuilds the graph from the log alone.
`asOf(meetingId, { opId } | { at })` does that up to a moment, which answers "as it stood at 16:30". An op's
time is when the change was _recorded_, not when it was said. Ops are never rewritten: a merged node's
history is found through `merged_into`, and a folded edge's through `folded_into`.

**Batches.** `apply(commands, { source })` runs many changes in one transaction. A command the rules refuse
is rolled back on its own and reported; the rest apply. `$name` ids refer to nodes created earlier in the
same call (`create_node` with `ref`).

## Merging and deleting

- `mergeNodes` needs two live nodes of the **same meeting and type**. The survivor's status, title and
  attributes win. The loser's edges, people and topic members move to the survivor, and its history shows
  under the survivor; edges that become self-loops or duplicates are folded away. The loser stays as a
  tombstone, so its old id still resolves to the survivor in every store call.
- `deleteNode` and `deleteEdge` hide the row (`deleted_at`) and keep the history.

## Decisions that differ from or add to the first brief

1. **`about` is directional; `alternative_to` is the symmetric one.** A claim is about a topic; a topic is
   not "about" the claim. Two alternatives are alternatives of each other.
2. **Edge endpoint rules were added** (the table above). Without them the graph can hold a topic that
   `mitigates` an entity. Review them; they are one map in `graph-vocabulary.ts`.
3. **Status and edges overlap**, so the preconditions above tie them together instead of trusting two
   copies of one fact.
4. **`decided` needs "an explicit marker in the quote"**; storage cannot read intent, so it only requires
   a quote. Judging the marker belongs to the extractor.
5. **The action ladder** (`committed` needs an owner; otherwise `requested`; with no date either,
   `intent`) is partly enforceable: storage enforces the owner rule. Choosing between `intent` and
   `requested` is the extractor's call, and "no owner → requested" reads oddly, since a request is made to
   someone.
6. **Merge is limited to the same type** (the brief said any type may be merged).
7. **`topic_id` and `about` edges overlap.** `topic_id` is a node's one home topic; `about` can add others.
8. **Provenance was added**: origin and its ranking, confidence, a replayable ops log and evidence.
9. **Tables are prefixed `graph_`**, since the database is shared with other modules.

## Open questions

- Missing roles: nothing records who _requested_ an action (`requested_by`), who _asserted_ a claim
  (`raised_by` is borrowed), or who _confirmed_ a decision.
- Someone mentioned but not in the meeting cannot be linked, because people are speakers. Say so in the
  title, or add an entity kind.
- Cross-meeting links (the same open question on 3 Nov and today) are impossible by design for now.
- Something must call `pruneUnsupported` when a transcript session is deleted.
