import { supabase } from "../supabase";
import { getIdentity, errMsg, logActivity, DbResult } from "./_base";

// ─────────────────────────────────────────────────────────────────────────────
// Builders data access. Builders are the head contractors / developers who
// commission joinery work. All writes are company-scoped and audited.
// ─────────────────────────────────────────────────────────────────────────────

export type Builder = {
  id: string;
  company_id: string;
  name: string;
  contact_name?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  abn?: string | null;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
};

export async function listBuilders(): Promise<DbResult<Builder[]>> {
  try {
    const { data, error } = await supabase
      .from("builders")
      .select("*")
      .order("name", { ascending: true });
    if (error) return { data: null, error: errMsg(error) };
    return { data: data || [], error: null };
  } catch (e) {
    return { data: null, error: errMsg(e) };
  }
}

export async function createBuilder(
  input: Partial<Builder>
): Promise<DbResult<Builder>> {
  try {
    const { userId, companyId } = await getIdentity();
    if (!companyId) return { data: null, error: "No company for current user." };
    const row = {
      company_id: companyId,
      name: input.name || "Unnamed builder",
      contact_name: input.contact_name ?? null,
      email: input.email ?? null,
      phone: input.phone ?? null,
      address: input.address ?? null,
      abn: input.abn ?? null,
      notes: input.notes ?? null,
      created_by: userId,
      updated_by: userId,
    };
    const { data, error } = await supabase.from("builders").insert(row).select().single();
    if (error) return { data: null, error: errMsg(error) };
    await logActivity("builder", data.id, "create", `Created builder: ${data.name}`);
    return { data, error: null };
  } catch (e) {
    return { data: null, error: errMsg(e) };
  }
}

export async function updateBuilder(
  id: string,
  patch: Partial<Builder>
): Promise<DbResult<Builder>> {
  try {
    const { userId } = await getIdentity();
    const clean: any = { ...patch, updated_by: userId, updated_at: new Date().toISOString() };
    delete clean.id;
    delete clean.company_id;
    const { data, error } = await supabase
      .from("builders")
      .update(clean)
      .eq("id", id)
      .select()
      .single();
    if (error) return { data: null, error: errMsg(error) };
    await logActivity("builder", id, "update", `Updated builder: ${data.name}`);
    return { data, error: null };
  } catch (e) {
    return { data: null, error: errMsg(e) };
  }
}

export async function deleteBuilder(id: string, name?: string): Promise<DbResult<true>> {
  try {
    const { error } = await supabase.from("builders").delete().eq("id", id);
    if (error) return { data: null, error: errMsg(error) };
    await logActivity("builder", id, "delete", `Deleted builder${name ? `: ${name}` : ""}`);
    return { data: true, error: null };
  } catch (e) {
    return { data: null, error: errMsg(e) };
  }
}
