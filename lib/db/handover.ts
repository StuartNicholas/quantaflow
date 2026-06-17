import { supabase } from "../supabase";
import { getIdentity, errMsg, logActivity, DbResult } from "./_base";

export type Defect = {
  id: string;
  company_id: string;
  project_id: string;
  ref: string;
  description: string;
  location?: string | null;
  assignee?: string | null;
  status: "open" | "in_progress" | "closed";
  priority: "low" | "medium" | "high";
  notes?: string | null;
  due_date?: string | null;
  closed_at?: string | null;
  created_by?: string | null;
  updated_by?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type HandoverItem = {
  id: string;
  company_id: string;
  project_id: string;
  description: string;
  checked: boolean;
  checked_at?: string | null;
  checked_by?: string | null;
  sort_order: number;
  created_by?: string | null;
  created_at?: string;
};

const DEFAULT_CHECKLIST = [
  "All cabinets installed and level",
  "Doors hung and adjusted",
  "Drawers running smoothly on runners",
  "Handles and hardware fitted",
  "Soft-close and dampeners working",
  "Benchtops fitted and sealed",
  "Splashbacks complete",
  "Touch-ups and finish work done",
  "Site cleaned and rubbish removed",
  "Client walkthrough completed",
  "Defect register cleared",
];

// ── Defects ───────────────────────────────────────────────────────────────────

export async function listDefects(projectId: string): Promise<DbResult<Defect[]>> {
  try {
    const { data, error } = await supabase
      .from("defects")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true });
    if (error) return { data: null, error: errMsg(error) };
    return { data: data || [], error: null };
  } catch (e) {
    return { data: null, error: errMsg(e) };
  }
}

export async function createDefect(
  projectId: string,
  input: Partial<Defect>
): Promise<DbResult<Defect>> {
  try {
    const { userId, companyId } = await getIdentity();
    if (!companyId) return { data: null, error: "No company for current user." };
    const { data, error } = await supabase
      .from("defects")
      .insert({
        company_id: companyId,
        project_id: projectId,
        ref: input.ref || "",
        description: input.description || "",
        location: input.location ?? null,
        assignee: input.assignee ?? null,
        status: "open",
        priority: input.priority ?? "medium",
        notes: input.notes ?? null,
        due_date: input.due_date ?? null,
        created_by: userId,
        updated_by: userId,
      })
      .select()
      .single();
    if (error) return { data: null, error: errMsg(error) };
    await logActivity("defect", data.id, "create", `Created defect: ${data.ref}`);
    return { data, error: null };
  } catch (e) {
    return { data: null, error: errMsg(e) };
  }
}

export async function updateDefect(
  id: string,
  patch: Partial<Defect>
): Promise<DbResult<Defect>> {
  try {
    const { userId } = await getIdentity();
    const clean: any = { ...patch, updated_by: userId, updated_at: new Date().toISOString() };
    delete clean.id; delete clean.company_id; delete clean.project_id;
    if (patch.status === "closed" && !clean.closed_at) clean.closed_at = new Date().toISOString();
    if (patch.status !== "closed") clean.closed_at = null;
    const { data, error } = await supabase
      .from("defects")
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

export async function deleteDefect(id: string): Promise<DbResult<true>> {
  try {
    const { error } = await supabase.from("defects").delete().eq("id", id);
    if (error) return { data: null, error: errMsg(error) };
    await logActivity("defect", id, "delete", "Deleted defect");
    return { data: true, error: null };
  } catch (e) {
    return { data: null, error: errMsg(e) };
  }
}

// ── Handover checklist ────────────────────────────────────────────────────────

export async function listHandoverItems(
  projectId: string
): Promise<DbResult<HandoverItem[]>> {
  try {
    const { data, error } = await supabase
      .from("handover_items")
      .select("*")
      .eq("project_id", projectId)
      .order("sort_order", { ascending: true });
    if (error) return { data: null, error: errMsg(error) };
    return { data: data || [], error: null };
  } catch (e) {
    return { data: null, error: errMsg(e) };
  }
}

/** Seed the default checklist if the project has no handover items yet. */
export async function seedHandoverItems(
  projectId: string
): Promise<DbResult<HandoverItem[]>> {
  try {
    const { userId, companyId } = await getIdentity();
    if (!companyId) return { data: null, error: "No company for current user." };
    const rows = DEFAULT_CHECKLIST.map((description, i) => ({
      company_id: companyId,
      project_id: projectId,
      description,
      checked: false,
      sort_order: i,
      created_by: userId,
    }));
    const { data, error } = await supabase
      .from("handover_items")
      .insert(rows)
      .select();
    if (error) return { data: null, error: errMsg(error) };
    return { data: data || [], error: null };
  } catch (e) {
    return { data: null, error: errMsg(e) };
  }
}

export async function createHandoverItem(
  projectId: string,
  description: string,
  sortOrder: number
): Promise<DbResult<HandoverItem>> {
  try {
    const { userId, companyId } = await getIdentity();
    if (!companyId) return { data: null, error: "No company for current user." };
    const { data, error } = await supabase
      .from("handover_items")
      .insert({
        company_id: companyId,
        project_id: projectId,
        description,
        checked: false,
        sort_order: sortOrder,
        created_by: userId,
      })
      .select()
      .single();
    if (error) return { data: null, error: errMsg(error) };
    return { data, error: null };
  } catch (e) {
    return { data: null, error: errMsg(e) };
  }
}

export async function toggleHandoverItem(
  id: string,
  checked: boolean
): Promise<DbResult<HandoverItem>> {
  try {
    const { userId } = await getIdentity();
    const { data, error } = await supabase
      .from("handover_items")
      .update({
        checked,
        checked_at: checked ? new Date().toISOString() : null,
        checked_by: checked ? userId : null,
      })
      .eq("id", id)
      .select()
      .single();
    if (error) return { data: null, error: errMsg(error) };
    return { data, error: null };
  } catch (e) {
    return { data: null, error: errMsg(e) };
  }
}

export async function deleteHandoverItem(id: string): Promise<DbResult<true>> {
  try {
    const { error } = await supabase.from("handover_items").delete().eq("id", id);
    if (error) return { data: null, error: errMsg(error) };
    return { data: true, error: null };
  } catch (e) {
    return { data: null, error: errMsg(e) };
  }
}
