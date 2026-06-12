# QuantaFlow — Construction Hub

AI takeoff · Cabinetry estimating engine · Quoting · Scheduling · Job costing · Purchase orders · Progress claims.

This is the complete app as a Next.js project: open it in VSCode, install, add an AI key, and launch.

---

## ⚠ Before anything else

1. **Revoke your old OpenAI key.** The key that was in your previous `.env.local.txt` was shared in plain text, which means it is compromised. Go to platform.openai.com → API Keys → revoke it → create a new one. Never paste keys into chats, emails, or commits.
2. **The env file must be named exactly `.env.local`** — Next.js does not read `.env.local.txt`.

---

## Launch (5 steps)

1. **Unzip** this folder somewhere sensible (e.g. `Documents/quantaflow`) and open it in VSCode (`File → Open Folder`).
2. **Node 20+** required — check with `node -v` in the VSCode terminal. If missing/old, install from nodejs.org (LTS).
3. **Install dependencies** — in the VSCode terminal:
   ```bash
   npm install
   ```
4. **Add your AI key** — copy `.env.local.example` to a new file named `.env.local`, and fill in ONE of:
   - `ANTHROPIC_API_KEY=` (preferred — the takeoff prompts were tuned on Claude; get one at console.anthropic.com), or
   - `OPENAI_API_KEY=` (your NEW key; the built-in proxy auto-adapts requests to gpt-4o vision).
5. **Run it:**
   ```bash
   npm run dev
   ```
   Open http://localhost:3000 — you'll see the QuantaFlow dashboard.

If the AI Extract button errors with "No AI key configured", the `.env.local` file is misnamed, empty, or the dev server wasn't restarted after editing it.

---

## What's inside

```
quantaflow/
  app/
    layout.tsx            ← page shell + metadata
    page.tsx              ← renders the app
    api/ai/route.ts       ← server-side AI proxy (your key stays on the server)
  components/
    ConstructionHub.jsx   ← the entire QuantaFlow application
  .env.local.example      ← rename to .env.local and add your key
  package.json            ← dependencies (next, react, openai)
  tsconfig.json
  next.config.ts
```

The AI connection defaults to the built-in `/api/ai` proxy — the production-correct architecture: the browser never sees your API key, and when you later add accounts you can meter usage per customer in this one file.

---

## Deploying to the internet (when ready)

1. Push the folder to a private GitHub repository.
2. Go to vercel.com → New Project → import the repo (Vercel auto-detects Next.js).
3. In Vercel → Project → Settings → Environment Variables, add `ANTHROPIC_API_KEY` (or `OPENAI_API_KEY`).
4. Deploy — you'll get a live URL on the spot. **Do not share the URL publicly yet**: there are no logins, so anyone with the link can use the app (and your AI budget).

---

## Honest limitations (the roadmap items)

- **Data is per-browser localStorage.** Each browser/device has its own data; clearing site data deletes it. Use Settings → Export All Data for backups (the app nags you weekly). Fixing this properly = the Supabase phase in the Tier-1 roadmap document.
- **No logins / multi-user yet.** That's the Supabase auth + database step — it cannot be done in a file; it's the first item on your outside-of-Claude work list.
- **Xero is simulated** until the real OAuth app is registered at developer.xero.com.
- **Quotes print via the browser** (Print → Save as PDF) until server-side PDF + email is built.

Build order and full details: see `quantaflow-tier1-roadmap.md` from our earlier work.
