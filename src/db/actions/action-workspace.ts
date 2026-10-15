"use server";

import db from "..";
import {
  folders,
  users,
  workspaces,
  files,
} from "../../../supabase/migrations/schema";
import { Folder, User, workspace, File } from "../database.types";
import { validate } from "uuid";
import { collaborators } from "../schema";
import { and, eq, notExists } from "drizzle-orm";
import { title } from "process";

export const createWorkspace = async (workspace: workspace) => {
  try {
    const response = await db.insert(workspaces).values(workspace);
    console.log("workspcaee created :: ", response);
    return { data: null, error: null };
  } catch (error) {
    console.log(error);
    return { data: null, error: "Error" };
  }
};

export const deleteWorkspace = async (workspaceId: string) => {
  if (!workspaceId) return;
  await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
};

export async function getWorkspaceDetail(workspacecId: string) {
  const isValid = validate(workspacecId);
  if (!isValid) {
    return {
      data: [],
      error: "Error",
    };
  }
  try {
    const result = (await db
      .select({
        id:workspaces.id,
        title:workspaces.title,
        workspaceOwner : workspaces.workspaceOwner
      })
      .from(workspaces)
      .where(eq(workspaces.id, workspacecId)).limit(1)) as workspace[];

    return { data: result, error: null };
  } catch (e) {
    console.log("Error while fetching workspace details", e);
    return { data: [], error: "Error" };
  }
}



export const getPrivateWorkspaces = async (userId: string) => {
  // This takes only the workspaces which doesn't have any collaborators in the table.
  // it checks if there are anny collaborators in it an
  //  and sorts the workspace


  if (!userId) return [];
  
  const privateWorkspaces = (await db
    .select({
      id: workspaces.id,
      createdAt: workspaces.createdAt,
      workspaceOwner: workspaces.workspaceOwner,
      title: workspaces.title,
      iconId: workspaces.iconId,

      inTrash: workspaces.inTrash,
      logo: workspaces.logo,
      bannerUrl:workspaces.bannerUrl
    })
    .from(workspaces)
    .where(
      and(
        notExists(
          db
            .select()
            .from(collaborators)
            .where(eq(collaborators.workspaceId, workspaces.id))
        ),
        eq(workspaces.workspaceOwner, userId)
      )
    )) as workspace[];

  return privateWorkspaces;
};

export const getCollaborativeWorkspaces = async (userId: string) => {
  // to fetch the workspces, but not owned by them.
  //  Different user, but they are the collboaratod 

  if (!userId) return [];
  const collaborativeWorkspaces = (await db
    .select({
      id: workspaces.id,
      createdAt: workspaces.createdAt,
      workspaceOwner: workspaces.workspaceOwner,
      title: workspaces.title,
      iconId: workspaces.iconId,
      inTrash: workspaces.inTrash,
      logo: workspaces.logo,
      bannerUrl:workspaces.bannerUrl

    })
    .from(users)
    .innerJoin(collaborators, eq(users.id, collaborators.userId))
    .innerJoin(workspaces, eq(collaborators.workspaceId, workspaces.id))
    .where(eq(users.id, userId))) as workspace[];

  return collaborativeWorkspaces;
};

export const getSharedWorkspaces = async (userId: string) => {
  // to get the workspace which is owned by them, but it can be shared.
  //  they can also add collaborators to that
  
  if (!userId) return [];
  const sharedWorkspaces = (await db
    .selectDistinct({
      id: workspaces.id,
      createdAt: workspaces.createdAt,
      workspaceOwner: workspaces.workspaceOwner,
      title: workspaces.title,
      iconId: workspaces.iconId,
      inTrash: workspaces.inTrash,
      logo: workspaces.logo,
      bannerUrl:workspaces.bannerUrl

    })
    .from(workspaces)
    .orderBy(workspaces.createdAt)
    .innerJoin(collaborators, eq(workspaces.id, collaborators.workspaceId))
    .where(eq(workspaces.workspaceOwner, userId))) as workspace[];

  return sharedWorkspaces;
};

