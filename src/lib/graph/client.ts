import { FalkorDB, type Graph } from "falkordb";
import { ensureSchema } from "./schema";

// FalkorDB client is Node-only (TCP). Any route importing this must use the nodejs runtime.
// Cached on globalThis so Next dev HMR doesn't open a new connection per reload.
const globalForFalkor = globalThis as unknown as {
  falkor?: Promise<FalkorDB>;
  falkorSchemaReady?: Set<string>;
};

export function getFalkor(): Promise<FalkorDB> {
  if (!globalForFalkor.falkor) {
    const url = process.env.FALKORDB_URL;
    if (!url) throw new Error("FALKORDB_URL is not set");
    globalForFalkor.falkor = FalkorDB.connect({ url }).catch((err) => {
      globalForFalkor.falkor = undefined;
      throw err;
    });
  }
  return globalForFalkor.falkor;
}

export const workspaceGraphName = (workspaceId: string) => `ws:${workspaceId}`;

/** One isolated graph per workspace (FalkorDB multi-graph tenancy). Indexes are created on first use. */
export async function getWorkspaceGraph(workspaceId: string): Promise<Graph> {
  const db = await getFalkor();
  const name = workspaceGraphName(workspaceId);
  const graph = db.selectGraph(name);

  globalForFalkor.falkorSchemaReady ??= new Set();
  if (!globalForFalkor.falkorSchemaReady.has(name)) {
    await ensureSchema(graph);
    globalForFalkor.falkorSchemaReady.add(name);
  }
  return graph;
}
