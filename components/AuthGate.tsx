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
        const { error } = await supabase.auth.signUp({
          email,
          password,
        });

        if (error) throw error;

        setMessage("Account created. Check your email if confirmation is enabled.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

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
      <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
        <p className="text-slate-400">Loading QuantaFlow...</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-8">
          <h1 className="text-3xl font-bold">QuantaFlow</h1>
          <p className="text-slate-400 mt-2">
            Sign in to access your construction estimating platform.
          </p>

          <div className="flex gap-2 mt-6">
            <button
              onClick={() => setMode("login")}
              className={`flex-1 rounded-lg px-4 py-3 font-semibold ${
                mode === "login" ? "bg-amber-500 text-black" : "bg-slate-800"
              }`}
            >
              Login
            </button>
            <button
              onClick={() => setMode("signup")}
              className={`flex-1 rounded-lg px-4 py-3 font-semibold ${
                mode === "signup" ? "bg-amber-500 text-black" : "bg-slate-800"
              }`}
            >
              Sign Up
            </button>
          </div>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label className="text-sm text-slate-400">Email</label>
              <input
                type="email"
                required
                className="w-full mt-2 bg-slate-800 border border-slate-700 rounded-lg p-3"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>

            <div>
              <label className="text-sm text-slate-400">Password</label>
              <input
                type="password"
                required
                minLength={6}
                className="w-full mt-2 bg-slate-800 border border-slate-700 rounded-lg p-3"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>

            <button
              type="submit"
              disabled={authLoading}
              className="w-full bg-amber-500 hover:bg-amber-400 disabled:bg-slate-700 text-black rounded-lg px-4 py-3 font-bold"
            >
              {authLoading ? "Please wait..." : mode === "login" ? "Login" : "Create Account"}
            </button>
          </form>

          {message && <p className="mt-4 text-sm text-amber-300">{message}</p>}
        </div>
      </main>
    );
  }

  return (
    <>
      <div className="fixed top-4 right-4 z-50 flex items-center gap-3 bg-slate-900 border border-slate-800 rounded-xl px-4 py-2 text-sm text-white">
        <span className="text-slate-300">{user.email}</span>
        <button
          onClick={signOut}
          className="bg-red-600 hover:bg-red-500 rounded-lg px-3 py-1 font-semibold"
        >
          Logout
        </button>
      </div>
      {children}
    </>
  );
}