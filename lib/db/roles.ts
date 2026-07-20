import { supabase } from "../supabase";
import { errMsg, DbResult } from "./_base";

export interface CompanyRole {
  id: string;
  company_id: string;
  name: string;
  slug: string;
  tier: number;
  color: string;
  is_system: boolean;
  can_manage_team: boolean;
  description: string | null;
  created_at: string;
}

export interface RoleTabPermission {
  id: string;
  company_id: string;
  role_id: string;
  tab_id: string;
  can_view: boolean;
  can_edit: boolean;
}

export type TabPermissions = Record<string, { can_view: boolean; can_edit: boolean }>;

export async function getCompanyRoles(companyId: string): Promise<DbResult<CompanyRole[]>> {
  try {
    const { data, error } = await supabase
      .from("company_roles")
      .select("*")
      .eq("company_id", companyId)
      .order("tier", { ascending: true });
    if (error) return { data: null, error: errMsg(error) };
    return { data: data ?? [], error: null };
  } catch (e) {
    return { data: null, error: errMsg(e) };
  }
}

export async function getRoleTabPermissions(roleId: string): Promise<DbResult<RoleTabPermission[]>> {
  try {
    const { data, error } = await supabase
      .from("role_tab_permissions")
      .select("*")
      .eq("role_id", roleId);
    if (error) return { data: null, error: errMsg(error) };
    return { data: data ?? [], error: null };
  } catch (e) {
    return { data: null, error: errMsg(e) };
  }
}

export async function loadUserPermissions(
  companyId: string,
  roleSlug: string
): Promise<DbResult<{ role: CompanyRole | null; permissions: TabPermissions | null }>> {
  try {
    const { data: role, error } = await supabase
      .from("company_roles")
      .select("*")
      .eq("company_id", companyId)
      .eq("slug", roleSlug)
      .maybeSingle();
    if (error) return { data: null, error: errMsg(error) };

    // Role not in company_roles (pre-role-system company) → full access
    if (!role) return { data: { role: null, permissions: null }, error: null };

    // Owner/GM (tier ≤ 2) → always full access
    if (role.tier <= 2) return { data: { role, permissions: null }, error: null };

    const { data: perms, error: permsErr } = await supabase
      .from("role_tab_permissions")
      .select("tab_id, can_view, can_edit")
      .eq("role_id", role.id);
    if (permsErr) return { data: null, error: errMsg(permsErr) };

    // No rows configured → full access (member backward compat)
    if (!perms?.length) return { data: { role, permissions: null }, error: null };

    const permissions: TabPermissions = {};
    perms.forEach(p => {
      permissions[p.tab_id] = { can_view: p.can_view, can_edit: p.can_edit };
    });

    return { data: { role, permissions }, error: null };
  } catch (e) {
    return { data: null, error: errMsg(e) };
  }
}

export async function createCompanyRole(
  companyId: string,
  input: { name: string; slug: string; tier: number; color: string; description?: string; can_manage_team?: boolean }
): Promise<DbResult<CompanyRole>> {
  try {
    const { data, error } = await supabase
      .from("company_roles")
      .insert({ company_id: companyId, is_system: false, can_manage_team: false, ...input })
      .select()
      .single();
    if (error) return { data: null, error: errMsg(error) };
    return { data, error: null };
  } catch (e) {
    return { data: null, error: errMsg(e) };
  }
}

export async function updateCompanyRole(
  roleId: string,
  input: Partial<Pick<CompanyRole, "name" | "tier" | "color" | "description" | "can_manage_team">>
): Promise<DbResult<CompanyRole>> {
  try {
    const { data, error } = await supabase
      .from("company_roles")
      .update(input)
      .eq("id", roleId)
      .select()
      .single();
    if (error) return { data: null, error: errMsg(error) };
    return { data, error: null };
  } catch (e) {
    return { data: null, error: errMsg(e) };
  }
}

export async function deleteCompanyRole(roleId: string): Promise<DbResult<null>> {
  try {
    // is_system check is enforced server-side by RLS / app logic
    const { error } = await supabase
      .from("company_roles")
      .delete()
      .eq("id", roleId)
      .eq("is_system", false);
    if (error) return { data: null, error: errMsg(error) };
    return { data: null, error: null };
  } catch (e) {
    return { data: null, error: errMsg(e) };
  }
}

export async function upsertTabPermission(
  companyId: string,
  roleId: string,
  tabId: string,
  canView: boolean,
  canEdit: boolean
): Promise<DbResult<null>> {
  try {
    const { error } = await supabase
      .from("role_tab_permissions")
      .upsert(
        { company_id: companyId, role_id: roleId, tab_id: tabId, can_view: canView, can_edit: canEdit },
        { onConflict: "role_id,tab_id" }
      );
    if (error) return { data: null, error: errMsg(error) };
    return { data: null, error: null };
  } catch (e) {
    return { data: null, error: errMsg(e) };
  }
}

export async function seedCompanyRoles(companyId: string): Promise<DbResult<null>> {
  try {
    const { data, error } = await supabase.rpc("seed_company_roles", { p_company_id: companyId });
    if (error) return { data: null, error: errMsg(error) };
    if (data?.error) return { data: null, error: data.error };
    return { data: null, error: null };
  } catch (e) {
    return { data: null, error: errMsg(e) };
  }
}
