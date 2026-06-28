import { supabase } from "../supabase";

// ─────────────────────────────────────────────────────────────────────────────
// Verixo — data-access base helpers
// Components never call supabase directly; they call typed helpers in /lib/db.
// This module centralises: session-derived identity (never trust the browser
// for company_id), a consistent {data,error} return shape, and audit stamping.
// ─────────────────────────────────────────────────────────────────────────────

export type DbResult<T> = { data: T | null; error: string | null };

let _cache: { userId: string | null; companyId: string | null } | null = null;

/** Resolve the current user's id and company_id from the session (cached per load). */
export async function getIdentity(): Promise<{ userId: string | null; companyId: string | null }> {
  if (_cache) return _cache;
  try {
    const { data: u } = await supabase.auth.getUser();
    const userId = u?.user?.id ?? null;
    let companyId: string | null = null;
    if (userId) {
      const { data: prof } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("id", userId)
        .single();
      companyId = prof?.company_id ?? null;
    }
    _cache = { userId, companyId };
    return _cache;
  } catch {
    return { userId: null, companyId: null };
  }
}

/** Clear the identity cache (call on sign-out / company switch). */
export function clearIdentityCache() {
  _cache = null;
}

/** Normalise any thrown/PostgREST error into a short readable string. */
export function errMsg(e: any): string {
  if (!e) return "Unknown error";
  if (typeof e === "string") return e;
  return e.message || e.error_description || e.hint || JSON.stringify(e);
}

/** Best-effort audit write. Never throws — auditing must not break a user action. */
export async function logActivity(
  entityType: string,
  entityId: string | null,
  action: string,
  summary: string,
  meta: Record<string, any> = {}
): Promise<void> {
  try {
    const { userId, companyId } = await getIdentity();
    if (!companyId) return;
    await supabase.from("activity_logs").insert({
      company_id: companyId,
      user_id: userId,
      entity_type: entityType,
      entity_id: entityId,
      action,
      summary,
      meta,
    });
  } catch {
    /* swallow — audit is best-effort */
  }
}
