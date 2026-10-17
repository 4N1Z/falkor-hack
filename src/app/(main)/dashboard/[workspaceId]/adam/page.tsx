import { auth } from "@/auth";
import AdamWorkbench from "@/components/adam/adam-workbench";
import { getWorkspaceDetail } from "@/db/actions/action-workspace";
import { redirect } from "next/navigation";

/** Adam: the research-agent system (docs/adam-spec-creation.md) for this workspace. */
export default async function AdamPage(props: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await props.params;
  const session = await auth();
  if (!session?.user) redirect("/login");
  const { data, error } = await getWorkspaceDetail(workspaceId);
  if (error || !data.length) redirect("/dashboard");
  return <AdamWorkbench workspaceId={workspaceId} />;
}
