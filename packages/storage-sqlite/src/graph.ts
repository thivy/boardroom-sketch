import {
  GraphRuleError,
  type CommandResult,
  type CreateNodeInput,
  type GraphStore,
} from "@app/contracts";
import type { DatabaseSync } from "node:sqlite";
import { migrate } from "./database";
import { createGraphCommands } from "./graph-commands";
import { createGraphQueries } from "./graph-queries";
import { graphMigration } from "./graph-schema";
import type { Run } from "./graph-rules";
import { inTransaction, prepareGraphStatements } from "./graph-statements";
import { transcriptsMigration } from "./transcripts-schema";

/**
 * Keeps a meeting's graph in the shared database (see `openDatabase`). It composes the queries (how
 * the graph is read) with the commands (how it is changed, always in one transaction and logged).
 */
export function graphSqlite(db: DatabaseSync): GraphStore {
  // The graph points at meetings, speakers and captions, so their tables come first.
  migrate(db, transcriptsMigration);
  migrate(db, graphMigration);

  const statements = prepareGraphStatements(db);
  const { countLiveNodes, clearOps, clearNodes, pruneEdges, pruneNodes } = statements;
  const queries = createGraphQueries(statements);
  const { nodeById, edgeById } = queries;
  const { execute, single, lastOpId } = createGraphCommands(db, statements, queries);

  const transaction = <T>(work: () => T): T => inTransaction(db, work);

  return {
    async createNode(input) {
      return single({ kind: "create_node", input: input as CreateNodeInput }, (o) =>
        nodeById(o.nodeId!),
      );
    },
    async updateNode(input) {
      return single({ kind: "update_node", input }, (o) => nodeById(o.nodeId!));
    },
    async setStatus(input) {
      return single({ kind: "set_status", input }, (o) => nodeById(o.nodeId!));
    },
    async mergeNodes(input) {
      return single({ kind: "merge_nodes", input }, (o) => nodeById(o.nodeId!));
    },
    async deleteNode(input) {
      single({ kind: "delete_node", input }, () => undefined);
    },
    async addEdge(input) {
      return single({ kind: "add_edge", input }, (o) => edgeById(o.edgeId!));
    },
    async deleteEdge(input) {
      single({ kind: "delete_edge", input }, () => undefined);
    },
    async linkPerson(input) {
      return single({ kind: "link_person", input }, (o) => nodeById(o.nodeId!));
    },
    async unlinkPerson(input) {
      return single({ kind: "unlink_person", input }, (o) => nodeById(o.nodeId!));
    },
    async addEvidence(input) {
      single({ kind: "add_evidence", input }, () => undefined);
    },

    async apply(commands, defaults) {
      return transaction(() => {
        const run: Run = { source: defaults?.source ?? "stated", refs: new Map() };
        const results: CommandResult[] = [];
        for (const command of commands) {
          db.exec("SAVEPOINT command");
          try {
            const outcome = execute(command, run);
            db.exec("RELEASE command");
            results.push({ ok: true, ...outcome, opId: lastOpId() });
          } catch (error) {
            db.exec("ROLLBACK TO command");
            db.exec("RELEASE command");
            if (!(error instanceof GraphRuleError)) throw error;
            results.push({ ok: false, code: error.code, message: error.message });
          }
        }
        return results;
      });
    },

    async pruneUnsupported(meetingId) {
      return transaction(() => {
        pruneEdges.run(meetingId);
        return Number(pruneNodes.run(meetingId).changes);
      });
    },

    async clearGraph(meetingId) {
      return transaction(() => {
        const live = (countLiveNodes.get(meetingId) as { n: number }).n;
        clearOps.run(meetingId);
        clearNodes.run(meetingId);
        return live;
      });
    },

    ...queries.reads,
  };
}
