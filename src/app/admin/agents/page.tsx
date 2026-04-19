import { getPipelineMap } from "@/lib/admin-queries";
import { PipelineMap } from "../pipeline/pipeline-map";

export const dynamic = "force-dynamic";

export default async function AgentsWorkflowsPage() {
  let pipelineMap: Awaited<ReturnType<typeof getPipelineMap>> = {
    stages: [],
    generated_at: new Date().toISOString(),
  };

  try {
    pipelineMap = await getPipelineMap();
  } catch (err) {
    console.error("AgentsWorkflowsPage: pipeline map load failed", err);
  }

  return (
    <section className="flex flex-col gap-4">
      <PipelineMap data={pipelineMap} />
    </section>
  );
}
