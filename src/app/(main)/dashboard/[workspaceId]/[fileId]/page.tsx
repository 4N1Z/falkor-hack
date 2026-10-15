import { redirect } from "next/navigation";
import { getFileDetails } from "@/db/actions/action-workspace";
import NovelTailwindEditore from "@/components/novel/Editore";
import NeuraAIBlock from "@/components/AI/neura-ai-block";
import { auth } from "@/auth";

export default async function FilePage({
  params,
}: {
  params: { fileId: string };
}) {

  // const session = await auth();
  // if (!session?.user || session === null) redirect("/login");
  
  const { data, error } = await getFileDetails(params.fileId);  
  // if (error || !data.length) redirect("/dashboard");

  // console.log("IN file ID :: ,", data);
  return (
    <div className="relative ">
      {/* <div>
      {JSON.stringify(data)}
      <h1 className="text-2xl font-bold">{data[0].title}</h1>

      </div> */}
      <NovelTailwindEditore
        dirType="file"
        fileId={params.fileId}
        dirDetails={data[0] || {}}
        folderId={data[0].folderId}
      />
      <NeuraAIBlock />
    </div>
  );
}
