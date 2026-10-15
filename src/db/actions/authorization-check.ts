import { and, eq } from "drizzle-orm";
import db from "..";

export async function checkWorkspaceAccess(
  workspaceId: string,
  userId: string
) {
  // First check if user is the workspace owner
  const workspace = await db.query.workspaces.findFirst({
    where: (workspace, { eq }) =>
      and(eq(workspace.id, workspaceId), eq(workspace.workspaceOwner, userId)),
  });

  if (workspace) return true;

  // If not owner, check if user is a collaborator
  const collaborator = await db.query.collaborators.findFirst({
    where: (collaborator, { eq }) =>
      and(
        eq(collaborator.workspaceId, workspaceId),
        eq(collaborator.userId, userId)
      ),
  });

  return !!collaborator;
}

export async function checkFileAccess(fileId: string, userId: string) {
  // Get file details including workspace
  const file = await db.query.files.findFirst({
    where: (files, { eq }) => eq(files.id, fileId),
    with: {
      workspace: true,
    },
  });

  if (!file) return false;

  // Check workspace access
  return checkWorkspaceAccess(file.workspaceId, userId);
}
