import { auth } from "@/auth";
import { checkWorkspaceAccess } from "@/db/actions/authorization-check";
import { NextResponse } from "next/server";
import { validate } from "uuid";

/** Signed in + member (owner or collaborator) of the workspace, or an error response. */
export async function requireWorkspaceMember(workspaceId: string | null | undefined) {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) } as const;
  }
  if (!workspaceId || !validate(workspaceId)) {
    return { error: NextResponse.json({ error: "workspaceId is required" }, { status: 400 }) } as const;
  }
  if (!(await checkWorkspaceAccess(workspaceId, session.user.id))) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) } as const;
  }
  return { userId: session.user.id, workspaceId } as const;
}
