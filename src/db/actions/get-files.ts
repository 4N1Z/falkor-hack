"use server";

import { desc, eq } from "drizzle-orm";
import db from "@/db/index";
import { validate } from "uuid";

import { Folder, File } from "@/db/database.types";
import { files, folders } from "../schema";

export const getFiles = async (folderId: string) => {
  const isValid = validate(folderId);

  if (!isValid) return { data: null, error: "Error" };
  try {
    const results = (await db
      .select()
      .from(files)
      .orderBy(files.createdAt)
      .where(eq(files.folderId, folderId))) as File[] | [];

    console.log("Getting FILes ::", results.map((index)=>index.title));

    return { data: results, error: null };
  } catch (error) {
    console.log(error);
    return { data: null, error: "Error" };
  }
};

export const getLatestFiles = async (workspaceId: string) => {
  if (!workspaceId) return;
  try {
    const latestFiles = (await db
      .select(
        {
          id:files.id,
          title:files.title,
          updatedAt:files.updatedAt,
          iconId:files.iconId,
          createdAt:files.createdAt
        }
      )
      .from(files)
      .orderBy(desc(files.createdAt)).limit(4)
      .where(eq(files.workspaceId, workspaceId))) as File[] | [];
    return { data: latestFiles, error: null };
  } catch (error) {
    console.log(error);
    return { data: null, error: "Error" };
  }
};



export const updateFolder = async (
  folder: Partial<Folder>,
  folderId: string
) => {
  try {
    await db.update(folders).set(folder).where(eq(folders.id, folderId));
    return { data: null, error: null };
  } catch (error) {
    console.log(error);
    return { data: null, error: "Error" };
  }
};

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

export const deleteFile = async (fileId: string) => {
  if (!fileId) return;
  await db.delete(files).where(eq(files.id, fileId));
};

export const deleteFolder = async (folderId: string) => {
  if (!folderId) return;
  await db.delete(files).where(eq(files.id, folderId));
};

export const getFileData = async (fileId: string) => {
  if (!fileId) return { data: null, error: null };

  const isValid = validate(fileId);
  if (!isValid) return { data: null, error: "Error" };

  try {
    const data = (await db
      .select({ data: files.data })
      .from(files)
      .where(eq(files.id, fileId))) as Partial<File[]>;
      
    return { data: data, error: null };
  } catch (error) {
    console.log(error);
    return { data: null, error: "Error" };
  }
};
