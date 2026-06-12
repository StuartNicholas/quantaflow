"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type AuthGateProps = {
  children: React.ReactNode;
};

export default function AuthGate({ children }: AuthGateProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [loading, setLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function loadSession() {
      const { data } = await supabase.auth.getSession();
      setUser(data.session?.user ?? null);
      setLoading(false);
    }

    loadSession();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setMessage("");
    setAuthLoading(true);

    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setMessage("Account created. Check your email if confirmation is enabled.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        setMessage("Signed in successfully.");
      }
    } catch (error: any) {
      setMessage(error.message || "Authentication failed.");
    } finally {
      setAuthLoading(false);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  if (loading) {
    return (
      <main style={styles.page}>
        <p style={styles.muted}>Loading QuantaFlow...</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main style={styles.page}>
        <div style={styles.card}>
          <div style={styles.logo}>QF</div>

          <h1 style={styles.title}>QuantaFlow</h1>
          <p style={styles.subtitle}>
            Sign in to access your construction estimating platform.
          </p>

          <div style={styles.tabs}>
            <button
              onClick={() => setMode("login")}
              style={mode === "login" ? styles.activeTab : styles.tab}
            >
              Login
            </button>
            <button
              onClick={() => setMode("signup")}
              style={mode === "signup" ? styles.activeTab : styles.tab}
            >
              Sign Up
            </button>
          </div>

          <form onSubmit={handleSubmit} style={styles.form}>
            <label style={styles.label}>Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              style={styles.input}
            />

            <label style={styles.label}>Password</label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              style={styles.input}
            />

            <button type="submit" disabled={authLoading} style={styles.submit}>
              {authLoading ? "Please wait..." : mode === "login" ? "Login" : "Create Account"}
            </button>
          </form>

          {message && <p style={styles.message}>{message}</p>}
        </div>
      </main>
    );
  }

  return (
    <>
      <div style={styles.userBar}>
        <span>{user.email}</span>
        <button onClick={signOut} style={styles.logout}>
          Logout
        </button>
      </div>
      {children}
    </>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background:
      "radial-gradient(circle at top, rgba(245,158,11,0.12), transparent 35%), #07090c",
    color: "white",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    fontFamily: "Arial, sans-serif",
  },
  card: {
    width: "100%",
    maxWidth: 430,
    background: "#101820",
    border: "1px solid #243241",
    borderRadius: 20,
    padding: 32,
    boxShadow: "0 30px 80px rgba(0,0,0,0.45)",
  },
  logo: {
    width: 48,
    height: 48,
    borderRadius: 12,
    background: "#f59e0b",
    color: "#111827",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 900,
    marginBottom: 20,
  },
  title: {
    fontSize: 34,
    fontWeight: 900,
    margin: 0,
  },
  subtitle: {
    color: "#94a3b8",
    marginTop: 10,
    lineHeight: 1.5,
  },
  tabs: {
    display: "flex",
    gap: 10,
    marginTop: 28,
  },
  tab: {
    flex: 1,
    padding: "12px 16px",
    borderRadius: 10,
    border: "1px solid #334155",
    background: "#1e293b",
    color: "#cbd5e1",
    cursor: "pointer",
    fontWeight: 700,
  },
  activeTab: {
    flex: 1,
    padding: "12px 16px",
    borderRadius: 10,
    border: "1px solid #f59e0b",
    background: "#f59e0b",
    color: "#111827",
    cursor: "pointer",
    fontWeight: 900,
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    marginTop: 24,
  },
  label: {
    color: "#cbd5e1",
    fontSize: 14,
    marginTop: 8,
  },
  input: {
    background: "#0f172a",
    color: "white",
    border: "1px solid #334155",
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    outline: "none",
  },
  submit: {
    marginTop: 16,
    background: "#f59e0b",
    color: "#111827",
    border: 0,
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    fontWeight: 900,
    cursor: "pointer",
  },
  message: {
    color: "#fbbf24",
    marginTop: 18,
    fontSize: 14,
  },
  muted: {
    color: "#94a3b8",
  },
  userBar: {
    position: "fixed",
    top: 16,
    right: 16,
    zIndex: 9999,
    background: "#101820",
    border: "1px solid #243241",
    borderRadius: 12,
    padding: "10px 12px",
    color: "white",
    display: "flex",
    gap: 12,
    alignItems: "center",
    fontFamily: "Arial, sans-serif",
    fontSize: 14,
  },
  logout: {
    background: "#dc2626",
    color: "white",
    border: 0,
    borderRadius: 8,
    padding: "6px 10px",
    cursor: "pointer",
    fontWeight: 700,
  },
};