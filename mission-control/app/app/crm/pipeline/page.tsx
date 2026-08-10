import { CrmWorkspace } from "../_components/CrmWorkspace";

export const dynamic = "force-dynamic";

const crm = require("../../../../lib/crm");

export default async function CrmPipelinePage({
  searchParams,
}: {
  searchParams?: Promise<{ project?: string }>;
}) {
  const params = searchParams ? await searchParams : {};
  const project = params?.project || "pipeline";
  const board = crm.getPipelineBoard({ project });
  const projectCatalog = crm
    .getProjectCatalog()
    .map((entry: string | { name: string }) => (typeof entry === "string" ? entry : entry.name))
    .filter(Boolean);
  const affiliates = crm.listPipelineAffiliates();

  return (
    <CrmWorkspace
      mode="pipeline"
      initialPipelineData={{
        grouped: board?.grouped || {},
        statuses: board?.statuses || [],
        allStatuses: board?.allStatuses || [],
        project,
        projectCatalog,
        affiliates,
        columnAutomationMap: board?.stageAutomationMap || {},
        summary: board?.summary || {},
      }}
    />
  );
}
