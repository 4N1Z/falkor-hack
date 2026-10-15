"use server";
import { cookies } from "next/headers";
import { ZoteroItem } from "../types";
import { uploadPapersToStorage } from "@/lib/storage";
import db from "@/db";
import { papers } from "@/db/schema";
import { auth } from "@/auth";

interface UploadProgress {
  total: number;
  completed: number;
  failed: string[];
  successful: string[];
}

export async function importPapers(
  itemKeys: { key: string; isParent: boolean }[],
  workspaceId: string
) {
  console.log("🚀 Starting paper import process...");

  const session = await auth();
  if (!session || !session.user || !session.user.id) {
    console.error("❌ Authentication failed");
    return {
      status: false,
      message: "Authentication failed",
      data: null,
    };
  }

  console.log(
    `📊 Processing ${itemKeys.length} items for workspace: ${workspaceId}`
  );

  const parentKeys = itemKeys.filter((item) => item.isParent);
  const attachmentKeys = itemKeys.filter((item) => !item.isParent);

  console.log(
    `📑 Found ${parentKeys.length} parent items and ${attachmentKeys.length} direct attachments`
  );

  // Initialize progress tracking
  const progress: UploadProgress = {
    total: itemKeys.length,
    completed: 0,
    failed: [],
    successful: [],
  };

  const parentResults = await processParentItems(
    parentKeys,
    workspaceId,
    session.user.id,
    progress
  );
  const attachmentResults = await processAttachments(
    attachmentKeys,
    workspaceId,
    session.user.id,
    progress
  );

  console.log("✅ Import process completed");
  console.log(`📈 Final Statistics:
    - Total items: ${progress.total}
    - Successfully processed: ${progress.successful.length}
    - Failed: ${progress.failed.length}
    - Success rate: ${(
      (progress.successful.length / progress.total) *
      100
    ).toFixed(2)}%`);

  if (progress.failed.length > 0) {
    console.log("❌ Failed items:", progress.failed);
  }

  return {
    status: true,
    message: "Import complete",
    data: {
      parentResults,
      attachmentResults,
      progress: {
        total: progress.total,
        successful: progress.successful,
        failed: progress.failed,
      },
    },
  };
}

function preparedata(item: ZoteroItem) {
  console.log(`📝 Preparing data for item: ${item.data.key}`);
  const data = {
    title: item.data.title,
    abstract: item.data.abstractNote,
    externalKey: item.data.key,
    doi: item.data.DOI,
    source: "zotero",
  };
  return data;
}

interface ProcessResult {
  status: boolean;
  message: string;
  data: {
    parentData?: any;
    s3Result?: any;
    attachmentKey?: string;
  } | null;
}

async function processParentItems(
  parentKeys: { key: string }[],
  workspaceId: string,
  userId: string,
  progress: UploadProgress
): Promise<ProcessResult[]> {
  console.log(`🔄 Processing ${parentKeys.length} parent items`);
  const cookieStore = cookies();

  try {
    const results = await Promise.all(
      parentKeys.map(async (item) => {
        console.log(`📦 Processing parent item ${item.key}`);
        try {
          console.log(`🔍 Fetching parent item ${item.key}`);
          const parentResponse = await fetch(
            `${process.env.APP_URL}/api/zotero/items/${item.key}`,
            {
              headers: {
                Cookie: cookieStore.toString(),
              },
            }
          );

          if (!parentResponse.ok) {
            progress.failed.push(`Parent-${item.key}`);
            console.error(`❌ Failed to fetch parent item ${item.key}`);
            throw new Error(
              `Failed to fetch parent item: ${parentResponse.statusText}`
            );
          }

          const parentData = await parentResponse.json();
          const parentItemData: ZoteroItem = parentData.data;

          const attachment = parentItemData.links?.attachment;
          if (!attachment || attachment.attachmentType !== "application/pdf") {
            progress.failed.push(`Parent-${item.key}`);
            console.error(`❌ Invalid PDF attachment for ${item.key}`);
            return {
              status: false,
              message: `Invalid PDF attachment for parent item ${item.key}`,
              data: { parentData: parentItemData },
            };
          }

          const attachmentKey = attachment.href?.split("/").pop();
          if (!attachmentKey) {
            progress.failed.push(`Parent-${item.key}`);
            console.error(`❌ Invalid attachment link for ${item.key}`);
            return {
              status: false,
              message: `Invalid attachment link for parent item ${item.key}`,
              data: { parentData: parentItemData },
            };
          }

          console.log(`📤 Uploading attachment for ${item.key}`);
          const [preparedData, fileResponse] = await Promise.all([
            preparedata(parentItemData),
            fetch(
              `${process.env.APP_URL}/api/zotero/items/${attachmentKey}/file`,
              {
                headers: {
                  Cookie: cookieStore.toString(),
                },
              }
            ),
          ]);

          if (!fileResponse.ok) {
            progress.failed.push(`Parent-${item.key}`);
            throw new Error(
              `Failed to fetch file for ${item.key}: ${fileResponse.statusText}`
            );
          }

          const fileBlob = await fileResponse.blob();
          const storageResult = await uploadPapersToStorage(
            fileBlob,
            parentItemData.data.title || `file-${attachmentKey}`,
            "application/pdf"
          );

          if (!storageResult) {
            progress.failed.push(`Parent-${item.key}`);
            throw new Error("Failed to upload file to S3");
          }

          console.log(`💾 Saving to database: ${item.key}`);
          const record = await db.insert(papers).values({
            externalId: preparedData.externalKey,
            externalSource: "zotero",
            title: preparedData.title as string,
            type: "book",
            source: "zotero",
            abstract: preparedData.abstract,
            doi: preparedData.doi,
            uploadUrl: storageResult.url,
            workspaceId,
            fileType: "pdf",
            userId,
          });

          if (!record) {
            progress.failed.push(`Parent-${item.key}`);
            throw new Error(`Failed to insert record for ${item.key}`);
          }

          progress.successful.push(`Parent-${item.key}`);
          progress.completed++;

          console.log(`✅ Successfully processed ${item.key}`);
          console.log(`Progress: ${progress.completed}/${progress.total}`);

          return {
            status: true,
            message: `Processed item ${item.key}`,
            data: {
              parentData: preparedData,
              storageResult,
              attachmentKey,
            },
          };
        } catch (error: any) {
          console.error(`❌ Error processing ${item.key}:`, error);
          return {
            status: false,
            message: error.message || "Processing failed",
            data: null,
          };
        }
      })
    );
    return results;
  } catch (error) {
    console.error("❌ Error in batch processing:", error);
    throw error;
  }
}

