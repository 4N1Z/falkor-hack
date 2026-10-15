export const dynamic = "force-dynamic";
import { cookies } from "next/headers";
import ConnectZoteroButton from "./connectZoteroButton";
import { Button } from "../../ui/button";
import { cn } from "@/lib/utils";
import { researchPaperLogo } from "@/lib/dashboard-logos";
import Image from "next/image";
import { dashboardCardStyle } from "@/lib/styles";
import { UploadIcon } from "lucide-react";
export default function UploadResearchPaperButton({
  callback,
}: {
  callback: string;
}) {

  return (
    <div>
      <form
        action={async () => {
          // add the research paper to the database
          "use server";
          console.log("add research paper");
        }}
      >
        <Button size={'sm'} className={`text-sm`} variant={'link'}>
          <UploadIcon size={16}/>
          Upload
        </Button>
      </form>
    </div>
  );
}
