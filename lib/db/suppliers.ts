import { supabase } from "../supabase";
import { getIdentity, errMsg, logActivity, DbResult } from "./_base";

// ─────────────────────────────────────────────────────────────────────────────
// Suppliers data access. Suppliers are board, hardware and fittings vendors.
// All writes are company-scoped and audited.
// ─────────────────────────────────────────────────────────────────────────────

export type Supplier = {
  id: string;
  company_id: string;
  name: string;
  contact_name?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  abn?: string | null;
  category?: string | null;
  account_no?: string | null;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
};

export async function listSuppliers(): Promise<DbResult<Supplier[]>> {
  try {
    const { data, error } = await supabase
      .from("suppliers")
      .select("*")
      .order("name", { ascending: true });
    if (error) return { data: null, error: errMsg(error) };
    return { data: data || [], error: null };
  } catch (e) {
    return { data: null, error: errMsg(e) };
  }
}

export async function createSupplier(
  input: Partial<Supplier>
): Promise<DbResult<Supplier>> {
  try {
    const { userId, companyId } = await getIdentity();
    if (!companyId) return { data: null, error: "No company for current user." };
    const row = {
      company_id: companyId,
      name: input.name || "Unnamed supplier",
      contact_name: input.contact_name ?? null,
      email: input.email ?? null,
      phone: input.phone ?? null,
      address: input.address ?? null,
      abn: input.abn ?? null,
      category: input.category ?? null,
      account_no: input.account_no ?? null,
      notes: input.notes ?? null,
      created_by: userId,
      updated_by: userId,
    };
    const { data, error } = await supabase.from("suppliers").insert(row).select().single();
    if (error) return { data: null, error: errMsg(error) };
    await logActivity("supplier", data.id, "create", `Created supplier: ${data.name}`);
    return { data, error: null };
  } catch (e) {
    return { data: null, error: errMsg(e) };
  }
}

export async function updateSupplier(
  id: string,
  patch: Partial<Supplier>
): Promise<DbResult<Supplier>> {
  try {
    const { userId } = await getIdentity();
    const clean: any = { ...patch, updated_by: userId, updated_at: new Date().toISOString() };
    delete clean.id;
    delete clean.company_id;
    const { data, error } = await supabase
      .from("suppliers")
      .update(clean)
      .eq("id", id)
      .select()
      .single();
    if (error) return { data: null, error: errMsg(error) };
    await logActivity("supplier", id, "update", `Updated supplier: ${data.name}`);
    return { data, error: null };
  } catch (e) {
    return { data: null, error: errMsg(e) };
  }
}

export async function deleteSupplier(id: string, name?: string): Promise<DbResult<true>> {
  try {
    const { error } = await supabase.from("suppliers").delete().eq("id", id);
    if (error) return { data: null, error: errMsg(error) };
    await logActivity("supplier", id, "delete", `Deleted supplier${name ? `: ${name}` : ""}`);
    return { data: true, error: null };
  } catch (e) {
    return { data: null, error: errMsg(e) };
  }
}
