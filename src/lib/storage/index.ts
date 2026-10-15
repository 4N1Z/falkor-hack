"use server"
import { createClient } from "@/utils/supabase/server";

export async function uploadPapersToStorage(
  file: Blob,
  filename: string,
  contentType: string
) {

  "use server"
  console.log(":: Connecting to Supabase Storage ::");
  const supabase = await createClient();
  try {
    console.log(":: Uploading to Supabase Storage ::");
    const { data, error } = await supabase.storage
      .from("papers")
      .upload(filename, file, {
        cacheControl: "3600",
        upsert: true,
      });

      console.log("Supabase Data : Papers", data)
    if (data) {
      console.log("Uploaded to storage :: ", data);
      const { data: fileData } = supabase.storage
        .from("papers")
        .getPublicUrl(data?.path);
      if (!fileData?.publicUrl) {
        console.log("Error in getting public url:", fileData?.publicUrl);
        console.log(`Error getting public url of ${filename} from storage `);
        throw new Error("Error in uploading to storage");
      }
      return {
        success: true,
        url: fileData.publicUrl,
        key: data.id,
      };
    }
    if (error) {
      console.log(`Error in uploading ${filename} to storage :: `, error);
      throw new Error("Error in uploading to storage");
    }
  } catch (error) {
    console.error("Error in uploadPapersToStorage:", error);
    throw error;
  }
}
