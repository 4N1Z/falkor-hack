"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateFile } from "@/db/actions/action-workspace";
import { useAppState } from "@/lib/providers/state-providers";
import { UploadBannerSchema } from "@/lib/types";
import { createClient } from "@/utils/supabase/client";
import { Loader } from "lucide-react";
import { useState } from "react";
import { SubmitHandler, useForm } from "react-hook-form";
import { z } from "zod";

interface BannerUploadFormProps {
  dirType: "file" ;
  id: string;
}

export default function BannerUploadForm({
  dirType,
  id,
}: BannerUploadFormProps) {
  const supabase = createClient();
  const { state, dispatch, folderId, workspaceId } = useAppState();
  const [uploadedImage, setUploadedImage] = useState<string>("");

  const {
    register,
    handleSubmit,
    reset,
    formState: { isSubmitting: isUploading, errors },
  } = useForm<z.infer<typeof UploadBannerSchema>>({
    mode: "onChange",
    // resolver: zodResolver(UploadBannerSchema),
    defaultValues: {
      banner: "",
    },
  });

  const onSubmitHandler: SubmitHandler<
    z.infer<typeof UploadBannerSchema>
  > = async (values) => {
    const file = values.banner?.[0];
    if (!file || !id) return;
    try {
      let filePath = null;

      //   TODO : if uploading again, use v4 to create new id after deleting aleady existing one.
      // TODO : if there is any issues

      const uploadBanner = async () => {
        const { data, error } = await supabase.storage
          .from("workspaceBanner")
          .upload(`workspaceBanner-${id}`, file, {
            cacheControl: "5",
            upsert: true,
          });

        // console.log("Banner Uploaded: ", data);
        // setUploadedImage(data?.path as string);

        if (error) throw new Error();
        filePath = data.path;
      };
      if (dirType === "file") {
        if (!workspaceId || !folderId) return;
        await uploadBanner();
        dispatch({
          type: "UPDATE_FILE",
          payload: {
            file: { bannerUrl: filePath ,updatedAt:new Date().toISOString()},
            fileId: id,
            folderId,
            workspaceId,
          },
        });
        await updateFile({ bannerUrl: filePath }, id);
      } 
    } catch (error) {}
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmitHandler)}
      className="flex flex-col gap-2"
    >
      <Label className="text-sm text-muted-foreground" htmlFor="bannerImage">
        Banner Image
      </Label>
      <Input
        id="bannerImage"
        type="file"
        accept="image/*"
        disabled={isUploading}
        {...register("banner", { required: "Banner Image is required" })}
      />
      <small className="text-red-600">
        {errors.banner?.message?.toString()}
      </small>
      <Button disabled={isUploading} type="submit">
        {!isUploading ? (
          "Upload Banner"
        ) : (
          <Loader className="animate-spin " size={16} />
        )}
      </Button>
      {/* {uploadedImage ? (
        <Image
          src={uploadedImage}
          fill
          className="w-full md:h-48 h-20 object-contain"
          alt="Banner Image"
        />
      ) : (
        "no banner image uploaded"
      )} */}
    </form>
  );
}
