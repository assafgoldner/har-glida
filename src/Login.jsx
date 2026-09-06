import React, { useState } from "react";
import { supabase } from "./supabaseClient";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const signIn = async () => {
    if (!email || !password) return;
    setBusy(true); setErr("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      if (/invalid login credentials/i.test(error.message)) {
        setErr("אימייל או סיסמה שגויים.");
      } else {
        setErr(error.message);
      }
    }
    // on success, the auth listener in main.jsx takes over automatically
  };

  return (
    <div dir="rtl" style={S.wrap}>
      <div style={S.card}>
        <div style={S.logo}>🍦</div>
        <div style={S.title}>הר גלידה</div>
        <div style={S.sub}>ניהול ועד הגן</div>

        <input style={S.input} type="email" placeholder="אימייל" autoComplete="username"
          value={email} onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && signIn()} />
        <input style={S.input} type="password" placeholder="סיסמה" autoComplete="current-password"
          value={password} onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && signIn()} />

        <button style={{ ...S.btn, opacity: email && password && !busy ? 1 : 0.5 }}
          disabled={!email || !password || busy} onClick={signIn}>
          {busy ? "מתחבר…" : "התחברות"}
        </button>

        {err && <div style={S.err}>{err}</div>}
        <div style={S.foot}>הגישה מוגבלת לחברות הועד בלבד</div>
      </div>
    </div>
  );
}

const S = {
  wrap: { fontFamily: "'Heebo', sans-serif", background: "#FBF7F0", minHeight: "100vh",
    display: "grid", placeItems: "center", padding: 20 },
  card: { background: "#fff", border: "1px solid #f0e6d6", borderRadius: 22, padding: "36px 32px",
    width: "100%", maxWidth: 360, textAlign: "center", boxShadow: "0 12px 40px rgba(0,0,0,.06)" },
  logo: { fontSize: 46 },
  title: { fontWeight: 800, fontSize: 26, marginTop: 6 },
  sub: { color: "#a2917d", fontSize: 14, marginBottom: 26 },
  input: { width: "100%", border: "1px solid #e6dccb", borderRadius: 12, padding: "12px 14px",
    fontSize: 15, marginBottom: 10, fontFamily: "inherit", boxSizing: "border-box" },
  btn: { width: "100%", padding: "12px", border: "none", borderRadius: 12,
    background: "#E8833A", color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer",
    fontFamily: "inherit", marginTop: 4 },
  err: { color: "#c0392b", fontSize: 13, marginTop: 12 },
  foot: { color: "#b3a595", fontSize: 12, marginTop: 22 },
};
