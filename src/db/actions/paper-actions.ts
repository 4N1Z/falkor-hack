// lib/db/papers.ts
import { validate } from "uuid";
import { papers} from "@/db/schema";
import db from "@/db/index";


interface AddPaperParams {
  uploadUrl: string;
  userId: string;
  workspaceId: string;
  title: string;
  fileType?: string;
  abstract?: string;
  fileId?: string;

}


export const addPaper = async ({
  uploadUrl,
  userId,
  workspaceId,
  fileId,
  title,
  fileType = "pdf",
  abstract = "",

}: AddPaperParams) => {
  // Validate required IDs
  if (!validate(userId) || !validate(workspaceId)) {
    return { 
      data: null, 
      error: "Invalid user ID or workspace ID" 
    };
  }

  try {
    // Insert new paper
    const [newPaper] = await db
      .insert(papers)
      .values({
        externalId:null,
        externalSource:"manual",
        title:title || `Untited Paper_${new Date().toISOString()}`,
        type:"book",
        source:"manual",
        abstract:abstract,
        doi:null,
        uploadUrl:uploadUrl,
        fileType:fileType,
        userId:userId,
        workspaceId:workspaceId,
        fileId:fileId || null
      })
      .returning();

      console.log("Returning after upload :", newPaper)

    return {
      data: newPaper,
      error: null
    };

  } catch (error) {
    console.error("Error adding paper:", error);
    return {
      data: null,
      error: error instanceof Error ? error.message : "Failed to add paper"
    };
  }
};