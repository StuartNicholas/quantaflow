import { supabase } from "../supabase";
import { getIdentity, DbResult } from "./_base";

export type ProductionCell = {
  cell_key: string; // "UnitType|Level"
  status:   string;
  notes:    string;
};

export async function getProductionStatus(
  projectId: string
): Promise<DbResult<ProductionCell[]>> {
  const { data, error } = await supabase
    .from("project_production_status")
    .select("cell_key, status, notes")
    .eq("project_id", projectId);
  if (error) return { data: null, error: error.message };
  return { data: data || [], error: null };
}

export async function getProductionSummaryForProjects(
  projectIds: string[]
): Promise<DbResult<{ status: string; count: number; project_count: number }[]>> {
  if (!projectIds.length) return { data: [], error: null };
  const { data, error } = await supabase
    .from("project_production_status")
    .select("project_id, status")
    .in("project_id", projectIds);
  if (error) return { data: null, error: error.message };
  const counts: Record<string, number> = {};
  const projects: Record<string, Set<string>> = {};
  (data || []).forEach(row => {
    counts[row.status] = (counts[row.status] || 0) + 1;
    if (!projects[row.status]) projects[row.status] = new Set();
    projects[row.status].add(row.project_id);
  });
  return {
    data: Object.entries(counts).map(([status, count]) => ({
      status, count, project_count: projects[status]?.size || 0,
    })),
    error: null,
  };
}

export async function upsertProductionCell(
  projectId: string,
  cellKey:   string,
  status:    string,
  notes:     string
): Promise<DbResult<true>> {
  const { companyId } = await getIdentity();
  if (!companyId) return { data: null, error: "Not authenticated" };

  const { error } = await supabase
    .from("project_production_status")
    .upsert(
      { project_id: projectId, company_id: companyId, cell_key: cellKey, status, notes },
      { onConflict: "project_id,cell_key" }
    );
  if (error) return { data: null, error: error.message };
  return { data: true, error: null };
}
