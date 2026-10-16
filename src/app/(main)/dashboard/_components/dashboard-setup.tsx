"use client";

// import {  } from "@/auth";
import React, { useState } from "react";
import { FieldValues, SubmitHandler, useForm } from "react-hook-form";
import { v4 } from "uuid";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Subscription, workspace } from "@/db/database.types";
import { Button } from "@/components/ui/button";
import { createWorkspace } from "@/db/actions/action-workspace";
import { useRouter } from "next/navigation";
import { useAppState } from "@/lib/providers/state-providers";
import { WorkspaceFormSchema } from "@/lib/types";
import { z } from "zod";
import { toast } from "sonner";
import { createClient } from "@/utils/supabase/client";
import EmojiPicker from "@/components/emoji-picker";
import { Loader } from "lucide-react";
import Image from "next/image";
import { User } from "next-auth";

interface DashboardSetupProps {
  user: User;
  subscription: Subscription | null;
}

const DashboardSetup: React.FC<DashboardSetupProps> = ({
  subscription,
  user,
}) => {
  const router = useRouter();

  // console.log("#ERROR 4.2: Add Workspace, instantiating Dispatch")

  const { dispatch } = useAppState();
  const [selectedEmoji, setSelectedEmoji] = useState("💼");
  const [uploaded, setUploaded] = useState<String>("");

  // TODO : Possiblility of error : 70%

  const supabase = createClient();

  const {
    register,
    handleSubmit,
    reset,
    formState: { isSubmitting: isLoading, errors },
  } = useForm<z.infer<typeof WorkspaceFormSchema>>({
    mode: "onChange",
    defaultValues: {
      logo: "",
      workspaceName: "",
    },
  });

  // TODO :S3 AWS CALLING HERE
  const onSubmit: SubmitHandler<z.infer<typeof WorkspaceFormSchema>> = async (
    value
  ) => {
    const file = value.logo?.[0];
    const workspaceId = v4();
    let filePath = null;

    try {
      if (file) {
        const { data, error } = await supabase.storage
          .from("workspace")
          .upload(`workspace.${workspaceId}`, file, {
            cacheControl: "3600",
            upsert: true,
          });

        if (error) {
          console.error("Error while uploading:", error);
          throw new Error("File upload failed");
        }

        const { data: fileData } = await supabase.storage
          .from("workspace")
          .getPublicUrl(data?.path);

        setUploaded(fileData?.publicUrl || "");
        filePath = data?.path || null;
      } else {
        console.warn("No file uploaded");
      }
      // TODO : Future, check to see if the URL needs to be appended or not.
      // TODO :  As of now only file_path is added to DB.

      const newWorkspace: workspace = {
        createdAt: new Date().toISOString(),
        iconId: selectedEmoji,
        id: workspaceId,
        inTrash: "",
        title: value.workspaceName,
        workspaceOwner: user.id!,
        logo: filePath || null,
        bannerUrl: "",
        updatedAt: new Date().toISOString(),
      };

      const { data, error: createError } = await createWorkspace(newWorkspace);
      console.log("The data from Workspace : ", data);

      if (createError) {
        console.error("Error creating workspace:", createError);
        throw new Error("Workspace creation failed");
      }

      // For local updates only - internal state-management.
      dispatch({
        type: "ADD_WORKSPACE",
        payload: { ...newWorkspace, folders: [] },
      });

      toast.success(`${newWorkspace.title} has been created successfully.`);
      router.replace(`/dashboard/${newWorkspace.id}`);
    } catch (error) {
      console.error("Error:", error);
      toast.error("Could not create your workspace. Please try again later.");
    } finally {
      reset();
    }
  };
  return (
    <Card
      className={`w-[800px]
      h-screen
         rounded-xl
    bg-[linear-gradient(0deg,rgba(255,255,255,0.70)_0%,rgba(255,255,255,0.70)_100%),linear-gradient(140deg,#FFF_24.44%,#93C7FB_92.29%)]
    backdrop-blur-sm
    shadow-[inset_0px_0px_10.941px_rgba(238,244,251,0.50),0px_0px_13.677px_rgba(109,205,247,0.52)]
    ring-4 ring-white/40
    border-2 border-sky-100
    relative overflow-hidden

      sm:h-auto`}
    >
      <CardHeader>
        <CardTitle className="text-primary pb-2">Create A Workspace</CardTitle>
        <CardDescription>
          Lets create a private workspace to get you started.You can add
          collaborators later from the workspace settings tab.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="flex flex-col gap-4">
            <div
              className="flex
            items-center
            gap-4"
            >
              <div className="text-3xl">
                <EmojiPicker getValue={(emoji) => setSelectedEmoji(emoji)}>
                  {selectedEmoji}
                </EmojiPicker>
              </div>
              <div className="w-full ">
                <Label
                  htmlFor="workspaceName"
                  className="text-sm
                  text-muted-foreground
                "
                >
                  Name
                </Label>
                <Input
                  id="workspaceName"
                  type="text"
                  className="w-full p-2 text-lg font-medium  rounded-md
                  bg-white/5 backdrop-blur-sm text-primary placeholder:text-secondary-foreground
                  focus:outline-none outline-none
                  transition-colors duration-150"  
                  placeholder="Workspace Name"
                  disabled={isLoading}
                  {...register("workspaceName", {
                    required: "Workspace name is required",
                  })}
                />
                <small className="text-red-600">
                  {errors?.workspaceName?.message?.toString()}
                </small>
              </div>
            </div>
            <div>
              <Label
                htmlFor="logo"
                className="text-sm
                  text-muted-foreground
                "
              >
                Workspace Logo
              </Label>
              <Input
                id="logo"
                type="file"
                accept="image/*"
                placeholder="Workspace Name"
                // disabled={isLoading || subscription?.status !== 'active'}
                {...register("logo", {
                  required: false,
                })}
              />
              <small className="text-red-600">
                {errors?.logo?.message?.toString()}
              </small>
              {subscription?.status !== "active" && (
                <small
                  className="
                  text-muted-foreground
                  block
              "
                >
                  To customize your workspace, you need to be on a Pro Plan
                </small>
              )}
            </div>
            <div>
              Workspce uplaoded image
              {uploaded && (
                <Image
                  src={uploaded as string}
                  alt=""
                  height={120}
                  width={120}
                  className="my-5 max-w-[400px]"
                />
              )}
            </div>
            <div className="self-end">
              <Button disabled={isLoading} type="submit">
                {!isLoading ? (
                  "Create Workspace"
                ) : (
                  <Loader className="animate-spin" size={16} />
                )}
              </Button>
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};

export default DashboardSetup;
