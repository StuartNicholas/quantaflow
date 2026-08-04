"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { PRODUCT_NAME } from "../lib/constants";

type AuthGateProps = { children: React.ReactNode };

export default function AuthGate({ children }: AuthGateProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [mode, setMode] = useState<"login" | "signup" | "forgot" | "recovery">("login");
  const [loading, setLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"error" | "success">("error");

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setUser(data.session?.user ?? null);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (_event === "PASSWORD_RECOVERY") {
        setMode("recovery");
        setUser(null);
      } else {
        setUser(session?.user ?? null);
      }
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  function setMsg(text: string, type: "error" | "success" = "error") {
    setMessage(text);
    setMessageType(type);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setMessage("");
    setAuthLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setMsg("Account created — check your email to confirm your address.", "success");
      } else if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: typeof window !== "undefined" ? window.location.origin : "",
        });
        if (error) throw error;
        setMsg("Password reset email sent — check your inbox and click the link.", "success");
      } else if (mode === "recovery") {
        if (newPassword.length < 6) throw new Error("Password must be at least 6 characters.");
        const { error } = await supabase.auth.updateUser({ password: newPassword });
        if (error) throw error;
        setMsg("Password updated — you can now log in.", "success");
        setMode("login");
        setNewPassword("");
      }
    } catch (error: any) {
      setMsg(error.message || "Something went wrong.");
    } finally {
      setAuthLoading(false);
    }
  }

  if (loading) {
    return (
      <main style={styles.page}>
        <p style={styles.muted}>Loading {PRODUCT_NAME}…</p>
      </main>
    );
  }

  if (mode === "recovery") {
    return (
      <main style={styles.page}>
        <div style={styles.card}>
          <div style={styles.logo}>V</div>
          <h1 style={styles.title}>Set New Password</h1>
          <p style={styles.subtitle}>Enter a new password for your account.</p>
          <form onSubmit={handleSubmit} style={styles.form}>
            <label style={styles.label}>New Password</label>
            <input
              type="password" required minLength={6}
              value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
              style={styles.input} placeholder="At least 6 characters"
            />
            <button type="submit" disabled={authLoading} style={styles.submit}>
              {authLoading ? "Saving…" : "Set New Password"}
            </button>
          </form>
          {message && <p style={{ ...styles.message, color: messageType === "success" ? "#4ade80" : "#fbbf24" }}>{message}</p>}
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main style={styles.page}>
        <div style={styles.card}>
          <div style={styles.brandBlock}>
            <div style={styles.logo}>V</div>
            <div>
              <div style={styles.brandName}>VERIXO</div>
              <div style={styles.brandTagline}>The Complete Construction Platform</div>
              <div style={styles.brandBy}>by Shilacon</div>
            </div>
          </div>
          <p style={styles.subtitle}>
            {mode === "forgot"
              ? "Enter your email and we'll send you a reset link."
              : "Sign in to your account."}
          </p>

          {mode !== "forgot" && (
            <div style={styles.tabs}>
              <button onClick={() => { setMode("login"); setMessage(""); }} style={mode === "login" ? styles.activeTab : styles.tab}>Login</button>
              <button onClick={() => { setMode("signup"); setMessage(""); }} style={mode === "signup" ? styles.activeTab : styles.tab}>Sign Up</button>
            </div>
          )}

          <form onSubmit={handleSubmit} style={styles.form}>
            <label style={styles.label}>Email</label>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} style={styles.input} />

            {mode !== "forgot" && (
              <>
                <label style={styles.label}>Password</label>
                <input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} style={styles.input} />
              </>
            )}

            {mode === "login" && (
              <div style={{ textAlign: "right", marginTop: 2 }}>
                <button type="button" onClick={() => { setMode("forgot"); setMessage(""); }}
                  style={{ background: "none", border: "none", color: "#94a3b8", fontSize: 12, cursor: "pointer", padding: 0 }}>
                  Forgot password?
                </button>
              </div>
            )}

            <button type="submit" disabled={authLoading} style={styles.submit}>
              {authLoading ? "Please wait…"
                : mode === "login" ? "Login"
                : mode === "signup" ? "Create Account"
                : "Send Reset Email"}
            </button>

            {mode === "signup" && (
              <p style={{ fontSize: 11, color: "#475569", textAlign: "center", margin: "8px 0 0", lineHeight: 1.6 }}>
                By creating an account you agree to our{" "}
                <a href="/terms" target="_blank" rel="noopener noreferrer" style={{ color: "#94a3b8" }}>Terms of Service</a>
                {" "}and{" "}
                <a href="/privacy" target="_blank" rel="noopener noreferrer" style={{ color: "#94a3b8" }}>Privacy Policy</a>.
              </p>
            )}
          </form>

          {mode === "forgot" && (
            <div style={{ textAlign: "center", marginTop: 14 }}>
              <button type="button" onClick={() => { setMode("login"); setMessage(""); }}
                style={{ background: "none", border: "none", color: "#94a3b8", fontSize: 13, cursor: "pointer" }}>
                ← Back to login
              </button>
            </div>
          )}

          {message && <p style={{ ...styles.message, color: messageType === "success" ? "#4ade80" : "#fbbf24" }}>{message}</p>}
        </div>
      </main>
    );
  }

  return <>{children}</>;
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", background: "radial-gradient(circle at top, rgba(245,158,11,0.12), transparent 35%), #07090c", color: "white", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "Arial, sans-serif" },
  card: { width: "100%", maxWidth: 430, background: "#101820", border: "1px solid #243241", borderRadius: 20, padding: 32, boxShadow: "0 30px 80px rgba(0,0,0,0.45)" },
  brandBlock: { display: "flex", alignItems: "center", gap: 16, marginBottom: 24 },
  logo: { width: 52, height: 52, borderRadius: 14, background: "#f59e0b", color: "#111827", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 22, flexShrink: 0 },
  brandName: { fontSize: 28, fontWeight: 900, letterSpacing: "0.12em", color: "#f1f5f9", lineHeight: 1 },
  brandTagline: { fontSize: 12, color: "#94a3b8", marginTop: 4, letterSpacing: "0.02em" },
  brandBy: { fontSize: 11, color: "#4b5f72", marginTop: 3, letterSpacing: "0.05em" },
  title: { fontSize: 34, fontWeight: 900, margin: 0 },
  subtitle: { color: "#94a3b8", marginTop: 0, marginBottom: 4, lineHeight: 1.5, fontSize: 14 },
  tabs: { display: "flex", gap: 10, marginTop: 28 },
  tab: { flex: 1, padding: "12px 16px", borderRadius: 10, border: "1px solid #334155", background: "#1e293b", color: "#cbd5e1", cursor: "pointer", fontWeight: 700 },
  activeTab: { flex: 1, padding: "12px 16px", borderRadius: 10, border: "1px solid #f59e0b", background: "#f59e0b", color: "#111827", cursor: "pointer", fontWeight: 900 },
  form: { display: "flex", flexDirection: "column", gap: 10, marginTop: 24 },
  label: { color: "#cbd5e1", fontSize: 14, marginTop: 8 },
  input: { background: "#0f172a", color: "white", border: "1px solid #334155", borderRadius: 10, padding: 14, fontSize: 16, outline: "none" },
  submit: { marginTop: 16, background: "#f59e0b", color: "#111827", border: 0, borderRadius: 10, padding: 14, fontSize: 16, fontWeight: 900, cursor: "pointer" },
  message: { marginTop: 18, fontSize: 14 },
  muted: { color: "#94a3b8" },
};
