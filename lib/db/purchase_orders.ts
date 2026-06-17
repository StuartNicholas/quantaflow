import { supabase } from "../supabase";
import { getIdentity, errMsg, logActivity, DbResult } from "./_base";

export type PurchaseOrderItem = {
  id: string;
  company_id: string;
  purchase_order_id: string;
  description: string;
  qty: number;
  unit?: string | null;
  unit_cost: number;
  notes?: string | null;
  sort_order: number;
};

export type PurchaseOrder = {
  id: string;
  company_id: string;
  project_id: string;
  supplier_id?: string | null;
  ref: string;
  supplier_name?: string | null;
  status: "draft" | "sent" | "received" | "cancelled";
  notes?: string | null;
  sent_at?: string | null;
  received_at?: string | null;
  created_by?: string | null;
  updated_by?: string | null;
  created_at?: string;
  updated_at?: string;
  // joined
  purchase_order_items?: PurchaseOrderItem[];
};

export async function listPurchaseOrders(
  projectId: string
): Promise<DbResult<PurchaseOrder[]>> {
  try {
    const { data, error } = await supabase
      .from("purchase_orders")
      .select("*, purchase_order_items(*)")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true });
    if (error) return { data: null, error: errMsg(error) };
    return { data: (data || []) as PurchaseOrder[], error: null };
  } catch (e) {
    return { data: null, error: errMsg(e) };
  }
}

export async function createPurchaseOrder(
  projectId: string,
  input: Partial<PurchaseOrder>
): Promise<DbResult<PurchaseOrder>> {
  try {
    const { userId, companyId } = await getIdentity();
    if (!companyId) return { data: null, error: "No company for current user." };
    const { data, error } = await supabase
      .from("purchase_orders")
      .insert({
        company_id: companyId,
        project_id: projectId,
        supplier_id: input.supplier_id ?? null,
        ref: input.ref || "",
        supplier_name: input.supplier_name ?? null,
        status: "draft",
        notes: input.notes ?? null,
        created_by: userId,
        updated_by: userId,
      })
      .select()
      .single();
    if (error) return { data: null, error: errMsg(error) };
    await logActivity("purchase_order", data.id, "create", `Created PO: ${data.ref}`);
    return { data, error: null };
  } catch (e) {
    return { data: null, error: errMsg(e) };
  }
}

export async function updatePurchaseOrder(
  id: string,
  patch: Partial<PurchaseOrder>
): Promise<DbResult<PurchaseOrder>> {
  try {
    const { userId } = await getIdentity();
    const clean: any = { ...patch, updated_by: userId, updated_at: new Date().toISOString() };
    delete clean.id; delete clean.company_id; delete clean.project_id;
    delete clean.purchase_order_items;
    if (patch.status === "sent" && !clean.sent_at) clean.sent_at = new Date().toISOString();
    if (patch.status === "received" && !clean.received_at) clean.received_at = new Date().toISOString();
    const { data, error } = await supabase
      .from("purchase_orders")
      .update(clean)
      .eq("id", id)
      .select()
      .single();
    if (error) return { data: null, error: errMsg(error) };
    await logActivity("purchase_order", id, "update", `PO ${data.ref} → ${data.status}`);
    return { data, error: null };
  } catch (e) {
    return { data: null, error: errMsg(e) };
  }
}

export async function deletePurchaseOrder(id: string): Promise<DbResult<true>> {
  try {
    const { error } = await supabase.from("purchase_orders").delete().eq("id", id);
    if (error) return { data: null, error: errMsg(error) };
    await logActivity("purchase_order", id, "delete", "Deleted PO");
    return { data: true, error: null };
  } catch (e) {
    return { data: null, error: errMsg(e) };
  }
}

export async function addPurchaseOrderItem(
  poId: string,
  item: Partial<PurchaseOrderItem>
): Promise<DbResult<PurchaseOrderItem>> {
  try {
    const { companyId } = await getIdentity();
    if (!companyId) return { data: null, error: "No company for current user." };
    const { data, error } = await supabase
      .from("purchase_order_items")
      .insert({
        company_id: companyId,
        purchase_order_id: poId,
        description: item.description || "",
        qty: item.qty ?? 0,
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

export async function addPurchaseOrderItems(
  poId: string,
  items: Partial<PurchaseOrderItem>[]
): Promise<DbResult<PurchaseOrderItem[]>> {
  try {
    const { companyId } = await getIdentity();
    if (!companyId) return { data: null, error: "No company for current user." };
    const rows = items.map((item, i) => ({
      company_id: companyId,
      purchase_order_id: poId,
      description: item.description || "",
      qty: item.qty ?? 0,
      unit: item.unit ?? null,
      unit_cost: item.unit_cost ?? 0,
      notes: item.notes ?? null,
      sort_order: i,
    }));
    const { data, error } = await supabase.from("purchase_order_items").insert(rows).select();
    if (error) return { data: null, error: errMsg(error) };
    return { data: data || [], error: null };
  } catch (e) {
    return { data: null, error: errMsg(e) };
  }
}

export async function updatePurchaseOrderItem(
  id: string,
  patch: Partial<PurchaseOrderItem>
): Promise<DbResult<PurchaseOrderItem>> {
  try {
    const clean: any = { ...patch };
    delete clean.id; delete clean.company_id; delete clean.purchase_order_id;
    const { data, error } = await supabase
      .from("purchase_order_items")
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

export async function deletePurchaseOrderItem(id: string): Promise<DbResult<true>> {
  try {
    const { error } = await supabase.from("purchase_order_items").delete().eq("id", id);
    if (error) return { data: null, error: errMsg(error) };
    return { data: true, error: null };
  } catch (e) {
    return { data: null, error: errMsg(e) };
  }
}

/** Total committed value across sent + received POs for a project. */
export async function getPOCommittedTotal(projectId: string): Promise<DbResult<number>> {
  try {
    const { data, error } = await supabase
      .from("purchase_orders")
      .select("*, purchase_order_items(*)")
      .eq("project_id", projectId)
      .in("status", ["sent", "received"]);
    if (error) return { data: null, error: errMsg(error) };
    const total = (data || []).reduce((s, po) =>
      s + (po.purchase_order_items || []).reduce((s2: number, i: any) =>
        s2 + (i.qty || 0) * (i.unit_cost || 0), 0), 0);
    return { data: total, error: null };
  } catch (e) {
    return { data: null, error: errMsg(e) };
  }
}
