import React, { useState } from "react";
import { supabase } from "./supabaseClient";

export default function Login() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const signInGoogle = async () => {
    setErr("");
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (error) setErr(error.message);
  };

  const signInMagic = async () => {
    if (!email) return;
    setBusy(true); setErr("");
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    setBusy(false);
    if (error) setErr(error.message);
    else setSent(true);
  };

  return (
    <div dir="rtl" style={S.wrap}>
      <div style={S.card}>
        <div style={S.logo}>🍦</div>
        <div style={S.title}>הר גלידה</div>
        <div style={S.sub}>ניהול ועד הגן</div>

        {sent ? (
          <div style={S.sentBox}>
            שלחנו קישור התחברות ל־<b>{email}</b>.<br />
            פתחי את המייל ולחצי על הקישור כדי להיכנס.
          </div>
        ) : (
          <>
            <button style={S.googleBtn} onClick={signInGoogle}>
              <GoogleIcon /> התחברות עם Google
            </button>

            <div style={S.divider}><span>או</span></div>

            <input style={S.input} type="email" placeholder="הזיני את המייל שלך"
              value={email} onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && signInMagic()} />
            <button style={{ ...S.magicBtn, opacity: email && !busy ? 1 : 0.5 }}
              disabled={!email || busy} onClick={signInMagic}>
              {busy ? "שולח…" : "שליחת קישור התחברות"}
            </button>
          </>
        )}

        {err && <div style={S.err}>{err}</div>}
        <div style={S.foot}>הגישה מוגבלת לחברות הועד בלבד</div>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.6 30.2 0 24 0 14.6 0 6.4 5.4 2.6 13.2l7.8 6.1C12.3 13.4 17.6 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.1 24.6c0-1.6-.1-3.1-.4-4.6H24v9.1h12.4c-.5 2.9-2.1 5.3-4.6 6.9l7.1 5.5c4.2-3.9 6.6-9.6 6.6-16.9z"/>
      <path fill="#FBBC05" d="M10.4 28.3c-.5-1.4-.7-2.9-.7-4.3s.3-3 .7-4.3l-7.8-6.1C1 16.5 0 20.1 0 24s1 7.5 2.6 10.4l7.8-6.1z"/>
      <path fill="#34A853" d="M24 48c6.2 0 11.4-2 15.2-5.5l-7.1-5.5c-2 1.4-4.6 2.2-8.1 2.2-6.4 0-11.7-3.9-13.6-9.4l-7.8 6.1C6.4 42.6 14.6 48 24 48z"/>
    </svg>
  );
}

const S = {
  wrap: { fontFamily: "'Heebo', sans-serif", background: "#FBF7F0", minHeight: "100vh",
    display: "grid", placeItems: "center", padding: 20 },
  card: { background: "#fff", border: "1px solid #f0e6d6", borderRadius: 22, padding: "36px 32px",
    width: "100%", maxWidth: 380, textAlign: "center", boxShadow: "0 12px 40px rgba(0,0,0,.06)" },
  logo: { fontSize: 46 },
  title: { fontWeight: 800, fontSize: 26, marginTop: 6 },
  sub: { color: "#a2917d", fontSize: 14, marginBottom: 26 },
  googleBtn: { display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
    width: "100%", padding: "12px", border: "1px solid #e6dccb", borderRadius: 12,
    background: "#fff", fontWeight: 600, fontSize: 15, cursor: "pointer", fontFamily: "inherit" },
  divider: { display: "flex", alignItems: "center", textAlign: "center", color: "#c3b5a3",
    fontSize: 13, margin: "18px 0" },
  input: { width: "100%", border: "1px solid #e6dccb", borderRadius: 12, padding: "12px 14px",
    fontSize: 15, marginBottom: 10, fontFamily: "inherit", boxSizing: "border-box" },
  magicBtn: { width: "100%", padding: "12px", border: "none", borderRadius: 12,
    background: "#E8833A", color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer",
    fontFamily: "inherit" },
  sentBox: { background: "#e9f6ee", border: "1px solid #c5e8d2", borderRadius: 12,
    padding: 16, fontSize: 14, color: "#2b7a4b", lineHeight: 1.6 },
  err: { color: "#c0392b", fontSize: 13, marginTop: 12 },
  foot: { color: "#b3a595", fontSize: 12, marginTop: 22 },
};
