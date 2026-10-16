/**
 * Hocuspocus collaboration server for the Tiptap/Yjs editor.
 *
 * Runs as its own container (Dockerfile `ws` stage) behind Traefik at /ws.
 * Every socket must present a token from /api/collab-token, and the user it
 * identifies must have access to the document being opened — document names
 * are file ids, which appear in URLs, so without this check anyone holding a
 * file id could read and write that document live.
 */
import { Hocuspocus } from "@hocuspocus/server";
import postgres from "postgres";
import { verifyCollabToken } from "../src/lib/collab-token.js";

const PORT = Number(process.env.HOCUSPOCUS_PORT ?? 1414);
const AUTH_SECRET = process.env.AUTH_SECRET;
const DATABASE_URL = process.env.DATABASE_URL;

if (!AUTH_SECRET) throw new Error("AUTH_SECRET is required");
if (!DATABASE_URL) throw new Error("DATABASE_URL is required");

// max: 2 — this process only ever runs short authorisation lookups.
const sql = postgres(DATABASE_URL, { max: 2 });

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Workspace owner or an explicit collaborator on the file's workspace. */
async function userCanAccessFile(fileId: string, userId: string) {
  const rows = await sql`
    select 1
    from files f
    join workspaces w on w.id = f.workspace_id
    left join collaborators c
      on c.workspace_id = w.id and c.user_id = ${userId}::uuid
    where f.id = ${fileId}::uuid
      and (w.workspace_owner = ${userId}::uuid or c.id is not null)
    limit 1
  `;
  return rows.length > 0;
}

const server = new Hocuspocus({
  port: PORT,
  async onAuthenticate({ token, documentName }) {
    if (!token) throw new Error("Missing token");

    const payload = verifyCollabToken(token, AUTH_SECRET);
    if (!payload) throw new Error("Invalid or expired token");

    // Reject the client's 'default' fallback and anything non-uuid outright.
    if (!UUID_RE.test(documentName)) {
      throw new Error("Invalid document");
    }

    if (!(await userCanAccessFile(documentName, payload.sub))) {
      throw new Error("Forbidden");
    }

    // Returned context is available to later hooks and awareness.
    return { userId: payload.sub };
  },
});

server.listen();
console.log(`[hocuspocus] listening on ${PORT}`);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    console.log(`[hocuspocus] ${signal}, shutting down`);
    try {
      await server.destroy();
      await sql.end({ timeout: 5 });
    } finally {
      process.exit(0);
    }
  });
}