async function processAttachments(
  attachmentKeys: { key: string }[],
  workspaceId: string,
  userId: string,
  progress: UploadProgress
) {
  console.log(`🔄 Processing ${attachmentKeys.length} direct attachments`);
  const cookieStore = cookies();

  try {
    const attachmentResults = await Promise.all(
      attachmentKeys.map(async (item) => {
        console.log(`📦 Processing attachment ${item.key}`);
        try {
          const attachmentResponse = await fetch(
            `${process.env.APP_URL}/api/zotero/items/${item.key}`,
            {
              headers: {
                Cookie: cookieStore.toString(),
              },
            }
          );

          if (!attachmentResponse.ok) {
            progress.failed.push(`Attachment-${item.key}`);
            console.error(`❌ Failed to fetch attachment ${item.key}`);
            throw new Error(
              `Failed to fetch attachment: ${attachmentResponse.statusText}`
            );
          }

          const attachmentData = await attachmentResponse.json();
          const attachmentItemData: ZoteroItem = attachmentData.data;

          console.log(`📤 Uploading file ${item.key}`);
          const [preparedData, fileResponse] = await Promise.all([
            preparedata(attachmentItemData),
            fetch(
              `${process.env.APP_URL}/api/zotero/items/${item.key}/file`,
              {
                headers: {
                  Cookie: cookieStore.toString(),
                },
              }
            ),
          ]);

          if (!fileResponse.ok) {
            progress.failed.push(`Attachment-${item.key}`);
            throw new Error(
              `Failed to fetch file for ${item.key}: ${fileResponse.statusText}`
            );
          }

          const fileBlob = await fileResponse.blob();
          const storageResult = await uploadPapersToStorage(
            fileBlob,
            attachmentItemData.data.title || `file-${item.key}`,
            "application/pdf"
          );

          if (!storageResult) {
            progress.failed.push(`Attachment-${item.key}`);
            throw new Error("Failed to upload file to S3");
          }

          console.log(`💾 Saving to database: ${item.key}`);
          const record = await db.insert(papers).values({
            externalId: preparedData.externalKey,
            externalSource: "zotero",
            title: preparedData.title as string,
            type: "book",
            source: "zotero",
            abstract: preparedData.abstract,
            doi: preparedData.doi,
            uploadUrl: storageResult.url,
            workspaceId,
            fileType: "pdf",
            userId,
          });

          if (!record) {
            progress.failed.push(`Attachment-${item.key}`);
            throw new Error(`Failed to insert record for ${item.key}`);
          }

          progress.successful.push(`Attachment-${item.key}`);
          progress.completed++;

          console.log(`✅ Successfully processed ${item.key}`);
          console.log(`Progress: ${progress.completed}/${progress.total}`);

          return {
            status: true,
            message: `Processed item ${item.key}`,
            data: {
              parentData: preparedData,
              storageResult,
              attachmentKey: item.key,
            },
          };
        } catch (error: any) {
          console.error(`❌ Error processing ${item.key}:`, error);
          return {
            status: false,
            message: error.message || "Processing failed",
            data: null,
          };
        }
      })
    );
    return attachmentResults;
  } catch (error) {
    console.error("❌ Error in processAttachments:", error);
    throw error;
  }
}
