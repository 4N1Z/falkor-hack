import ResearchGraphView from "@/components/graph/research-graph-view";

/** The workspace's research graph (FalkorDB) and what the agents did on it. */
export default async function ResearchGraphPage(props: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await props.params;
  return <ResearchGraphView workspaceId={workspaceId} />;
}
