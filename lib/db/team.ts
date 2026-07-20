import { supabase } from "../supabase";
import { errMsg, DbResult } from "./_base";

export type JoinRequest = {
  id: string;
  company_id: string;
  company_name?: string | null;
  user_id: string;
  email: string;
  full_name?: string | null;
  status: "pending" | "approved" | "rejected";
  requested_at?: string;
  reviewed_at?: string | null;
};

export type TeamMember = {
  id: string;
  full_name?: string | null;
  role: string;
  created_at?: string;
};

export async function createCompany(
  name: string,
  abn: string,
  country: string
): Promise<DbResult<{ company_id: string }>> {
  try {
    const { data, error } = await supabase.rpc("app_create_company", {
      p_name: name, p_abn: abn, p_country: country,
    });
    if (error) return { data: null, error: errMsg(error) };
    if (data?.error) return { data: null, error: data.error };
    return { data: { company_id: data.company_id }, error: null };
  } catch (e) {
    return { data: null, error: errMsg(e) };
  }
}

export async function submitJoinRequest(
  abn: string,
  fullName: string
): Promise<DbResult<{ company_id: string; company_name: string }>> {
  try {
    const { data, error } = await supabase.rpc("app_submit_join_request", {
      p_abn: abn, p_full_name: fullName,
    });
    if (error) return { data: null, error: errMsg(error) };
    if (data?.error) return { data: null, error: data.error };
    return { data: { company_id: data.company_id, company_name: data.company_name }, error: null };
  } catch (e) {
    return { data: null, error: errMsg(e) };
  }
}

export async function approveJoinRequest(requestId: string): Promise<DbResult<true>> {
  try {
    const { data, error } = await supabase.rpc("app_approve_join_request", { p_request_id: requestId });
    if (error) return { data: null, error: errMsg(error) };
    if (data?.error) return { data: null, error: data.error };
    return { data: true, error: null };
  } catch (e) {
    return { data: null, error: errMsg(e) };
  }
}

export async function rejectJoinRequest(requestId: string): Promise<DbResult<true>> {
  try {
    const { data, error } = await supabase.rpc("app_reject_join_request", { p_request_id: requestId });
    if (error) return { data: null, error: errMsg(error) };
    if (data?.error) return { data: null, error: data.error };
    return { data: true, error: null };
  } catch (e) {
    return { data: null, error: errMsg(e) };
  }
}

export async function listJoinRequests(): Promise<DbResult<JoinRequest[]>> {
  try {
    const { data, error } = await supabase
      .from("company_join_requests")
      .select("*")
      .eq("status", "pending")
      .order("requested_at", { ascending: true });
    if (error) return { data: null, error: errMsg(error) };
    return { data: data || [], error: null };
  } catch (e) {
    return { data: null, error: errMsg(e) };
  }
}

export async function listTeamMembers(): Promise<DbResult<TeamMember[]>> {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, role, created_at")
      .order("created_at", { ascending: true });
    if (error) return { data: null, error: errMsg(error) };
    return { data: data || [], error: null };
  } catch (e) {
    return { data: null, error: errMsg(e) };
  }
}

export async function updateMemberRole(userId: string, role: string): Promise<DbResult<true>> {
  try {
    const { data, error } = await supabase.rpc("app_update_member_role", {
      p_user_id: userId,
      p_role: role,
    });
    if (error) return { data: null, error: errMsg(error) };
    if (data?.error) return { data: null, error: data.error };
    return { data: true, error: null };
  } catch (e) {
    return { data: null, error: errMsg(e) };
  }
}

export async function getMyPendingRequest(): Promise<DbResult<JoinRequest | null>> {
  try {
    const { data, error } = await supabase
      .from("company_join_requests")
      .select("*")
      .eq("status", "pending")
      .maybeSingle();
    if (error) return { data: null, error: errMsg(error) };
    return { data: data || null, error: null };
  } catch (e) {
    return { data: null, error: errMsg(e) };
  }
}
