"use client";

import { useState } from "react";

export default function LoginForm() {
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ passcode }),
    });
    if (res.ok) {
      window.location.href = "/";
      return;
    }
    setError((await res.json()).error ?? "That passcode isn't right.");
    setBusy(false);
  }

  return (
    <form className="card stack" onSubmit={submit}>
      <label htmlFor="passcode">Passcode</label>
      <input
        id="passcode"
        type="password"
        autoComplete="current-password"
        value={passcode}
        onChange={(e) => setPasscode(e.target.value)}
        required
      />
      {error && <p className="error" role="alert">{error}</p>}
      <button className="primary" disabled={busy}>{busy ? "Checking…" : "Open calendar"}</button>
    </form>
  );
}
