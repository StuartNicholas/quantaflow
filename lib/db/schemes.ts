import { supabase } from "../supabase";
import { getIdentity, DbResult } from "./_base";

export async function getSchemes(projectId: string): Promise<DbResult<any>> {
  const { data, error } = await supabase
    .from("project_schemes")
    .select("scheme_data")
    .eq("project_id", projectId)
    .maybeSingle();
  if (error) return { data: null, error: error.message };
  return { data: data?.scheme_data ?? null, error: null };
}

export async function saveSchemes(
  projectId: string,
  schemeData: any
): Promise<DbResult<true>> {
  const { companyId } = await getIdentity();
  if (!companyId) return { data: null, error: "Not authenticated" };

  const { error } = await supabase
    .from("project_schemes")
    .upsert(
      { project_id: projectId, company_id: companyId, scheme_data: schemeData, updated_at: new Date().toISOString() },
      { onConflict: "project_id" }
    );
  if (error) return { data: null, error: error.message };
  return { data: true, error: null };
}
