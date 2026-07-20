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