export async function updateWorkspace(
  workspace: Partial<workspace>,
  workspaceId: string
) {
  if (!workspaceId) return;
  try {
    await db
      .update(workspaces)
      .set(workspace)
      .where(eq(workspaces.id, workspaceId));

    // revalidatePath(`/dashboard/${workspaceId}`);
    return { data: null, error: null };
  } catch (e) {
    console.log("Error while updating workspace : ", e);
    return { data: null, error: "Error" };
  }
}


export const getUserWorkspaceCount = async (userId: string) => {
  try {
    const count = await db.$count(workspaces, 
      eq(workspaces.workspaceOwner, userId)
    );
    return { data: count, error: null };
  } catch (error) {
    console.error("Error getting workspace count:", error);
    return { data: null, error: "Error counting workspaces" };
  }
};


export const getFolders = async (workspaceId: string) => {
  const isValid = validate(workspaceId);

  if (!isValid) {
    return { data: null, error: "Error" };
  }

  try {
    const results: Folder[] | [] = await db
      .select()
      .from(folders)
      .orderBy(folders.createdAt)
      .where(eq(folders.workspaceId, workspaceId));

    return { data: results, error: null };
  } catch (error) {
    return { data: null, error: "Error" };
  }
};

export const addCollaborators = async (users: User[], workspaceId: string) => {
  const response = users.forEach(async (user: User) => {
    const userExist = await db.query.collaborators.findFirst({
      where: (u, { eq }) =>
        and(eq(u.userId, user.id), eq(u.workspaceId, workspaceId)),
    });

    if (!userExist) {
      await db.insert(collaborators).values({
        workspaceId,
        userId: user.id,
      });
    }
  });
};


export async function removeCollaborators(users: User[], workspaceId: string) {
  const response = users.forEach(async (user: User) => {
    const userExists = await db.query.collaborators.findFirst({
      where: (u, { eq }) =>
        and(eq(u.userId, user.id), eq(u.workspaceId, workspaceId)),
    });
    if (userExists)
      await db
        .delete(collaborators)
        .where(
          and(
            eq(collaborators.workspaceId, workspaceId),
            eq(collaborators.userId, user.id)
          )
        );
  });
}

export async function createFolder(folder: Folder) {
  // insert the value we sent into the folders, which is the original schema for supabase
  try {
    const results = await db.insert(folders).values(folder);

    console.log("Created New folder :: ", results);
    return { data: null, error: null };
  } catch (e) {
    console.log("Error while creating Folders : ", e);
    return { data: null, error: "Error while creating Folder" };
  }
}

export async function updateFolder(folder: Partial<Folder>, folderId: string) {
  console.log("IN update folder");
  try {
    await db.update(folders).set(folder).where(eq(folders.id, folderId));
    return { data: null, error: null };
  } catch (e) {
    console.log("Error while updating : ", e);
    return { data: null, error: "Error While updating DB" };
  }
}

export async function getFolderDetails(folderId: string) {
  const isValid = validate(folderId);
  if (!isValid) return { data: [], error: "Error" };

  try {
    const response = (await db
      .select()
      .from(folders)
      .where(eq(folders.id, folderId))
      .limit(1)) as Folder[];

    return { data: response, error: null };
  } catch (e) {
    console.log("error while retrieving Folder : ", e);
    return { data: [], error: "Error" };
  }
}

export async function getFileDetails(fileId: string) {
  const isValid = validate(fileId);

  if (!isValid) return { data: [], error: "Error" };

  try {
    const response = (await db
      .select()
      .from(files)
      .where(eq(files.id, fileId))
      .limit(1)) as File[];

    return { data: response, error: null };
  } catch (e) {
    console.log("error while retrieving Files : ", e);
    return { data: [], error: "Error" };
  }
}
export async function createFile(file: File) {
  try {
    await db.insert(files).values(file);
    return { data: null, error: null };
  } catch (error) {
    console.log(error);
    return { data: null, error: "Error" };
  }
}

export const updateFile = async (file: Partial<File>, fileId: string) => {
  try {
    const response = await db
      .update(files)
      .set(file)
      .where(eq(files.id, fileId));
    return { data: null, error: null };
  } catch (error) {
    console.log(error);
    return { data: null, error: "Error" };
  }
};
