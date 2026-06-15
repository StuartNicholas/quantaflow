import { supabase } from "../supabase";
import { getIdentity, errMsg, logActivity, DbResult } from "./_base";

// ─────────────────────────────────────────────────────────────────────────────
// Clients data access. All writes are company-scoped from the session and
// audited. company_id passed from the browser is ignored — always derived here.
// ─────────────────────────────────────────────────────────────────────────────

export type Client = {
  id: string;
  company_id: string;
  name: string;
  contact?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
};

export async function listClients(): Promise<DbResult<Client[]>> {
  try {
    const { data, error } = await supabase
      .from("clients")
      .select("*")
      .order("name", { ascending: true });
    if (error) return { data: null, error: errMsg(error) };
    return { data: data || [], error: null };
  } catch (e) {
    return { data: null, error: errMsg(e) };
  }
}

export async function createClient(
  input: Partial<Client>
): Promise<DbResult<Client>> {
  try {
    const { userId, companyId } = await getIdentity();
    if (!companyId) return { data: null, error: "No company for current user." };
    const row = {
      company_id: companyId,
      name: input.name || "Unnamed client",
      contact: input.contact ?? null,
      email: input.email ?? null,
      phone: input.phone ?? null,
      address: input.address ?? null,
      notes: input.notes ?? null,
      created_by: userId,
      updated_by: userId,
    };
    const { data, error } = await supabase.from("clients").insert(row).select().single();
    if (error) return { data: null, error: errMsg(error) };
    await logActivity("client", data.id, "create", `Created client: ${data.name}`);
    return { data, error: null };
  } catch (e) {
    return { data: null, error: errMsg(e) };
  }
}

export async function updateClient(
  id: string,
  patch: Partial<Client>
): Promise<DbResult<Client>> {
  try {
    const { userId } = await getIdentity();
    const clean: any = { ...patch, updated_by: userId, updated_at: new Date().toISOString() };
    delete clean.id;
    delete clean.company_id; // never allow reassigning ownership from the client
    const { data, error } = await supabase
      .from("clients")
      .update(clean)
      .eq("id", id)
      .select()
      .single();
    if (error) return { data: null, error: errMsg(error) };
    await logActivity("client", id, "update", `Updated client: ${data.name}`);
    return { data, error: null };
  } catch (e) {
    return { data: null, error: errMsg(e) };
  }
}

export async function deleteClient(id: string, name?: string): Promise<DbResult<true>> {
  try {
    const { error } = await supabase.from("clients").delete().eq("id", id);
    if (error) return { data: null, error: errMsg(error) };
    await logActivity("client", id, "delete", `Deleted client${name ? `: ${name}` : ""}`);
    return { data: true, error: null };
  } catch (e) {
    return { data: null, error: errMsg(e) };
  }
}
