import { supabase } from "../supabase";
import { getIdentity, errMsg, logActivity, DbResult } from "./_base";

export type ClaimItem = {
  id: string;
  company_id: string;
  claim_id: string;
  description: string;
  qty: number;
  unit?: string | null;
  unit_cost: number;
  notes?: string | null;
  sort_order: number;
};

export type Claim = {
  id: string;
  company_id: string;
  project_id: string;
  claim_number: number;
  description?: string | null;
  status: "draft" | "submitted" | "approved" | "paid";
  period_end?: string | null;
  submitted_at?: string | null;
  approved_at?: string | null;
  paid_at?: string | null;
  notes?: string | null;
  created_by?: string | null;
  updated_by?: string | null;
  created_at?: string;
  updated_at?: string;
  claim_items?: ClaimItem[];
};

export async function listClaims(projectId: string): Promise<DbResult<Claim[]>> {
  try {
    const { data, error } = await supabase
      .from("claims")
      .select("*, claim_items(*)")
      .eq("project_id", projectId)
      .order("claim_number", { ascending: true });
    if (error) return { data: null, error: errMsg(error) };
    return { data: (data || []) as Claim[], error: null };
  } catch (e) {
    return { data: null, error: errMsg(e) };
  }
}

export async function createClaim(
  projectId: string,
  input: Partial<Claim>
): Promise<DbResult<Claim>> {
  try {
    const { userId, companyId } = await getIdentity();
    if (!companyId) return { data: null, error: "No company for current user." };
    const { data, error } = await supabase
      .from("claims")
      .insert({
        company_id: companyId,
        project_id: projectId,
        claim_number: input.claim_number ?? 1,
        description: input.description ?? null,
        status: "draft",
        period_end: input.period_end ?? null,
        notes: input.notes ?? null,
        created_by: userId,
        updated_by: userId,
      })
      .select()
      .single();
    if (error) return { data: null, error: errMsg(error) };
    await logActivity("claim", data.id, "create", `Created claim #${data.claim_number}`);
    return { data, error: null };
  } catch (e) {
    return { data: null, error: errMsg(e) };
  }
}

export async function updateClaim(
  id: string,
  patch: Partial<Claim>
): Promise<DbResult<Claim>> {
  try {
    const { userId } = await getIdentity();
    const clean: any = { ...patch, updated_by: userId, updated_at: new Date().toISOString() };
    delete clean.id; delete clean.company_id; delete clean.project_id; delete clean.claim_items;
    if (patch.status === "submitted" && !clean.submitted_at) clean.submitted_at = new Date().toISOString();
    if (patch.status === "approved"  && !clean.approved_at)  clean.approved_at  = new Date().toISOString();
    if (patch.status === "paid"      && !clean.paid_at)      clean.paid_at      = new Date().toISOString();
    const { data, error } = await supabase
      .from("claims")
      .update(clean)
      .eq("id", id)
      .select()
      .single();
    if (error) return { data: null, error: errMsg(error) };
    return { data, error: null };
  } catch (e) {
    return { data: null, error: errMsg(e) };
  }
}

export async function deleteClaim(id: string): Promise<DbResult<true>> {
  try {
    const { error } = await supabase.from("claims").delete().eq("id", id);
    if (error) return { data: null, error: errMsg(error) };
    await logActivity("claim", id, "delete", "Deleted claim");
    return { data: true, error: null };
  } catch (e) {
    return { data: null, error: errMsg(e) };
  }
}

export async function addClaimItem(
  claimId: string,
  item: Partial<ClaimItem>
): Promise<DbResult<ClaimItem>> {
  try {
    const { companyId } = await getIdentity();
    if (!companyId) return { data: null, error: "No company for current user." };
    const { data, error } = await supabase
      .from("claim_items")
      .insert({
        company_id: companyId,
        claim_id: claimId,
        description: item.description || "",
        qty: item.qty ?? 1,
        unit: item.unit ?? null,
        unit_cost: item.unit_cost ?? 0,
        notes: item.notes ?? null,
        sort_order: item.sort_order ?? 0,
      })
      .select()
      .single();
    if (error) return { data: null, error: errMsg(error) };
    return { data, error: null };
  } catch (e) {
    return { data: null, error: errMsg(e) };
  }
}

export async function addClaimItems(
  claimId: string,
  items: Partial<ClaimItem>[]
): Promise<DbResult<ClaimItem[]>> {
  try {
    const { companyId } = await getIdentity();
    if (!companyId) return { data: null, error: "No company for current user." };
    const rows = items.map((item, i) => ({
      company_id: companyId,
      claim_id: claimId,
      description: item.description || "",
      qty: item.qty ?? 1,
      unit: item.unit ?? null,
      unit_cost: item.unit_cost ?? 0,
      notes: item.notes ?? null,
      sort_order: i,
    }));
    const { data, error } = await supabase.from("claim_items").insert(rows).select();
    if (error) return { data: null, error: errMsg(error) };
    return { data: data || [], error: null };
  } catch (e) {
    return { data: null, error: errMsg(e) };
  }
}

export async function updateClaimItem(
  id: string,
  patch: Partial<ClaimItem>
): Promise<DbResult<ClaimItem>> {
  try {
    const clean: any = { ...patch };
    delete clean.id; delete clean.company_id; delete clean.claim_id;
    const { data, error } = await supabase
      .from("claim_items")
      .update(clean)
      .eq("id", id)
      .select()
      .single();
    if (error) return { data: null, error: errMsg(error) };
    return { data, error: null };
  } catch (e) {
    return { data: null, error: errMsg(e) };
  }
}

export async function deleteClaimItem(id: string): Promise<DbResult<true>> {
  try {
    const { error } = await supabase.from("claim_items").delete().eq("id", id);
    if (error) return { data: null, error: errMsg(error) };
    return { data: true, error: null };
  } catch (e) {
    return { data: null, error: errMsg(e) };
  }
}
