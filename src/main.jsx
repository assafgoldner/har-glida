import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { supabase } from "./supabaseClient";
import { getRole } from "./db";
import Login from "./Login";
import App from "./App";

function Root() {
  const [session, setSession] = useState(undefined); // undefined = loading
  const [role, setRole] = useState(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session === undefined) return;
    if (!session) { setRole(null); return; }
    getRole(session.user.email).then(setRole);
  }, [session]);

  const signOut = async () => { await supabase.auth.signOut(); setRole(null); };

  // loading
  if (session === undefined || (session && role === undefined)) {
    return (
      <div dir="rtl" style={loaderWrap}>
        <div style={{ textAlign: "center", color: "#a2917d" }}>
          <div style={{ fontSize: 44 }}>🍦</div>
          <div style={{ marginTop: 8, fontWeight: 600 }}>טוען…</div>
        </div>
      </div>
    );
  }

  // not logged in
  if (!session) return <Login />;

  // logged in but email not in allowed_emails
  if (!role) {
    return (
      <div dir="rtl" style={loaderWrap}>
        <div style={noAccessCard}>
          <div style={{ fontSize: 40 }}>🔒</div>
          <div style={{ fontWeight: 800, fontSize: 20, margin: "10px 0 6px" }}>אין הרשאת גישה</div>
          <div style={{ color: "#a2917d", fontSize: 14, lineHeight: 1.6 }}>
            המייל <b>{session.user.email}</b> אינו ברשימת חברות הועד.
            פני לאדמין כדי שיוסיף אותך.
          </div>
          <button style={signOutBtn} onClick={signOut}>התנתקות</button>
        </div>
      </div>
    );
  }

  return <App session={session} role={role} onSignOut={signOut} />;
}

const loaderWrap = { fontFamily: "'Heebo', sans-serif", background: "#FBF7F0",
  minHeight: "100vh", display: "grid", placeItems: "center", padding: 20 };
const noAccessCard = { background: "#fff", border: "1px solid #f0e6d6", borderRadius: 20,
  padding: 32, maxWidth: 380, textAlign: "center", boxShadow: "0 12px 40px rgba(0,0,0,.06)" };
const signOutBtn = { marginTop: 18, border: "1px solid #e6dccb", background: "#fff",
  color: "#8a7c6d", borderRadius: 10, padding: "10px 18px", fontWeight: 600, cursor: "pointer",
  fontFamily: "inherit" };

// Heebo font
const link = document.createElement("link");
link.rel = "stylesheet";
link.href = "https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;600;700;800&display=swap";
document.head.appendChild(link);
document.body.style.margin = "0";

createRoot(document.getElementById("root")).render(<Root />);
