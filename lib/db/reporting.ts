import { supabase } from "../supabase";
import { errMsg, DbResult } from "./_base";

export type ActivityEntry = {
  id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  description?: string | null;
  created_at: string;
  created_by?: string | null;
};

export type QuoteVersionStat = {
  id: string;
  project_id: string;
  status: string;
  version_number: number;
  total_inc_gst?: number | null;
  total_ex_gst?: number | null;
  issued_at?: string | null;
  created_at?: string;
};

export async function getActivityFeed(
  limit = 30
): Promise<DbResult<ActivityEntry[]>> {
  try {
    const { data, error } = await supabase
      .from("activity_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) return { data: null, error: errMsg(error) };
    return { data: data || [], error: null };
  } catch (e) {
    return { data: null, error: errMsg(e) };
  }
}

export async function getQuoteVersionStats(): Promise<DbResult<QuoteVersionStat[]>> {
  try {
    const { data, error } = await supabase
      .from("quote_versions")
      .select("id, project_id, status, version_number, total_inc_gst, total_ex_gst, issued_at, created_at")
      .order("created_at", { ascending: false });
    if (error) return { data: null, error: errMsg(error) };
    return { data: data || [], error: null };
  } catch (e) {
    return { data: null, error: errMsg(e) };
  }
}
