import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Wallet, Users, Receipt, Calculator, CalendarDays, Plus, Trash2,
  Check, X, Link2, Download, ChevronLeft, ChevronRight, Search,
  ArrowUpRight, Clock, CheckCircle2, Circle, PartyPopper, Gift,
  Utensils, PencilRuler, Dribbble, Settings, RefreshCw, LogOut, ListChecks
} from "lucide-react";
import { supabase } from "./supabaseClient";
import { loadAll } from "./db";
import { syncToSupabase } from "./sync";

/* ============================================================================
   Helpers
   ========================================================================== */
const ILS = (n) => "₪" + (Math.round(n)).toLocaleString("he-IL");
const uid = () => (crypto?.randomUUID ? crypto.randomUUID()
  : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0; return (c === "x" ? r : (r & 0x3 | 0x8)).toString(16);
    }));
const ICONS = { Utensils, Gift, PencilRuler, Dribbble, Wallet, PartyPopper, CalendarDays, Receipt };
const FUND_ICON_CHOICES = ["Utensils", "Gift", "PencilRuler", "Dribbble", "Wallet", "PartyPopper", "CalendarDays", "Receipt"];
const FUND_COLORS = ["#E8833A", "#C9508A", "#3D9BE9", "#4CA96B", "#8B5CF6", "#EAB308", "#EC4899", "#14B8A6"];
// collected for a fund = sum of what every child paid into it + unassigned imports
const fundCollected = (f, children = [], payments = {}) =>
  children.reduce((s, c) => s + (Number(payments[`${c.id}_${f.id}`]) || 0), 0) +
  (Number(f.unassignedCollected) || 0);
// expected = annual fee × number of children
const fundExpected = (f, childCount = 0) => (Number(f.annualFee) || 0) * childCount;
// spent = money out logged on the groups + expenses recorded against this fund
const fundSpent = (f, expenses = []) =>
  f.groups.reduce((s, g) => s + (Number(g.spent) || 0), 0) +
  expenses.filter((e) => e.fundId === f.id).reduce((s, e) => s + (Number(e.amount) || 0), 0);
const fundBalance = (f, children = [], payments = {}, expenses = []) =>
  fundCollected(f, children, payments) - fundSpent(f, expenses);
// per-child helpers
const childPaid = (payments, cid, fid) => Number(payments[`${cid}_${fid}`]) || 0;
const childStatus = (paid, fee) => {
  if (paid <= 0) return "none";
  if (paid >= fee) return "full";
  return "partial";
};
const statusStyle = (st) =>
  st === "full" ? { color: "#4CA96B", background: "#e9f6ee" }
  : st === "partial" ? { color: "#c07a2e", background: "#fdf0e0" }
  : { color: "#c98", background: "#fdeee6" };

const EVENT_TYPES = {
  birthday: { label: "יום הולדת", color: "#C9508A", Icon: Gift },
  holiday:  { label: "חג",        color: "#E8833A", Icon: PartyPopper },
  party:    { label: "מסיבה",     color: "#3D9BE9", Icon: PartyPopper },
  other:    { label: "אחר",       color: "#4CA96B", Icon: CalendarDays },
};

// date helpers (local, no time component)
const todayStr = () => new Date().toISOString().slice(0, 10);
const addDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
// events within the next 7 days (inclusive of today), sorted
const weekEvents = (events) => {
  const from = todayStr(), to = addDays(7);
  return events.filter((e) => e.date >= from && e.date <= to)
    .sort((a, b) => a.date.localeCompare(b.date));
};
const dayLabel = (dateStr) => {
  if (dateStr === todayStr()) return "היום";
  if (dateStr === addDays(1)) return "מחר";
  return new Date(dateStr).toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long" });
};
const isSoon = (dateStr) => dateStr === todayStr() || dateStr === addDays(1);

/* ============================================================================
   App
   ========================================================================== */
const clone = (o) => JSON.parse(JSON.stringify(o));

export default function App({ session, role, onSignOut }) {
  const [db, setDb] = useState(null);
  const [tab, setTab] = useState("funds");
  const [syncErr, setSyncErr] = useState("");
  const isAdmin = role === "admin";

  const reload = useCallback(async () => {
    try { setDb(await loadAll()); }
    catch (e) { setSyncErr("שגיאה בטעינת נתונים: " + (e.message || e)); }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  // Apply the mutation locally for instant UI, then persist the diff.
  // On failure, reload from server to stay consistent.
  const update = useCallback((fn) => {
    setDb((prev) => {
      const next = fn(clone(prev));
      syncToSupabase(prev, next).catch((e) => {
        setSyncErr("שגיאה בשמירה: " + (e.message || e));
        reload();
      });
      return next;
    });
  }, [reload]);

  const totalBalance = useMemo(
    () => (db ? db.funds.reduce((s, f) => s + fundBalance(f, db.children, db.payments, db.expenses), 0) : 0), [db]);

  if (!db) return (
    <div dir="rtl" style={{ ...S.app, display: "grid", placeItems: "center", minHeight: "100vh" }}>
      <style>{CSS}</style>
      <div style={{ textAlign: "center", color: "#a2917d" }}>
        <div style={{ fontSize: 44 }}>🍦</div>
        <div style={{ marginTop: 8, fontWeight: 600 }}>טוען את הר גלידה…</div>
        {syncErr && <div style={{ marginTop: 12, color: "#c0392b", fontSize: 13 }}>{syncErr}</div>}
      </div>
    </div>
  );

  const tabs = [
    { id: "funds", label: "קופות", Icon: Wallet },
    { id: "requests", label: "החזרים", Icon: Receipt },
    { id: "tasks", label: "משימות", Icon: ListChecks },
    { id: "planner", label: "תכנון", Icon: Calculator },
    { id: "calendar", label: "אירועים", Icon: CalendarDays },
    { id: "roster", label: "ילדים", Icon: Users },
  ];
  const pendingCount = db.requests.filter((r) => r.status === "pending").length;
  const openTasks = db.tasks.filter((t) => !t.done).length;

  return (
    <div dir="rtl" style={S.app}>
      <style>{CSS}</style>

      {/* Header */}
      <header style={S.header}>
        <div style={S.brand}>
          <div style={S.logo}>🍦</div>
          <div>
            <div style={S.brandName}>הר גלידה</div>
            <div style={S.brandSub}>ניהול ועד הגן</div>
          </div>
        </div>
        <div style={S.headerRight}>
          <div style={S.totalPill}>
            <span style={S.totalLabel}>סה״כ בקופות</span>
            <span style={S.totalVal}>{ILS(totalBalance)}</span>
          </div>
          <div style={{ ...S.roleBtn, ...(isAdmin ? S.roleAdmin : {}), cursor: "default" }}
            title={session?.user?.email || ""}>
            {isAdmin ? "אדמין" : "צופה"}
          </div>
          <button style={S.logoutBtn} onClick={onSignOut} title="התנתקות">
            <LogOut size={16} />
          </button>
        </div>
      </header>

      {/* Tabs */}
      <nav style={S.tabbar}>
        {tabs.map((t) => (
          <button key={t.id}
            onClick={() => setTab(t.id)}
            style={{ ...S.tab, ...(tab === t.id ? S.tabActive : {}) }}>
            <t.Icon size={18} />
            <span>{t.label}</span>
            {t.id === "requests" && pendingCount > 0 && (
              <span style={S.badge}>{pendingCount}</span>
            )}
            {t.id === "tasks" && openTasks > 0 && (
              <span style={S.badge}>{openTasks}</span>
            )}
          </button>
        ))}
      </nav>

      <main style={S.main}>
        {tab === "funds" && <FundsView db={db} update={update} isAdmin={isAdmin} />}
        {tab === "requests" && <RequestsView db={db} update={update} isAdmin={isAdmin} />}
        {tab === "tasks" && <TasksView db={db} update={update} />}
        {tab === "planner" && <PlannerView db={db} />}
        {tab === "calendar" && <CalendarView db={db} update={update} isAdmin={isAdmin} />}
        {tab === "roster" && <RosterView db={db} update={update} isAdmin={isAdmin} />}
      </main>

      <footer style={S.footer}>
        {syncErr ? <span style={{ color: "#c0392b" }}>{syncErr}</span>
          : "הר גלידה · ניהול ועד הגן · נתונים משותפים לכל חברות הועד"}
      </footer>
    </div>
  );
}

/* ============================================================================
   FUNDS
   ========================================================================== */
function FundsView({ db, update, isAdmin }) {
  const [openFund, setOpenFund] = useState(null);
  const [showAddFund, setShowAddFund] = useState(false);
  const fund = db.funds.find((f) => f.id === openFund);
  const thisWeek = weekEvents(db.events);

  return (
    <div>
      {thisWeek.length > 0 && (
        <div style={S.weekPanel}>
          <div style={S.weekHead}>
            <CalendarDays size={16} style={{ color: "#E8833A" }} />
            <span>אירועי השבוע</span>
          </div>
          {thisWeek.map((e) => {
            const t = EVENT_TYPES[e.type] || EVENT_TYPES.other;
            const soon = isSoon(e.date);
            return (
              <div key={e.id} style={S.weekItem}>
                <div style={S.weekRow}>
                  <span style={{ ...S.weekDot, background: t.color }} />
                  <span style={{ ...S.weekTitle, fontWeight: soon ? 800 : 600,
                    color: soon ? "#2b2320" : "#5a4d3f" }}>{e.title}</span>
                  <span style={{ ...S.weekWhen, fontWeight: soon ? 800 : 500,
                    color: soon ? t.color : "#a2917d" }}>{dayLabel(e.date)}</span>
                </div>
                {e.note && (
                  <div style={S.weekNote}>📌 {e.note}</div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <SectionHead title="קופות הגן"
        action={isAdmin && (
          <button style={S.primaryBtn} onClick={() => setShowAddFund(true)}>
            <Plus size={15} /> קופה
          </button>
        )} />

      <div style={S.fundGrid}>
        {db.funds.map((f) => {
          const bal = fundBalance(f, db.children, db.payments, db.expenses);
          const collected = fundCollected(f, db.children, db.payments);
          const spent = fundSpent(f, db.expenses);
          const exp = fundExpected(f, db.children.length);
          const pct = exp > 0 ? Math.min(100, (collected / exp) * 100) : 0;
          const Icon = ICONS[f.icon] || Wallet;
          return (
            <button key={f.id} style={S.fundCard} onClick={() => setOpenFund(f.id)}>
              <div style={S.fundTop}>
                <div style={{ ...S.fundIcon, background: f.color + "22", color: f.color }}>
                  <Icon size={22} />
                </div>
                <span style={S.fundGroupsTag}>{f.groups.length} קבוצות</span>
              </div>
              <div style={S.fundName}>{f.name}</div>
              <div style={S.fundBalRow}>
                <span style={S.fundBalLabel}>יתרה</span>
                <span style={S.fundBal}>{ILS(bal)}</span>
              </div>
              <div style={S.barTrack}>
                <div style={{ ...S.barFill, width: pct + "%", background: f.color }} />
              </div>
              <div style={S.fundExp}>
                נגבה {ILS(collected)} מ־{ILS(exp)}
                {spent > 0 && <span style={{ color: "#c07a5a" }}> · הוצא {ILS(spent)}</span>}
              </div>
            </button>
          );
        })}
      </div>

      {fund && (
        <Modal onClose={() => setOpenFund(null)} title={`קופת ${fund.name}`}>
          <FundDetail fund={fund} db={db} update={update} isAdmin={isAdmin}
            onClose={() => setOpenFund(null)} />
        </Modal>
      )}
      {showAddFund && (
        <Modal onClose={() => setShowAddFund(false)} title="קופה חדשה">
          <FundForm update={update} onDone={() => setShowAddFund(false)} />
        </Modal>
      )}
    </div>
  );
}

function FundForm({ update, onDone }) {
  const [f, setF] = useState({
    name: "", annualFee: "", icon: FUND_ICON_CHOICES[0], color: FUND_COLORS[0],
    groupLabel: "קבוצה ראשית", link: "",
  });
  const valid = f.name.trim();
  const submit = () => {
    update((d) => {
      const fid = "f" + uid();
      d.funds.push({
        id: fid, name: f.name.trim(), icon: f.icon, color: f.color,
        annualFee: Number(f.annualFee) || 0, unassignedCollected: 0,
        groups: [{ id: "g" + uid(), label: f.groupLabel || "קבוצה ראשית",
          link: f.link, collected: 0, spent: 0 }],
      });
      return d;
    });
    onDone();
  };
  return (
    <div style={S.form}>
      <Field label="שם הקופה">
        <input style={S.input} value={f.name} placeholder="למשל: טיולים"
          onChange={(e) => setF({ ...f, name: e.target.value })} />
      </Field>
      <Field label="תשלום שנתי לילד (₪)">
        <input type="number" style={S.input} value={f.annualFee}
          onChange={(e) => setF({ ...f, annualFee: e.target.value })} />
      </Field>
      <Field label="אייקון">
        <div style={S.iconPicker}>
          {FUND_ICON_CHOICES.map((ic) => {
            const Ic = ICONS[ic];
            const on = f.icon === ic;
            return (
              <button key={ic} type="button"
                style={{ ...S.iconChoice, ...(on ? { borderColor: f.color, background: f.color + "18" } : {}) }}
                onClick={() => setF({ ...f, icon: ic })}>
                <Ic size={20} style={{ color: on ? f.color : "#9a8c7d" }} />
              </button>
            );
          })}
        </div>
      </Field>
      <Field label="צבע">
        <div style={S.colorPicker}>
          {FUND_COLORS.map((col) => (
            <button key={col} type="button"
              style={{ ...S.colorChoice, background: col,
                outline: f.color === col ? "3px solid " + col + "55" : "none" }}
              onClick={() => setF({ ...f, color: col })} />
          ))}
        </div>
      </Field>
      <Field label="שם קבוצת הפייבוקס הראשונה">
        <input style={S.input} value={f.groupLabel}
          onChange={(e) => setF({ ...f, groupLabel: e.target.value })} />
      </Field>
      <Field label="קישור לפייבוקס (לא חובה)">
        <input style={S.input} value={f.link} placeholder="https://..."
          onChange={(e) => setF({ ...f, link: e.target.value })} />
      </Field>
      <button style={{ ...S.primaryBtn, width: "100%", justifyContent: "center",
        opacity: valid ? 1 : 0.5 }} disabled={!valid} onClick={submit}>
        יצירת הקופה
      </button>
    </div>
  );
}

function FundDetail({ fund, db, update, isAdmin, onClose }) {
  const [sub, setSub] = useState("groups"); // groups | payers | expenses
  const [confirmDel, setConfirmDel] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const bal = fundBalance(fund, db.children, db.payments, db.expenses);
  const collected = fundCollected(fund, db.children, db.payments);
  const spent = fundSpent(fund, db.expenses);
  const exp = fundExpected(fund, db.children.length);

  const setGroups = (groups) =>
    update((d) => { d.funds.find((f) => f.id === fund.id).groups = groups; return d; });

  const addGroup = () => setGroups([...fund.groups,
    { id: uid(), label: "קבוצה חדשה", link: "", collected: 0, spent: 0 }]);
  const editGroup = (gid, patch) =>
    setGroups(fund.groups.map((g) => g.id === gid ? { ...g, ...patch } : g));
  const delGroup = (gid) => setGroups(fund.groups.filter((g) => g.id !== gid));

  const setPaidAmount = (childId, amount) => update((d) => {
    const f = d.funds.find((x) => x.id === fund.id);
    const fee = Number(f.annualFee) || 0;
    let v = Math.max(0, Number(amount) || 0);
    if (fee > 0) v = Math.min(v, fee); // cannot pay more than the annual fee
    d.payments[`${childId}_${fund.id}`] = v; return d;
  });
  const markFull = (childId) => update((d) => {
    d.payments[`${childId}_${fund.id}`] = Number(fund.annualFee) || 0; return d;
  });
  const markNone = (childId) => update((d) => {
    d.payments[`${childId}_${fund.id}`] = 0; return d;
  });

  const setFee = (v) => update((d) => {
    d.funds.find((f) => f.id === fund.id).annualFee = Math.max(0, Number(v) || 0); return d;
  });

  const deleteFund = () => {
    update((d) => {
      d.funds = d.funds.filter((f) => f.id !== fund.id);
      // clean up related data
      d.expenses = d.expenses.filter((e) => e.fundId !== fund.id);
      d.requests = d.requests.filter((r) => r.fundId !== fund.id);
      Object.keys(d.payments).forEach((k) => {
        if (k.endsWith(`_${fund.id}`)) delete d.payments[k];
      });
      return d;
    });
    onClose && onClose();
  };

  const addExpense = (amount, desc, date, name) => update((d) => {
    const dt = date || new Date().toISOString().slice(0, 10);
    const fp = fingerprint({ date: dt, amount: Number(amount), name: name || "", dir: "out" });
    d.expenses.unshift({ id: uid(), fundId: fund.id, amount: Number(amount),
      desc, date: dt, source: "manual", fp });
    // register in dedup list so a later import of the same txn is skipped
    if (!d.importedTxns.includes(fp)) d.importedTxns.push(fp);
    return d;
  });
  const delExpense = (eid) => update((d) => {
    const ex = d.expenses.find((e) => e.id === eid);
    if (ex && ex.fp) d.importedTxns = d.importedTxns.filter((x) => x !== ex.fp);
    d.expenses = d.expenses.filter((e) => e.id !== eid); return d;
  });

  const paidCount = db.children.filter((c) =>
    childPaid(db.payments, c.id, fund.id) >= (Number(fund.annualFee) || 0)
    && (Number(fund.annualFee) || 0) > 0).length;
  const fundExpenses = db.expenses.filter((e) => e.fundId === fund.id);

  return (
    <div>
      <div style={S.detailStats}>
        <Stat label="יתרה" value={ILS(bal)} accent={fund.color} />
        <Stat label="נגבה" value={ILS(collected)} />
        <Stat label="הוצא" value={ILS(spent)} />
      </div>
      <div style={S.detailSubStat}>
        צפי גבייה {ILS(exp)} · שילמו {paidCount}/{db.children.length}
      </div>

      {isAdmin && (
        <button style={S.importFundBtn} onClick={() => setShowImport(true)}>
          <RefreshCw size={15} /> ייבוא תנועות פייבוקס לקופה זו
        </button>
      )}

      <div style={S.pillTabs}>
        <button style={{ ...S.pillTab, ...(sub === "groups" ? S.pillTabOn : {}) }}
          onClick={() => setSub("groups")}>קבוצות</button>
        <button style={{ ...S.pillTab, ...(sub === "payers" ? S.pillTabOn : {}) }}
          onClick={() => setSub("payers")}>מי שילם</button>
        <button style={{ ...S.pillTab, ...(sub === "expenses" ? S.pillTabOn : {}) }}
          onClick={() => setSub("expenses")}>הוצאות</button>
      </div>

      {sub === "groups" && (
        <div>
          <div style={S.feeRow}>
            <span style={S.feeLabel}>תשלום שנתי לילד</span>
            <div style={S.feeInputWrap}>
              <input type="number" style={S.feeInput} value={fund.annualFee} disabled={!isAdmin}
                onChange={(e) => setFee(e.target.value)} />
              <span style={S.feeUnit}>₪</span>
            </div>
          </div>
          <div style={S.feeNote}>
            צפי גבייה = {ILS(fund.annualFee)} × {db.children.length} ילדים = {ILS(exp)}
          </div>
          {fund.groups.map((g) => (
            <div key={g.id} style={S.groupRow}>
              <div style={S.groupMain}>
                <input style={S.inlineInput} value={g.label} disabled={!isAdmin}
                  onChange={(e) => editGroup(g.id, { label: e.target.value })} />
              </div>
              <div style={S.groupLinkRow}>
                <Link2 size={14} style={{ color: "#9a8c7d", flexShrink: 0 }} />
                <input style={S.linkInput} placeholder="קישור לקבוצת פייבוקס" value={g.link}
                  disabled={!isAdmin}
                  onChange={(e) => editGroup(g.id, { link: e.target.value })} />
                {g.link && <a href={g.link} target="_blank" rel="noreferrer"
                  style={S.openLink}><ArrowUpRight size={14} /></a>}
                {isAdmin && fund.groups.length > 1 && (
                  <button style={S.iconDel} onClick={() => delGroup(g.id)}>
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
          ))}
          {isAdmin && (
            <button style={S.addGroupBtn} onClick={addGroup}>
              <Plus size={16} /> הוסף קבוצת פייבוקס
            </button>
          )}
          {isAdmin && (
            <div style={S.dangerZone}>
              {!confirmDel ? (
                <button style={S.deleteFundBtn} onClick={() => setConfirmDel(true)}>
                  <Trash2 size={15} /> מחיקת הקופה
                </button>
              ) : (
                <div style={S.confirmBox}>
                  <div style={S.confirmText}>
                    למחוק את קופת "{fund.name}"? כל התשלומים, ההוצאות והבקשות שלה יימחקו.
                  </div>
                  <div style={S.confirmActions}>
                    <button style={S.confirmDelBtn} onClick={deleteFund}>כן, מחק</button>
                    <button style={S.confirmCancelBtn} onClick={() => setConfirmDel(false)}>ביטול</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {sub === "payers" && (
        <div>
          <div style={S.payHint}>
            ודאו שההורים כותבים בפייבוקס את שם הילד — כך תדעו למי לשייך כל תשלום.
            תשלום מלא = {ILS(fund.annualFee)}.
          </div>
          {db.children.map((c) => {
            const paid = childPaid(db.payments, c.id, fund.id);
            const fee = Number(fund.annualFee) || 0;
            const st = childStatus(paid, fee);
            const statusText = st === "full" ? "שולם"
              : st === "partial" ? `שולם חלקי · ${ILS(paid)} מ־${ILS(fee)}`
              : "לא שולם";
            return (
              <div key={c.id} style={S.payRow}>
                <div style={S.payName}>
                  <div style={{ fontWeight: 600 }}>{c.child}</div>
                  <span style={{ ...S.payTag, ...statusStyle(st) }}>{statusText}</span>
                </div>
                {isAdmin && (
                  <div style={S.payEditWrap}>
                    <input type="number" style={S.payAmountInput} value={paid}
                      onChange={(e) => setPaidAmount(c.id, e.target.value)} />
                    <span style={S.payOf}>/ {fee}</span>
                    <button style={S.payCheck}
                      title={st === "full" ? "בטל סימון תשלום מלא" : "סמן ששולם במלואו"}
                      onClick={() => st === "full" ? markNone(c.id) : markFull(c.id)}>
                      {st === "full"
                        ? <CheckCircle2 size={22} style={{ color: "#4CA96B" }} />
                        : <Circle size={22} style={{ color: "#cbbfae" }} />}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {sub === "expenses" && (
        <div>
          <div style={S.payHint}>
            הוצאות שיוצאות מהקופה — משיכות מפייבוקס (מיובאות) והחזרים שאושרו נכנסות לכאן אוטומטית.
            כאן אפשר להוסיף הוצאה חד־פעמית לחריגים.
          </div>
          {isAdmin && <ExpenseAdder onAdd={addExpense} />}
          {fundExpenses.length === 0 && <Empty text="אין הוצאות רשומות" />}
          {fundExpenses.map((e) => (
            <div key={e.id} style={S.expRow}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>{e.desc || "הוצאה"}</div>
                <div style={S.paySub}>{e.date} · {SRC_LABEL[e.source] || e.source}</div>
              </div>
              <span style={{ fontWeight: 700, color: "#c07a5a" }}>−{ILS(e.amount)}</span>
              {isAdmin && e.source === "manual" && (
                <button style={S.iconDel} onClick={() => delExpense(e.id)}>
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {showImport && (
        <Modal onClose={() => setShowImport(false)} title={`ייבוא לקופת ${fund.name}`}>
          <ImportWizard db={db} update={update} fixedFundId={fund.id}
            onDone={() => setShowImport(false)} />
        </Modal>
      )}
    </div>
  );
}

const SRC_LABEL = { manual: "ידני", paybox: "פייבוקס", reimbursement: "החזר" };

function ExpenseAdder({ onAdd }) {
  const [amount, setAmount] = useState("");
  const [desc, setDesc] = useState("");
  const [name, setName] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const add = () => {
    if (!amount) return;
    onAdd(amount, desc, date, name);
    setAmount(""); setDesc(""); setName("");
  };
  return (
    <div style={S.expAdderBox}>
      <div style={S.expAdder}>
        <input style={{ ...S.input, flex: 2 }} placeholder="תיאור ההוצאה" value={desc}
          onChange={(e) => setDesc(e.target.value)} />
        <input type="number" style={{ ...S.input, flex: 1 }} placeholder="₪" value={amount}
          onChange={(e) => setAmount(e.target.value)} />
      </div>
      <div style={S.expAdder}>
        <input type="date" style={{ ...S.input, flex: 1 }} value={date}
          onChange={(e) => setDate(e.target.value)} />
        <input style={{ ...S.input, flex: 1.4 }} placeholder="שם בפייבוקס (לזיהוי כפילות)" value={name}
          onChange={(e) => setName(e.target.value)} />
        <button style={{ ...S.primaryBtn, padding: "10px 15px" }} onClick={add}>
          <Plus size={16} />
        </button>
      </div>
      <div style={S.mapNote}>
        אם תזין תאריך וסכום התואמים למה שיופיע באקספורט, האפליקציה תזהה ותדלג — לא ייספר פעמיים.
      </div>
    </div>
  );
}

/* ============================================================================
   CSV IMPORT — parse, map columns, dedup, split into collected/spent
   ========================================================================== */
// Minimal CSV parser handling quoted fields and commas.
function parseCSV(text) {
  const rows = [];
  let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else {
      if (c === '"') q = true;
      else if (c === ",") { row.push(cell); cell = ""; }
      else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
      else if (c === "\r") { /* skip */ }
      else cell += c;
    }
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim() !== ""));
}

const parseAmount = (s) => {
  if (typeof s === "number") return s;
  const n = parseFloat(String(s).replace(/[^\d.\-]/g, ""));
  return isNaN(n) ? 0 : n;
};
const fingerprint = (r) => `${r.date}|${Math.abs(r.amount)}|${(r.name || "").trim()}|${r.dir}`;

function ImportWizard({ db, update, onDone, fixedFundId }) {
  const [step, setStep] = useState("paste"); // paste | map | preview | done
  const [raw, setRaw] = useState("");
  const [rows, setRows] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [map, setMap] = useState(db.importMap || { amount: "", date: "", name: "", dir: "", balance: "" });
  const [targetFund, setTargetFund] = useState(fixedFundId || db.funds[0].id);
  const [result, setResult] = useState(null);

  const doParse = () => {
    const parsed = parseCSV(raw.trim());
    if (parsed.length < 2) return;
    setHeaders(parsed[0]);
    setRows(parsed.slice(1));
    // auto-guess mapping by header keywords
    const guess = { ...map };
    parsed[0].forEach((h) => {
      const l = h.trim();
      if (/יתר|balance|יתרה/i.test(l) && !guess.balance) guess.balance = h;
      else if (/סכום|amount|sum|₪/i.test(l) && !guess.amount) guess.amount = h;
      if (/תאריך|date/i.test(l) && !guess.date) guess.date = h;
      if (/שם|name|משלם|payer|הער|note/i.test(l) && !guess.name) guess.name = h;
      if (/סוג|כיוון|type|direction|status/i.test(l) && !guess.dir) guess.dir = h;
    });
    setMap(guess);
    setStep("map");
  };

  const buildRows = () => {
    const idx = (col) => headers.indexOf(col);
    const ai = idx(map.amount), di = idx(map.date), ni = idx(map.name), ri = idx(map.dir),
      bi = map.balance ? idx(map.balance) : -1;
    return rows.map((r) => {
      const amount = parseAmount(r[ai]);
      const dirRaw = ri >= 0 ? (r[ri] || "") : "";
      // direction: negative amount OR keyword => outgoing (spent)
      // direction: PayBox uses "העברה לקבוצה" (deposit/in) vs "תשלום מהקבוצה" (withdrawal/out).
      // A negative amount always means outgoing. Keyword "מהקבוצה"/"משיכה"/"יוצא" => out.
      const isOut = amount < 0 || /מהקבוצה|משיכה|יוצא|out|withdraw|debit/i.test(dirRaw);
      return {
        date: (r[di] || "").trim(),
        amount: Math.abs(amount),
        name: ni >= 0 ? (r[ni] || "").trim() : "",
        dir: isOut ? "out" : "in",
        fileBalance: bi >= 0 ? parseAmount(r[bi]) : null,
      };
    }).filter((r) => r.amount > 0);
  };

  const doPreview = () => {
    const parsed = buildRows();
    const tFund = db.funds.find((f) => f.id === targetFund);
    const seen = new Set(db.importedTxns);
    const fresh = parsed.filter((r) => !seen.has(fingerprint(r)));
    const dupes = parsed.length - fresh.length;

    // suspicion check: an outgoing row that resembles an EXISTING expense
    // (same amount, date within 4 days) even though the fingerprint differed.
    const daysApart = (a, b) => {
      const da = new Date(a), db2 = new Date(b);
      if (isNaN(da) || isNaN(db2)) return 999;
      return Math.abs(da - db2) / 86400000;
    };
    const fundNameOf = (id) => db.funds.find((f) => f.id === id)?.name || "קופה";
    const suspectOf = (r) => {
      if (r.dir !== "out") return null;
      // look across ALL funds, not just the selected one
      const hit = db.expenses.find((e) =>
        Math.abs(Number(e.amount) - r.amount) < 0.5 &&
        daysApart(e.date, r.date) <= 14);
      if (!hit) return null;
      return {
        desc: hit.desc || "הוצאה קיימת",
        amount: Number(hit.amount) || 0,
        date: hit.date,
        fundName: fundNameOf(hit.fundId),
        source: hit.source,
      };
    };

    const matchChild = (name) => db.children.find((c) => {
      if (!name) return false;
      if (name.includes(c.child) || c.child.includes(name)) return true;
      const tokens = (c.parents || "").split(/\s+/).filter((t) => t.length >= 2);
      return tokens.some((t) => name.includes(t));
    });

    const incoming = fresh.filter((r) => r.dir === "in").map((r) => {
      const child = matchChild(r.name);
      // suspect: this child already has a payment recorded for this fund
      let paySuspect = null;
      if (child) {
        const already = Number(db.payments[`${child.id}_${targetFund}`]) || 0;
        if (already > 0) {
          const fee = Number(tFund?.annualFee) || 0;
          const status = already >= fee ? "כבר שולם במלואו" : `כבר שולם ₪${Math.round(already)}`;
          paySuspect = status;
        }
      }
      return { ...r, id: uid(), childId: child?.id, childName: child?.child,
        paySuspect, exclude: !!paySuspect };
    });
    const outgoing = fresh.filter((r) => r.dir === "out").map((r) => {
      const suspect = suspectOf(r);
      return { ...r, id: uid(), suspect, exclude: !!suspect }; // auto-exclude suspects
    });

    // balance validation: take the file's balance from the LAST row that has one
    let fileBalance = null;
    if (map.balance) {
      for (let i = parsed.length - 1; i >= 0; i--) {
        if (parsed[i].fileBalance != null && !isNaN(parsed[i].fileBalance)) {
          fileBalance = parsed[i].fileBalance; break;
        }
      }
    }

    setResult({ dupes, incoming, outgoing, fileBalance });
    setStep("preview");
  };

  const toggleExclude = (list, rid) => {
    setResult((res) => ({
      ...res,
      [list]: res[list].map((r) => r.id === rid ? { ...r, exclude: !r.exclude } : r),
    }));
  };

  const doApply = () => {
    update((d) => {
      const inRows = result.incoming.filter((r) => !r.exclude);
      const outRows = result.outgoing.filter((r) => !r.exclude);
      const fund = d.funds.find((f) => f.id === targetFund);
      const fee = Number(fund.annualFee) || 0;
      // incoming payments accumulate onto each matched child; unmatched go to a bucket
      inRows.forEach((r) => {
        if (r.childId) {
          const k = `${r.childId}_${targetFund}`;
          const current = Number(d.payments[k]) || 0;
          const next = current + r.amount;
          if (fee > 0 && next > fee) {
            // don't let a child exceed the fee; overflow still counts as collected
            d.payments[k] = fee;
            fund.unassignedCollected = (Number(fund.unassignedCollected) || 0) + (next - fee);
          } else {
            d.payments[k] = next;
          }
        } else {
          fund.unassignedCollected = (Number(fund.unassignedCollected) || 0) + r.amount;
        }
      });
      outRows.forEach((r) => {
        const fp = fingerprint(r);
        d.expenses.unshift({ id: uid(), fundId: targetFund, amount: r.amount,
          desc: r.name ? `משיכה: ${r.name}` : "משיכה מפייבוקס", date: r.date, source: "paybox", fp });
      });
      [...inRows, ...outRows].forEach((r) => {
        const fp = fingerprint(r);
        if (!d.importedTxns.includes(fp)) d.importedTxns.push(fp);
      });
      d.importMap = map;
      return d;
    });
    setStep("done");
  };

  return (
    <div>
      {step === "paste" && (
        <div style={S.form}>
          <div style={S.payHint}>
            בפייבוקס: קבוצה → ייצוא / שיתוף הנתונים → העתק את הטבלה (כולל שורת הכותרות) והדבק כאן.
            האפליקציה תזהה תשלומים נכנסים ומשיכות, ותדלג על תנועות שכבר יובאו.
          </div>
          <Field label="הדבקת נתוני CSV">
            <textarea style={{ ...S.input, minHeight: 130, fontFamily: "monospace",
              fontSize: 12, direction: "ltr", textAlign: "left" }}
              placeholder={"תאריך,שם,סכום,סוג\n01/09/2026,מיכל כהן,150,תשלום\n..."}
              value={raw} onChange={(e) => setRaw(e.target.value)} />
          </Field>
          <button style={{ ...S.primaryBtn, justifyContent: "center", opacity: raw.trim() ? 1 : 0.5 }}
            disabled={!raw.trim()} onClick={doParse}>המשך למיפוי</button>
        </div>
      )}

      {step === "map" && (
        <div style={S.form}>
          <div style={S.payHint}>סמנו איזו עמודה היא מה. זכור לפעם הבאה.</div>
          {[["amount", "עמודת סכום"], ["date", "עמודת תאריך"],
            ["name", "עמודת שם המשלם"], ["dir", "עמודת סוג/כיוון (לא חובה)"],
            ["balance", "עמודת יתרה בקופה (לא חובה — לאימות)"]].map(([k, l]) => (
            <Field key={k} label={l}>
              <select style={S.input} value={map[k]}
                onChange={(e) => setMap({ ...map, [k]: e.target.value })}>
                <option value="">— בחר —</option>
                {headers.map((h, i) => <option key={i} value={h}>{h}</option>)}
              </select>
            </Field>
          ))}
          <div style={S.mapNote}>
            אם אין עמודת כיוון, סכום שלילי ייחשב כמשיכה. נמצאו {rows.length} שורות.
          </div>
          <button style={{ ...S.primaryBtn, justifyContent: "center",
            opacity: (map.amount && map.date) ? 1 : 0.5 }}
            disabled={!(map.amount && map.date)} onClick={doPreview}>תצוגה מקדימה</button>
        </div>
      )}

      {step === "preview" && result && (() => {
        const inKeep = result.incoming.filter((r) => !r.exclude);
        const outKeep = result.outgoing.filter((r) => !r.exclude);
        const sumIn = inKeep.reduce((s, r) => s + r.amount, 0);
        const sumOut = outKeep.reduce((s, r) => s + r.amount, 0);
        const applyCount = inKeep.length + outKeep.length;
        const suspects = result.outgoing.filter((r) => r.suspect).length
          + result.incoming.filter((r) => r.paySuspect).length;
        // balance validation (only if the file provided a balance column)
        const tFund = db.funds.find((f) => f.id === targetFund);
        const currentBal = tFund ? fundBalance(tFund, db.children, db.payments, db.expenses) : 0;
        const projectedBal = currentBal + sumIn - sumOut;
        const hasFileBal = result.fileBalance != null;
        const balMatch = hasFileBal && Math.abs(projectedBal - result.fileBalance) < 0.5;
        const balGap = hasFileBal ? (result.fileBalance - projectedBal) : 0;
        return (
        <div style={S.form}>
          {!fixedFundId && (
            <Field label="לאיזו קופה לשייך">
              <select style={S.input} value={targetFund}
                onChange={(e) => { setTargetFund(e.target.value); }}>
                {db.funds.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </Field>
          )}
          {suspects > 0 && (
            <div style={S.suspectBanner}>
              ⚠️ {suspects} תנועות נראות ככפילות (משיכה של הוצאה קיימת, או תשלום לילד ששילם כבר) —
              סימנתי אותן לדילוג. בדוק למטה והחזר לסימון אם הן באמת חדשות.
            </div>
          )}

          <div style={S.importSummary}>
            <div style={S.impStat}><span>ייכנסו</span><b>{applyCount}</b></div>
            <div style={S.impStat}><span>דילוג (כבר יובאו)</span><b>{result.dupes}</b></div>
            <div style={S.impStat}><span>נכנס (גבייה)</span>
              <b style={{ color: "#4CA96B" }}>{ILS(sumIn)}</b></div>
            <div style={S.impStat}><span>יצא (משיכות)</span>
              <b style={{ color: "#c07a5a" }}>−{ILS(sumOut)}</b></div>
          </div>

          {hasFileBal && (
            <div style={balMatch ? S.balOk : S.balWarn}>
              {balMatch ? (
                <span>✓ היתרה תואמת לקובץ: {ILS(result.fileBalance)}</span>
              ) : (
                <>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>
                    ⚠️ פער בין החישוב לקובץ
                  </div>
                  <div style={S.balGrid}>
                    <span>יתרה מחושבת אחרי הייבוא</span><b>{ILS(projectedBal)}</b>
                    <span>יתרה בקובץ (שורה אחרונה)</span><b>{ILS(result.fileBalance)}</b>
                    <span>פער</span>
                    <b style={{ color: "#c0392b" }}>{balGap > 0 ? "+" : ""}{ILS(balGap)}</b>
                  </div>
                  <div style={S.balHint}>
                    פער יכול לנבוע מתנועות שדילגת עליהן, מתנועות ישנות שלא באפליקציה,
                    או מסיווג שגוי. בדוק אם הוא מכוון — אפשר לייבא בכל זאת.
                  </div>
                </>
              )}
            </div>
          )}

          {result.outgoing.length > 0 && (
            <div>
              <div style={S.mapNote}>משיכות (הוצאות) — בטל סימון כדי לא לייבא:</div>
              <div style={{ maxHeight: 220, overflow: "auto" }}>
                {result.outgoing.map((r) => (
                  <div key={r.id} style={{ ...S.outRow, opacity: r.exclude ? 0.55 : 1 }}>
                    <div style={S.outRowMain}>
                      <button style={S.payToggle} onClick={() => toggleExclude("outgoing", r.id)}>
                        {r.exclude ? <Circle size={18} style={{ color: "#cbb" }} />
                                   : <CheckCircle2 size={18} style={{ color: "#4CA96B" }} />}
                      </button>
                      <span style={{ flex: 1 }}>
                        {r.date} · {r.name || "משיכה"} · <b>{ILS(r.amount)}</b>
                      </span>
                    </div>
                    {r.suspect && (
                      <div style={S.crossRef}>
                        <div style={S.crossRefTitle}>⚠️ חשד לכפילות — הצלב מול הוצאה קיימת:</div>
                        <div style={S.crossRefGrid}>
                          <span style={S.crossRefLabel}>הוצאה קיימת</span>
                          <span style={S.crossRefVal}>{r.suspect.desc}</span>
                          <span style={S.crossRefLabel}>סכום</span>
                          <span style={S.crossRefVal}>{ILS(r.suspect.amount)}</span>
                          <span style={S.crossRefLabel}>תאריך</span>
                          <span style={S.crossRefVal}>{r.suspect.date}</span>
                          <span style={S.crossRefLabel}>קופה</span>
                          <span style={S.crossRefVal}>{r.suspect.fundName}</span>
                          <span style={S.crossRefLabel}>מקור</span>
                          <span style={S.crossRefVal}>{SRC_LABEL[r.suspect.source] || r.suspect.source}</span>
                        </div>
                        <div style={S.crossRefHint}>
                          אם זו באמת אותה תנועה — השאר מדולג. אם היא חדשה — סמן אותה למעלה כדי לייבא.
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.incoming.length > 0 && (
            <div>
              <div style={S.mapNote}>תשלומים נכנסים ושיוך לילדים:</div>
              <div style={{ maxHeight: 200, overflow: "auto" }}>
                {result.incoming.map((r) => (
                  <div key={r.id} style={{ ...S.outRow, opacity: r.exclude ? 0.55 : 1 }}>
                    <div style={S.outRowMain}>
                      <button style={S.payToggle} onClick={() => toggleExclude("incoming", r.id)}>
                        {r.exclude ? <Circle size={18} style={{ color: "#cbb" }} />
                                   : <CheckCircle2 size={18} style={{ color: "#4CA96B" }} />}
                      </button>
                      <span style={{ flex: 1 }}>{r.name || "—"} · <b>{ILS(r.amount)}</b></span>
                      <span style={{ color: r.childId ? "#4CA96B" : "#c98", fontWeight: 600 }}>
                        {r.childName || "לא זוהה"}
                      </span>
                    </div>
                    {r.paySuspect && (
                      <div style={S.crossRef}>
                        <div style={S.crossRefTitle}>⚠️ חשד לתשלום כפול</div>
                        <div style={S.crossRefHint}>
                          {r.childName} {r.paySuspect} בקופה זו. סימנתי לדילוג כדי לא לספור פעמיים —
                          אם זהו תשלום נוסף אמיתי (למשל תשלום שני בפריסה), סמן אותו למעלה כדי להוסיף.
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <button style={{ ...S.primaryBtn, justifyContent: "center",
            opacity: applyCount ? 1 : 0.5 }}
            disabled={!applyCount} onClick={doApply}>
            החל ייבוא ({applyCount} תנועות)
          </button>
        </div>
        );
      })()}

      {step === "done" && (
        <div style={{ textAlign: "center", padding: "20px 0" }}>
          <CheckCircle2 size={44} style={{ color: "#4CA96B" }} />
          <div style={{ fontWeight: 700, fontSize: 17, margin: "10px 0 4px" }}>הייבוא הושלם</div>
          <div style={{ color: "#a2917d", fontSize: 13.5, marginBottom: 16 }}>
            הנתונים עודכנו בקופה. תנועות שכבר היו לא נספרו שוב.
          </div>
          <button style={{ ...S.primaryBtn, justifyContent: "center", margin: "0 auto" }}
            onClick={onDone}>סגור</button>
        </div>
      )}
    </div>
  );
}

/* ============================================================================
   REIMBURSEMENT REQUESTS
   ========================================================================== */
function RequestsView({ db, update, isAdmin }) {
  const [show, setShow] = useState(false);
  const pending = db.requests.filter((r) => r.status === "pending");
  const done = db.requests.filter((r) => r.status === "done");
  const fundName = (id) => db.funds.find((f) => f.id === id)?.name || "—";

  const markDone = (id) => update((d) => {
    const r = d.requests.find((x) => x.id === id);
    r.status = "done";
    // approving a reimbursement removes money from the fund
    const dt = new Date().toISOString().slice(0, 10);
    const fp = fingerprint({ date: dt, amount: Number(r.amount), name: r.requester, dir: "out" });
    d.expenses.unshift({ id: uid(), fundId: r.fundId, amount: Number(r.amount),
      desc: `החזר: ${r.event} (${r.requester})`, date: dt, source: "reimbursement", fp });
    if (!d.importedTxns.includes(fp)) d.importedTxns.push(fp);
    return d;
  });
  const del = (id) => update((d) => {
    d.requests = d.requests.filter((r) => r.id !== id); return d;
  });

  return (
    <div>
      <SectionHead title="בקשות להחזר" sub="חברת ועד מבקשת · האדמין מבצע את ההחזר ומסמן"
        action={<button style={S.primaryBtn} onClick={() => setShow(true)}>
          <Plus size={16} /> בקשה חדשה</button>} />

      {pending.length > 0 && <div style={S.reqGroupLabel}><Clock size={15} /> ממתינות לטיפול</div>}
      {pending.map((r) => (
        <div key={r.id} style={S.reqCard}>
          <div style={S.reqHead}>
            <div>
              <div style={S.reqAmount}>{ILS(r.amount)}</div>
              <div style={S.reqMeta}>{r.requester} · {fundName(r.fundId)} · {r.event}</div>
            </div>
            <span style={S.reqPending}>ממתין</span>
          </div>
          {r.note && <div style={S.reqNote}>{r.note}</div>}
          <div style={S.reqActions}>
            {isAdmin ? (
              <>
                <button style={S.approveBtn} onClick={() => markDone(r.id)}>
                  <Check size={15} /> בוצע ההחזר
                </button>
                <button style={S.ghostDel} onClick={() => del(r.id)}>
                  <Trash2 size={14} />
                </button>
              </>
            ) : <span style={S.waitingNote}>הבקשה נשלחה לאדמין</span>}
          </div>
        </div>
      ))}

      {done.length > 0 && <div style={{ ...S.reqGroupLabel, marginTop: 22 }}>
        <CheckCircle2 size={15} /> טופלו</div>}
      {done.map((r) => (
        <div key={r.id} style={{ ...S.reqCard, opacity: 0.72 }}>
          <div style={S.reqHead}>
            <div>
              <div style={{ ...S.reqAmount, fontSize: 18 }}>{ILS(r.amount)}</div>
              <div style={S.reqMeta}>{r.requester} · {fundName(r.fundId)} · {r.event}</div>
            </div>
            <span style={S.reqDone}><Check size={13} /> בוצע</span>
          </div>
        </div>
      ))}

      {db.requests.length === 0 && <Empty text="אין בקשות החזר עדיין" />}

      {show && (
        <Modal onClose={() => setShow(false)} title="בקשת החזר חדשה">
          <RequestForm db={db} update={update} onDone={() => setShow(false)} />
        </Modal>
      )}
    </div>
  );
}

function RequestForm({ db, update, onDone }) {
  const [f, setF] = useState({
    requester: "", fundId: db.funds[0].id, event: "", amount: "", note: "",
  });
  const valid = f.requester && f.amount && f.event;
  const submit = () => {
    update((d) => {
      d.requests.unshift({
        id: uid(), requester: f.requester, fundId: f.fundId, event: f.event,
        amount: Number(f.amount), note: f.note, status: "pending",
        date: new Date().toISOString().slice(0, 10),
      });
      return d;
    });
    onDone();
  };
  return (
    <div style={S.form}>
      <Field label="שם המבקשת">
        <input style={S.input} value={f.requester}
          onChange={(e) => setF({ ...f, requester: e.target.value })} />
      </Field>
      <Field label="מאיזו קופה">
        <select style={S.input} value={f.fundId}
          onChange={(e) => setF({ ...f, fundId: e.target.value })}>
          {db.funds.map((fd) => <option key={fd.id} value={fd.id}>{fd.name}</option>)}
        </select>
      </Field>
      <Field label="עבור איזה אירוע / מטרה">
        <input style={S.input} value={f.event} placeholder="למשל: מתנת חג לצוות"
          onChange={(e) => setF({ ...f, event: e.target.value })} />
      </Field>
      <Field label="סכום ההוצאה (₪)">
        <input type="number" style={S.input} value={f.amount}
          onChange={(e) => setF({ ...f, amount: e.target.value })} />
      </Field>
      <Field label="פירוט (לא חובה)">
        <textarea style={{ ...S.input, minHeight: 60, resize: "vertical" }} value={f.note}
          onChange={(e) => setF({ ...f, note: e.target.value })} />
      </Field>
      <button style={{ ...S.primaryBtn, width: "100%", justifyContent: "center",
        opacity: valid ? 1 : 0.5 }} disabled={!valid} onClick={submit}>
        שליחת הבקשה לאדמין
      </button>
    </div>
  );
}

/* ============================================================================
   TASKS — shared to-do list for the committee
   ========================================================================== */
function TasksView({ db, update }) {
  const [title, setTitle] = useState("");

  const addTask = () => {
    const t = title.trim();
    if (!t) return;
    update((d) => { d.tasks.unshift({ id: uid(), title: t, done: false }); return d; });
    setTitle("");
  };
  const toggle = (id) => update((d) => {
    const t = d.tasks.find((x) => x.id === id); if (t) t.done = !t.done; return d;
  });
  const remove = (id) => update((d) => {
    d.tasks = d.tasks.filter((x) => x.id !== id); return d;
  });

  const open = db.tasks.filter((t) => !t.done);
  const done = db.tasks.filter((t) => t.done);

  return (
    <div>
      <SectionHead title="משימות הועד" sub="רשימת מטלות משותפת — כל חברת ועד יכולה לנהל" />

      <div style={S.taskAdder}>
        <input style={{ ...S.input, flex: 1 }} placeholder="משימה חדשה…" value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addTask()} />
        <button style={{ ...S.primaryBtn, padding: "10px 16px" }} onClick={addTask}>
          <Plus size={16} /> הוסף
        </button>
      </div>

      {open.map((t) => (
        <div key={t.id} style={S.taskRow}>
          <button style={S.payToggle} onClick={() => toggle(t.id)}>
            <Circle size={20} style={{ color: "#cbbfae" }} />
          </button>
          <span style={{ flex: 1, fontWeight: 500 }}>{t.title}</span>
          <button style={S.iconDel} onClick={() => remove(t.id)}><Trash2 size={14} /></button>
        </div>
      ))}

      {done.length > 0 && <div style={S.taskDoneLabel}>הושלמו ({done.length})</div>}
      {done.map((t) => (
        <div key={t.id} style={{ ...S.taskRow, opacity: 0.6 }}>
          <button style={S.payToggle} onClick={() => toggle(t.id)}>
            <CheckCircle2 size={20} style={{ color: "#4CA96B" }} />
          </button>
          <span style={{ flex: 1, textDecoration: "line-through", color: "#a2917d" }}>{t.title}</span>
          <button style={S.iconDel} onClick={() => remove(t.id)}><Trash2 size={14} /></button>
        </div>
      ))}

      {db.tasks.length === 0 && <Empty text="אין משימות — הוסיפו את הראשונה" />}
    </div>
  );
}

/* ============================================================================
   EXPENSE PLANNER
   ========================================================================== */
function PlannerView({ db }) {
  const [lines, setLines] = useState([]);
  const [draft, setDraft] = useState({
    fundId: db.funds[0].id, event: "", qty: "1", amount: "", calEventId: "",
  });

  const upcomingCalEvents = useMemo(() =>
    [...db.events].sort((a, b) => a.date.localeCompare(b.date)), [db.events]);

  const addLine = () => {
    if (!draft.amount || !draft.event) return;
    const qty = Math.max(1, Number(draft.qty) || 1);
    const calEvent = db.events.find((e) => e.id === draft.calEventId);
    setLines([...lines, {
      id: uid(), fundId: draft.fundId, event: draft.event,
      unit: Number(draft.amount), qty,
      total: Number(draft.amount) * qty,
      calEventTitle: calEvent ? calEvent.title : null,
      calEventDate: calEvent ? calEvent.date : null,
    }]);
    setDraft({ ...draft, event: "", amount: "", qty: "1", calEventId: "" });
  };
  const removeLine = (id) => setLines(lines.filter((l) => l.id !== id));

  const byFund = useMemo(() => {
    const m = {};
    lines.forEach((l) => { m[l.fundId] = (m[l.fundId] || 0) + l.total; });
    return m;
  }, [lines]);
  const fundName = (id) => db.funds.find((f) => f.id === id)?.name || "—";
  const grandTotal = lines.reduce((s, l) => s + l.total, 0);

  const exportPdf = () => {
    const rows = lines.map((l) =>
      `<tr><td>${fundName(l.fundId)}</td><td>${l.event}</td>
       <td>${l.calEventTitle ? l.calEventTitle + " (" + new Date(l.calEventDate).toLocaleDateString("he-IL", { day: "numeric", month: "numeric" }) + ")" : "—"}</td>
       <td>${ILS(l.unit)}${l.qty > 1 ? " × " + l.qty : ""}</td>
       <td style="font-weight:600">${ILS(l.total)}</td></tr>`).join("");
    const balRows = db.funds.map((f) => {
      const bal = fundBalance(f, db.children, db.payments, db.expenses); const plan = byFund[f.id] || 0; const after = bal - plan;
      return `<tr><td>${f.name}</td><td>${ILS(bal)}</td><td>${ILS(plan)}</td>
        <td style="font-weight:700;color:${after < 0 ? "#c0392b" : "#2b7a4b"}">${ILS(after)}</td></tr>`;
    }).join("");
    const html = `<!doctype html><html dir="rtl" lang="he"><head><meta charset="utf-8">
      <title>תכנון הוצאות — הר גלידה</title>
      <style>
        body{font-family:'Heebo',Arial,sans-serif;padding:40px;color:#2b2320}
        h1{font-size:24px;margin:0 0 4px} .sub{color:#8a7c6d;margin-bottom:24px}
        table{width:100%;border-collapse:collapse;margin:12px 0 28px}
        th,td{text-align:right;padding:9px 12px;border-bottom:1px solid #eadfce;font-size:14px}
        th{background:#faf4ea;color:#8a6d4a;font-weight:600}
        h2{font-size:16px;margin:20px 0 6px;color:#8a6d4a}
        .grand{font-size:20px;font-weight:800;margin-top:8px}
        .foot{margin-top:36px;color:#a99;font-size:12px}
      </style></head><body>
      <h1>🍦 תכנון הוצאות — הר גלידה</h1>
      <div class="sub">הופק בתאריך ${new Date().toLocaleDateString("he-IL")}</div>
      <h2>פירוט ההוצאות המתוכננות</h2>
      <table><tr><th>קופה</th><th>אירוע / מטרה</th><th>אירוע ביומן</th><th>עלות</th><th>סה״כ</th></tr>${rows}</table>
      <div class="grand">סה״כ מתוכנן: ${ILS(grandTotal)}</div>
      <h2>יתרות צפויות אחרי ההוצאות</h2>
      <table><tr><th>קופה</th><th>יתרה נוכחית</th><th>מתוכנן</th><th>יתרה אחרי</th></tr>${balRows}</table>
      <div class="foot">מסמך תכנון — הר גלידה · ועד הגן</div>
      <script>window.onload = function(){ setTimeout(function(){ window.print(); }, 300); };<\/script>
      </body></html>`;

    let opened = null;
    try { opened = window.open("", "_blank"); } catch (e) { opened = null; }
    if (opened && opened.document) {
      opened.document.write(html);
      opened.document.close();
    } else {
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `תכנון-הר-גלידה-${new Date().toISOString().slice(0, 10)}.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    }
  };

  return (
    <div>
      <SectionHead title="תכנון הוצאות"
        sub="הוסיפו הוצאות מתוכננות וקבלו תמונת יתרות עתידית" />

      <div style={S.plannerForm}>
        <div style={S.plannerGrid}>
          <Field label="קופה">
            <select style={S.input} value={draft.fundId}
              onChange={(e) => setDraft({ ...draft, fundId: e.target.value })}>
              {db.funds.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </Field>
          <Field label="אירוע / מטרה">
            <input style={S.input} value={draft.event} placeholder="מתנה לצוות חג שבועות"
              onChange={(e) => setDraft({ ...draft, event: e.target.value })} />
          </Field>
          <Field label="סכום (₪)">
            <input type="number" style={S.input} value={draft.amount}
              onChange={(e) => setDraft({ ...draft, amount: e.target.value })} />
          </Field>
        </div>
        <Field label="כמות (להכפלה)">
          <div style={S.qtyRow}>
            <input type="number" min="1" style={{ ...S.input, flex: 1 }} value={draft.qty}
              onChange={(e) => setDraft({ ...draft, qty: e.target.value })} />
            <button type="button" style={S.qtyQuick}
              onClick={() => setDraft({ ...draft, qty: String(db.children.length) })}>
              × מספר הילדים ({db.children.length})
            </button>
          </div>
        </Field>
        {db.events.length > 0 && (
          <Field label="קישור לאירוע מהיומן (לא חובה)">
            <select style={S.input} value={draft.calEventId}
              onChange={(e) => {
                const ev = db.events.find((x) => x.id === e.target.value);
                setDraft({ ...draft, calEventId: e.target.value,
                  // prefill purpose text from the event name if empty
                  event: draft.event || (ev ? ev.title : "") });
              }}>
              <option value="">— ללא —</option>
              {upcomingCalEvents.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.title} ({new Date(ev.date).toLocaleDateString("he-IL",
                    { day: "numeric", month: "numeric" })})
                </option>
              ))}
            </select>
          </Field>
        )}
        <button style={{ ...S.primaryBtn, justifyContent: "center" }} onClick={addLine}>
          <Plus size={16} /> הוסף לתכנון
        </button>
      </div>

      {lines.length > 0 && (
        <div style={S.planResult}>
          {lines.map((l) => (
            <div key={l.id} style={S.planLine}>
              <div>
                <div style={{ fontWeight: 600 }}>{l.event}</div>
                <div style={S.planLineSub}>
                  {fundName(l.fundId)} · {ILS(l.unit)}{l.qty > 1 ? ` × ${l.qty}` : ""}
                </div>
                {l.calEventTitle && (
                  <div style={S.planEventTag}>
                    <CalendarDays size={11} /> {l.calEventTitle} ·{" "}
                    {new Date(l.calEventDate).toLocaleDateString("he-IL", { day: "numeric", month: "long" })}
                  </div>
                )}
              </div>
              <div style={S.planLineRight}>
                <span style={{ fontWeight: 700 }}>{ILS(l.total)}</span>
                <button style={S.iconDel} onClick={() => removeLine(l.id)}>
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}

          <div style={S.planTotal}>
            <span>סה״כ מתוכנן</span><span>{ILS(grandTotal)}</span>
          </div>

          <div style={S.forecastBox}>
            <div style={S.forecastTitle}>יתרות צפויות אחרי ההוצאות</div>
            {db.funds.map((f) => {
              const bal = fundBalance(f, db.children, db.payments, db.expenses); const plan = byFund[f.id] || 0; const after = bal - plan;
              if (plan === 0) return null;
              return (
                <div key={f.id} style={S.forecastRow}>
                  <span>{f.name}</span>
                  <span style={S.forecastNums}>
                    {ILS(bal)} − {ILS(plan)} =
                    <b style={{ color: after < 0 ? "#c0392b" : "#2b7a4b", marginRight: 6 }}>
                      {ILS(after)}
                    </b>
                  </span>
                </div>
              );
            })}
          </div>

          <button style={S.pdfBtn} onClick={exportPdf}>
            <Download size={16} /> הפק מסמך תכנון (PDF/הדפסה)
          </button>
        </div>
      )}

      {lines.length === 0 && <Empty text="הוסיפו הוצאה כדי להתחיל בתכנון" />}
    </div>
  );
}

/* ============================================================================
   CALENDAR
   ========================================================================== */
function CalendarView({ db, update, isAdmin }) {
  const [cursor, setCursor] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
  const [show, setShow] = useState(false);

  const monthName = new Date(cursor.y, cursor.m).toLocaleDateString("he-IL", { month: "long", year: "numeric" });
  const first = new Date(cursor.y, cursor.m, 1).getDay();
  const days = new Date(cursor.y, cursor.m + 1, 0).getDate();
  const cells = [...Array(first).fill(null), ...Array(days).keys()].map((d) => d === null ? null : d + 1);

  const eventsOn = (day) => {
    const ds = `${cursor.y}-${String(cursor.m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return db.events.filter((e) => e.date === ds);
  };
  const shift = (n) => setCursor((c) => {
    let m = c.m + n, y = c.y;
    if (m < 0) { m = 11; y--; } if (m > 11) { m = 0; y++; }
    return { y, m };
  });
  const upcoming = [...db.events].filter((e) => e.date >= new Date().toISOString().slice(0, 10))
    .sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5);
  const delEvent = (id) => update((d) => { d.events = d.events.filter((e) => e.id !== id); return d; });

  return (
    <div>
      <SectionHead title="לוח אירועים" sub="ימי הולדת, חגים, מסיבות וכל מה שקורה בגן"
        action={<button style={S.primaryBtn} onClick={() => setShow(true)}>
          <Plus size={16} /> אירוע</button>} />

      <div style={S.calHead}>
        <button style={S.calNav} onClick={() => shift(-1)}><ChevronRight size={18} /></button>
        <div style={S.calMonth}>{monthName}</div>
        <button style={S.calNav} onClick={() => shift(1)}><ChevronLeft size={18} /></button>
      </div>

      <div style={S.calGrid}>
        {["א", "ב", "ג", "ד", "ה", "ו", "ש"].map((d) => (
          <div key={d} style={S.calDow}>{d}</div>
        ))}
        {cells.map((day, i) => (
          <div key={i} style={{ ...S.calCell, ...(day ? {} : S.calEmpty) }}>
            {day && <>
              <span style={S.calNum}>{day}</span>
              {eventsOn(day).map((e) => {
                const t = EVENT_TYPES[e.type] || EVENT_TYPES.other;
                return <div key={e.id} style={{ ...S.calEvent, background: t.color }} title={e.title}>
                  {e.title}
                </div>;
              })}
            </>}
          </div>
        ))}
      </div>

      <div style={S.upcomingWrap}>
        <div style={S.upcomingTitle}>אירועים קרובים</div>
        {upcoming.length === 0 && <Empty text="אין אירועים קרובים" />}
        {upcoming.map((e) => {
          const t = EVENT_TYPES[e.type] || EVENT_TYPES.other;
          return (
            <div key={e.id} style={S.upRow}>
              <div style={{ ...S.upIcon, background: t.color + "22", color: t.color }}>
                <t.Icon size={16} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>{e.title}</div>
                <div style={S.upDate}>{new Date(e.date).toLocaleDateString("he-IL",
                  { weekday: "long", day: "numeric", month: "long" })}</div>
                {e.note && <div style={S.upNote}>📌 {e.note}</div>}
              </div>
              <span style={{ ...S.upTag, color: t.color }}>{t.label}</span>
              {<button style={S.iconDel} onClick={() => delEvent(e.id)}>
                <Trash2 size={14} /></button>}
            </div>
          );
        })}
      </div>

      {show && (
        <Modal onClose={() => setShow(false)} title="אירוע חדש">
          <EventForm update={update} onDone={() => setShow(false)} />
        </Modal>
      )}
    </div>
  );
}

function EventForm({ update, onDone }) {
  const [f, setF] = useState({ title: "", date: "", type: "birthday", note: "" });
  const valid = f.title && f.date;
  const submit = () => {
    update((d) => { d.events.push({ id: uid(), ...f }); return d; });
    onDone();
  };
  return (
    <div style={S.form}>
      <Field label="שם האירוע">
        <input style={S.input} value={f.title}
          onChange={(e) => setF({ ...f, title: e.target.value })} />
      </Field>
      <Field label="תאריך">
        <input type="date" style={S.input} value={f.date}
          onChange={(e) => setF({ ...f, date: e.target.value })} />
      </Field>
      <Field label="סוג">
        <select style={S.input} value={f.type}
          onChange={(e) => setF({ ...f, type: e.target.value })}>
          {Object.entries(EVENT_TYPES).map(([k, v]) =>
            <option key={k} value={k}>{v.label}</option>)}
        </select>
      </Field>
      <Field label="הערה / תזכורת (לא חובה)">
        <input style={S.input} value={f.note} placeholder="למשל: להביא חולצה לבנה"
          onChange={(e) => setF({ ...f, note: e.target.value })} />
      </Field>
      <button style={{ ...S.primaryBtn, width: "100%", justifyContent: "center",
        opacity: valid ? 1 : 0.5 }} disabled={!valid} onClick={submit}>
        הוספת האירוע
      </button>
    </div>
  );
}

/* ============================================================================
   ROSTER
   ========================================================================== */
function RosterView({ db, update, isAdmin }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all"); // all | paid | unpaid (across all funds)
  const [show, setShow] = useState(false);

  const isFull = (cid, f) => {
    const fee = Number(f.annualFee) || 0;
    return fee > 0 && childPaid(db.payments, cid, f.id) >= fee;
  };
  const paidAllFunds = (cid) => db.funds.every((f) => isFull(cid, f));
  const paidSomeFunds = (cid) => db.funds.filter((f) => isFull(cid, f)).length;

  const list = db.children.filter((c) => {
    const match = (c.child + c.parents).includes(q);
    if (!match) return false;
    if (filter === "paid") return paidAllFunds(c.id);
    if (filter === "unpaid") return !paidAllFunds(c.id);
    return true;
  });
  const del = (id) => update((d) => {
    d.children = d.children.filter((c) => c.id !== id); return d;
  });

  return (
    <div>
      <SectionHead title="ילדי הגן" sub="הרשימה שאליה מחוברת הגבייה"
        action={isAdmin && <button style={S.primaryBtn} onClick={() => setShow(true)}>
          <Plus size={16} /> ילד/ה</button>} />

      <div style={S.searchWrap}>
        <Search size={16} style={{ color: "#b3a595" }} />
        <input style={S.searchInput} placeholder="חיפוש לפי שם ילד או הורה" value={q}
          onChange={(e) => setQ(e.target.value)} />
      </div>
      <div style={S.filterRow}>
        {[["all", "הכל"], ["paid", "שילמו הכל"], ["unpaid", "חסר תשלום"]].map(([k, l]) => (
          <button key={k} style={{ ...S.filterChip, ...(filter === k ? S.filterOn : {}) }}
            onClick={() => setFilter(k)}>{l}</button>
        ))}
      </div>

      <div style={S.rosterHint}>
        <span>שם</span><span>קופות ששולמו</span>
      </div>
      {list.map((c) => {
        const paid = paidSomeFunds(c.id);
        return (
          <div key={c.id} style={S.rosterRow}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600 }}>{c.child}</div>
              <div style={S.paySub}>{c.parents}</div>
            </div>
            <div style={S.miniDots}>
              {db.funds.map((f) => {
                const fee = Number(f.annualFee) || 0;
                const p = childPaid(db.payments, c.id, f.id);
                const st = childStatus(p, fee);
                const bg = st === "full" ? f.color
                  : st === "partial" ? f.color + "66" : "#e7ddd0";
                return <span key={f.id} title={`${f.name}: ${st === "full" ? "שולם" : st === "partial" ? "חלקי" : "לא שולם"}`}
                  style={{ ...S.dot, background: bg }} />;
              })}
              <span style={S.paidFrac}>{paid}/{db.funds.length}</span>
            </div>
            {isAdmin && <button style={S.iconDel} onClick={() => del(c.id)}>
              <Trash2 size={14} /></button>}
          </div>
        );
      })}
      {list.length === 0 && <Empty text="לא נמצאו תוצאות" />}

      {show && (
        <Modal onClose={() => setShow(false)} title="הוספת ילד/ה">
          <ChildForm update={update} onDone={() => setShow(false)} />
        </Modal>
      )}
    </div>
  );
}

function ChildForm({ update, onDone }) {
  const [f, setF] = useState({ child: "", parents: "" });
  const valid = f.child && f.parents;
  const submit = () => {
    update((d) => { d.children.push({ id: uid(), ...f }); return d; });
    onDone();
  };
  return (
    <div style={S.form}>
      <Field label="שם הילד/ה">
        <input style={S.input} value={f.child}
          onChange={(e) => setF({ ...f, child: e.target.value })} />
      </Field>
      <Field label="שם ההורים">
        <input style={S.input} value={f.parents}
          onChange={(e) => setF({ ...f, parents: e.target.value })} />
      </Field>
      <button style={{ ...S.primaryBtn, width: "100%", justifyContent: "center",
        opacity: valid ? 1 : 0.5 }} disabled={!valid} onClick={submit}>
        הוספה
      </button>
    </div>
  );
}

/* ============================================================================
   Shared UI bits
   ========================================================================== */
function SectionHead({ title, sub, action }) {
  return (
    <div style={S.sectionHead}>
      <div>
        <h2 style={S.sectionTitle}>{title}</h2>
        {sub && <div style={S.sectionSub}>{sub}</div>}
      </div>
      {action}
    </div>
  );
}
function Stat({ label, value, accent }) {
  return (
    <div style={S.statBox}>
      <div style={S.statLabel}>{label}</div>
      <div style={{ ...S.statVal, color: accent || "#2b2320" }}>{value}</div>
    </div>
  );
}
function Field({ label, children }) {
  return <label style={S.field}><span style={S.fieldLabel}>{label}</span>{children}</label>;
}
function Empty({ text }) {
  return <div style={S.empty}>{text}</div>;
}
function Modal({ title, children, onClose }) {
  useEffect(() => {
    const h = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.modal} onClick={(e) => e.stopPropagation()}>
        <div style={S.modalHead}>
          <h3 style={S.modalTitle}>{title}</h3>
          <button style={S.closeBtn} onClick={onClose}><X size={18} /></button>
        </div>
        <div style={S.modalBody}>{children}</div>
      </div>
    </div>
  );
}

/* ============================================================================
   Styles
   ========================================================================== */
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;600;700;800&display=swap');
  * { box-sizing: border-box; }
  body { margin: 0; }
  input, select, textarea, button { font-family: inherit; }
  input:focus, select:focus, textarea:focus { outline: 2px solid #E8833A55; }
  ::-webkit-scrollbar { width: 8px; }
  ::-webkit-scrollbar-thumb { background: #ddd0bf; border-radius: 4px; }
`;

const S = {
  app: { fontFamily: "'Heebo', sans-serif", background: "#FBF7F0", minHeight: "100vh",
    color: "#2b2320", maxWidth: 760, margin: "0 auto", paddingBottom: 40 },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "18px 20px", background: "#fff", borderBottom: "1px solid #f0e6d6",
    position: "sticky", top: 0, zIndex: 10 },
  brand: { display: "flex", alignItems: "center", gap: 11 },
  logo: { fontSize: 30, lineHeight: 1 },
  brandName: { fontWeight: 800, fontSize: 20, letterSpacing: "-0.02em" },
  brandSub: { fontSize: 12, color: "#a2917d", marginTop: 1 },
  headerRight: { display: "flex", alignItems: "center", gap: 10 },
  totalPill: { textAlign: "left", display: "flex", flexDirection: "column" },
  totalLabel: { fontSize: 10.5, color: "#a2917d" },
  totalVal: { fontWeight: 800, fontSize: 17, color: "#E8833A" },
  roleBtn: { border: "1px solid #e6dccb", background: "#fff", color: "#8a7c6d",
    padding: "7px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600 },
  logoutBtn: { border: "1px solid #e6dccb", background: "#fff", color: "#8a7c6d",
    width: 34, height: 34, borderRadius: 10, display: "grid", placeItems: "center", cursor: "pointer" },
  roleAdmin: { background: "#2b2320", color: "#fff", borderColor: "#2b2320" },

  tabbar: { display: "flex", gap: 2, padding: "10px 12px 0", background: "#fff",
    borderBottom: "1px solid #f0e6d6", overflowX: "auto", position: "sticky", top: 63, zIndex: 9 },
  tab: { display: "flex", alignItems: "center", gap: 6, padding: "10px 14px",
    border: "none", background: "none", color: "#9a8c7d", fontWeight: 600, fontSize: 14,
    cursor: "pointer", borderBottom: "3px solid transparent", whiteSpace: "nowrap", position: "relative" },
  tabActive: { color: "#E8833A", borderBottom: "3px solid #E8833A" },
  badge: { background: "#C9508A", color: "#fff", fontSize: 11, fontWeight: 700,
    borderRadius: 10, padding: "1px 6px", minWidth: 18, textAlign: "center" },

  main: { padding: "22px 20px" },
  footer: { textAlign: "center", fontSize: 11.5, color: "#b3a595", padding: "8px 20px", lineHeight: 1.7 },

  sectionHead: { display: "flex", justifyContent: "space-between", alignItems: "flex-start",
    marginBottom: 18, gap: 12 },
  sectionTitle: { fontSize: 22, fontWeight: 800, margin: 0, letterSpacing: "-0.02em" },
  sectionSub: { fontSize: 13, color: "#a2917d", marginTop: 3 },

  fundGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
  weekPanel: { background: "#fff", border: "1px solid #f0e6d6", borderRadius: 16,
    padding: "14px 16px", marginBottom: 18 },
  weekHead: { display: "flex", alignItems: "center", gap: 7, fontWeight: 700, fontSize: 14,
    marginBottom: 10 },
  weekRow: { display: "flex", alignItems: "center", gap: 9, padding: "6px 0" },
  weekDot: { width: 9, height: 9, borderRadius: "50%", flexShrink: 0 },
  weekItem: { padding: "2px 0" },
  weekTitle: { flex: 1, fontSize: 14 },
  weekNote: { fontSize: 12.5, color: "#c2632a", background: "#fdf3ea", borderRadius: 8,
    padding: "5px 10px", margin: "4px 0 2px 18px", lineHeight: 1.5 },
  upNote: { fontSize: 12.5, color: "#c2632a", marginTop: 3 },
  weekWhen: { fontSize: 12.5, whiteSpace: "nowrap" },
  fundCard: { background: "#fff", border: "1px solid #f0e6d6", borderRadius: 18, padding: 16,
    textAlign: "right", cursor: "pointer", transition: "transform .12s, box-shadow .12s",
    display: "flex", flexDirection: "column", gap: 2 },
  fundTop: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  fundIcon: { width: 44, height: 44, borderRadius: 13, display: "grid", placeItems: "center" },
  fundGroupsTag: { fontSize: 11, color: "#a2917d", background: "#f7f0e5", padding: "3px 8px", borderRadius: 10 },
  fundName: { fontWeight: 600, fontSize: 15, color: "#7a6c5c" },
  fundBalRow: { display: "flex", alignItems: "baseline", gap: 7, margin: "2px 0 8px" },
  fundBalLabel: { fontSize: 12, color: "#a2917d", fontWeight: 600 },
  fundBal: { fontWeight: 800, fontSize: 24, letterSpacing: "-0.02em" },
  barTrack: { height: 7, background: "#f2e9db", borderRadius: 4, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 4, transition: "width .3s" },
  fundExp: { fontSize: 11.5, color: "#a2917d", marginTop: 7 },

  detailStats: { display: "flex", gap: 10, marginBottom: 18 },
  statBox: { flex: 1, background: "#faf4ea", borderRadius: 13, padding: "12px 14px" },
  statLabel: { fontSize: 12, color: "#a2917d" },
  statVal: { fontWeight: 800, fontSize: 19, marginTop: 2 },
  detailSubStat: { fontSize: 12.5, color: "#a2917d", textAlign: "center", marginBottom: 16, marginTop: 2 },
  importFundBtn: { display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
    width: "100%", padding: "11px", border: "1px solid #f0d9c4", borderRadius: 12,
    background: "#fdf3ea", color: "#c2632a", fontWeight: 700, fontSize: 13.5, cursor: "pointer",
    marginBottom: 16 },
  expRow: { display: "flex", alignItems: "center", gap: 10, padding: "10px 4px",
    borderBottom: "1px solid #f4ece0" },
  expAdder: { display: "flex", gap: 7, marginBottom: 14, alignItems: "stretch" },
  mapNote: { fontSize: 12.5, color: "#8a7c6d", margin: "2px 0 4px" },
  importSummary: { background: "#faf4ea", borderRadius: 12, padding: 14, display: "grid",
    gridTemplateColumns: "1fr 1fr", gap: 10 },
  impStat: { display: "flex", justifyContent: "space-between", fontSize: 13, alignItems: "center" },
  matchRow: { display: "flex", alignItems: "center", gap: 9, fontSize: 12.5,
    padding: "7px 0", borderBottom: "1px solid #f4ece0" },
  suspectBanner: { background: "#fdf0e6", border: "1px solid #f2cba8", borderRadius: 11,
    padding: "10px 13px", fontSize: 12.5, color: "#a35a2e", lineHeight: 1.5 },
  balOk: { background: "#e9f6ee", border: "1px solid #c5e8d2", borderRadius: 11,
    padding: "10px 13px", fontSize: 13, fontWeight: 700, color: "#2b7a4b" },
  balWarn: { background: "#fdf0e6", border: "1px solid #f2cba8", borderRadius: 11,
    padding: "12px 14px", fontSize: 13, color: "#a35a2e" },
  balGrid: { display: "grid", gridTemplateColumns: "1fr auto", gap: "4px 12px", fontSize: 13,
    margin: "4px 0" },
  balHint: { fontSize: 11.5, color: "#8a7c6d", marginTop: 8, lineHeight: 1.5 },
  suspectTag: { color: "#c0392b", fontWeight: 600, fontSize: 11.5, marginRight: 4 },
  outRow: { borderBottom: "1px solid #f4ece0", padding: "8px 0" },
  outRowMain: { display: "flex", alignItems: "center", gap: 9, fontSize: 12.5 },
  crossRef: { background: "#fdf0e6", border: "1px solid #f2cba8", borderRadius: 10,
    padding: "10px 12px", marginTop: 8, marginRight: 27 },
  crossRefTitle: { fontSize: 12, fontWeight: 700, color: "#a35a2e", marginBottom: 8 },
  crossRefGrid: { display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 12px", fontSize: 12.5 },
  crossRefLabel: { color: "#a2917d", fontWeight: 600 },
  crossRefVal: { color: "#2b2320", fontWeight: 600 },
  crossRefHint: { fontSize: 11.5, color: "#8a7c6d", marginTop: 8, lineHeight: 1.5 },
  expAdderBox: { background: "#faf4ea", borderRadius: 12, padding: 12, marginBottom: 14,
    display: "flex", flexDirection: "column", gap: 8 },

  pillTabs: { display: "flex", gap: 6, marginBottom: 16, background: "#f2e9db",
    padding: 4, borderRadius: 12 },
  pillTab: { flex: 1, padding: "9px", border: "none", background: "none", borderRadius: 9,
    fontWeight: 600, fontSize: 13.5, color: "#9a8c7d", cursor: "pointer" },
  pillTabOn: { background: "#fff", color: "#2b2320", boxShadow: "0 1px 3px rgba(0,0,0,.06)" },

  groupRow: { border: "1px solid #f0e6d6", borderRadius: 14, padding: 13, marginBottom: 10 },
  groupMain: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 10 },
  inlineInput: { border: "none", fontWeight: 700, fontSize: 15, background: "none", flex: 1, minWidth: 0 },
  groupNums: { display: "flex", gap: 8 },
  numLabel: { fontSize: 11, color: "#a2917d", display: "flex", flexDirection: "column", gap: 2 },
  numInput: { width: 74, border: "1px solid #ece2d2", borderRadius: 8, padding: "5px 7px",
    fontSize: 13, fontWeight: 600, textAlign: "center" },
  groupLinkRow: { display: "flex", alignItems: "center", gap: 7 },
  linkInput: { flex: 1, border: "1px solid #f0e6d6", borderRadius: 8, padding: "6px 9px",
    fontSize: 12.5, background: "#faf7f1", minWidth: 0 },
  openLink: { color: "#E8833A", display: "grid", placeItems: "center", padding: 4 },

  addGroupBtn: { display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
    width: "100%", padding: "11px", border: "1.5px dashed #d9c9b3", borderRadius: 12,
    background: "none", color: "#a2917d", fontWeight: 600, fontSize: 13.5, cursor: "pointer" },

  payHint: { fontSize: 12.5, color: "#8a7c6d", background: "#fdf6ec", border: "1px solid #f3e6d0",
    borderRadius: 10, padding: "9px 12px", marginBottom: 12, lineHeight: 1.5 },
  payRow: { display: "flex", alignItems: "center", gap: 12, padding: "10px 4px",
    borderBottom: "1px solid #f4ece0" },
  payToggle: { border: "none", background: "none", cursor: "pointer", padding: 0, display: "grid" },
  payStatusIcon: { display: "grid", placeItems: "center", width: 22 },
  payEditWrap: { display: "flex", alignItems: "center", gap: 5 },
  payAmountInput: { width: 62, border: "1px solid #e6dccb", borderRadius: 8, padding: "5px 7px",
    fontSize: 13, fontWeight: 600, textAlign: "center" },
  payOf: { fontSize: 12, color: "#a2917d", whiteSpace: "nowrap" },
  payQuick: { border: "1px solid #cde9d6", background: "#eaf7ef", color: "#4CA96B",
    borderRadius: 7, width: 28, height: 28, cursor: "pointer", fontWeight: 800, fontSize: 14 },
  payCheck: { border: "none", background: "none", cursor: "pointer", padding: 0,
    display: "grid", placeItems: "center", marginRight: 2 },
  feeRow: { display: "flex", justifyContent: "space-between", alignItems: "center",
    background: "#faf4ea", borderRadius: 12, padding: "12px 14px", marginBottom: 6 },
  feeLabel: { fontWeight: 700, fontSize: 14 },
  feeInputWrap: { display: "flex", alignItems: "center", gap: 4 },
  feeInput: { width: 84, border: "1px solid #e6dccb", borderRadius: 9, padding: "7px 9px",
    fontSize: 15, fontWeight: 700, textAlign: "center" },
  feeUnit: { color: "#a2917d", fontWeight: 700 },
  feeNote: { fontSize: 12, color: "#a2917d", marginBottom: 14, textAlign: "center" },
  payName: { flex: 1 },
  paySub: { fontSize: 12.5, color: "#a2917d", marginTop: 1 },
  payStatus: { fontSize: 12, fontWeight: 700, padding: "4px 11px", borderRadius: 20 },
  payTag: { display: "inline-block", fontSize: 11.5, fontWeight: 700, padding: "2px 9px",
    borderRadius: 20, marginTop: 4 },

  reqGroupLabel: { display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 700,
    color: "#8a7c6d", marginBottom: 10 },
  reqCard: { background: "#fff", border: "1px solid #f0e6d6", borderRadius: 16, padding: 15, marginBottom: 11 },
  reqHead: { display: "flex", justifyContent: "space-between", alignItems: "flex-start" },
  reqAmount: { fontWeight: 800, fontSize: 22, letterSpacing: "-0.02em" },
  reqMeta: { fontSize: 12.5, color: "#a2917d", marginTop: 2 },
  reqNote: { fontSize: 13, color: "#6d5f4f", marginTop: 9, background: "#faf4ea",
    padding: "8px 11px", borderRadius: 9 },
  reqPending: { fontSize: 12, fontWeight: 700, color: "#E8833A", background: "#fdefe0",
    padding: "4px 11px", borderRadius: 20 },
  reqDone: { fontSize: 12, fontWeight: 700, color: "#4CA96B", background: "#e9f6ee",
    padding: "4px 10px", borderRadius: 20, display: "flex", alignItems: "center", gap: 3 },
  reqActions: { display: "flex", gap: 8, marginTop: 12, alignItems: "center" },
  approveBtn: { display: "flex", alignItems: "center", gap: 5, background: "#4CA96B", color: "#fff",
    border: "none", borderRadius: 10, padding: "9px 16px", fontWeight: 700, fontSize: 13.5, cursor: "pointer" },
  waitingNote: { fontSize: 12.5, color: "#a2917d", fontStyle: "italic" },

  plannerForm: { background: "#fff", border: "1px solid #f0e6d6", borderRadius: 16,
    padding: 16, marginBottom: 18 },
  plannerGrid: { display: "grid", gridTemplateColumns: "1fr 1.4fr 0.8fr", gap: 10, marginBottom: 12 },
  taskAdder: { display: "flex", gap: 8, marginBottom: 16 },
  taskRow: { display: "flex", alignItems: "center", gap: 10, background: "#fff",
    border: "1px solid #f0e6d6", borderRadius: 12, padding: "11px 14px", marginBottom: 8 },
  taskDoneLabel: { fontSize: 12.5, fontWeight: 700, color: "#a2917d", margin: "18px 0 10px" },
  qtyRow: { display: "flex", gap: 8, alignItems: "stretch" },
  qtyQuick: { border: "1px solid #e6dccb", background: "#faf4ea", color: "#8a6d4a",
    borderRadius: 10, padding: "0 12px", fontSize: 12.5, fontWeight: 600, cursor: "pointer",
    whiteSpace: "nowrap", fontFamily: "inherit" },
  checkRow: { display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, color: "#6d5f4f",
    marginBottom: 12, cursor: "pointer" },
  planResult: { background: "#fff", border: "1px solid #f0e6d6", borderRadius: 16, padding: 16 },
  planLine: { display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "11px 0", borderBottom: "1px solid #f4ece0" },
  planLineSub: { fontSize: 12.5, color: "#a2917d", marginTop: 2 },
  planEventTag: { display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11.5,
    color: "#3D9BE9", fontWeight: 600, marginTop: 4, background: "#eaf4fc",
    padding: "2px 8px", borderRadius: 12 },
  planLineRight: { display: "flex", alignItems: "center", gap: 10 },
  planTotal: { display: "flex", justifyContent: "space-between", fontWeight: 800, fontSize: 18,
    padding: "13px 0 4px" },
  forecastBox: { background: "#faf4ea", borderRadius: 13, padding: 14, marginTop: 12 },
  forecastTitle: { fontWeight: 700, fontSize: 13.5, marginBottom: 9, color: "#8a6d4a" },
  forecastRow: { display: "flex", justifyContent: "space-between", alignItems: "center",
    fontSize: 13.5, padding: "5px 0" },
  forecastNums: { color: "#8a7c6d", fontSize: 13 },
  pdfBtn: { display: "flex", alignItems: "center", justifyContent: "center", gap: 7, width: "100%",
    background: "#2b2320", color: "#fff", border: "none", borderRadius: 12, padding: "13px",
    fontWeight: 700, fontSize: 14.5, cursor: "pointer", marginTop: 14 },

  calHead: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  calMonth: { fontWeight: 700, fontSize: 17 },
  calNav: { border: "1px solid #ece2d2", background: "#fff", borderRadius: 10, width: 36, height: 36,
    display: "grid", placeItems: "center", cursor: "pointer", color: "#8a7c6d" },
  calGrid: { display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4, marginBottom: 22 },
  calDow: { textAlign: "center", fontSize: 12, fontWeight: 700, color: "#b3a595", padding: "4px 0" },
  calCell: { minHeight: 62, background: "#fff", border: "1px solid #f2e9db", borderRadius: 9,
    padding: 4, display: "flex", flexDirection: "column", gap: 2 },
  calEmpty: { background: "transparent", border: "none" },
  calNum: { fontSize: 12, color: "#a2917d", fontWeight: 600 },
  calEvent: { fontSize: 9.5, color: "#fff", padding: "2px 4px", borderRadius: 5, fontWeight: 600,
    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.3 },
  upcomingWrap: { background: "#fff", border: "1px solid #f0e6d6", borderRadius: 16, padding: 16 },
  upcomingTitle: { fontWeight: 700, fontSize: 15, marginBottom: 12 },
  upRow: { display: "flex", alignItems: "center", gap: 12, padding: "9px 0", borderBottom: "1px solid #f4ece0" },
  upIcon: { width: 34, height: 34, borderRadius: 10, display: "grid", placeItems: "center", flexShrink: 0 },
  upDate: { fontSize: 12.5, color: "#a2917d", marginTop: 1 },
  upTag: { fontSize: 12, fontWeight: 700 },

  searchWrap: { display: "flex", alignItems: "center", gap: 8, background: "#fff",
    border: "1px solid #f0e6d6", borderRadius: 12, padding: "10px 13px", marginBottom: 10 },
  searchInput: { border: "none", flex: 1, fontSize: 14, background: "none" },
  filterRow: { display: "flex", gap: 7, marginBottom: 16 },
  filterChip: { border: "1px solid #ece2d2", background: "#fff", color: "#8a7c6d",
    padding: "7px 15px", borderRadius: 20, fontSize: 13, fontWeight: 600, cursor: "pointer" },
  filterOn: { background: "#2b2320", color: "#fff", borderColor: "#2b2320" },
  rosterHint: { display: "flex", justifyContent: "space-between", fontSize: 11.5, color: "#b3a595",
    padding: "0 4px 6px" },
  rosterRow: { display: "flex", alignItems: "center", gap: 12, background: "#fff",
    border: "1px solid #f0e6d6", borderRadius: 13, padding: "11px 14px", marginBottom: 8 },
  miniDots: { display: "flex", alignItems: "center", gap: 5 },
  dot: { width: 11, height: 11, borderRadius: "50%" },
  paidFrac: { fontSize: 12, color: "#a2917d", marginRight: 4, fontWeight: 600 },

  form: { display: "flex", flexDirection: "column", gap: 14 },
  field: { display: "flex", flexDirection: "column", gap: 5 },
  fieldLabel: { fontSize: 13, fontWeight: 600, color: "#6d5f4f" },
  input: { border: "1px solid #e6dccb", borderRadius: 10, padding: "10px 12px", fontSize: 14,
    background: "#fff", width: "100%" },

  primaryBtn: { display: "flex", alignItems: "center", gap: 6, background: "#E8833A", color: "#fff",
    border: "none", borderRadius: 11, padding: "10px 16px", fontWeight: 700, fontSize: 14,
    cursor: "pointer", flexShrink: 0 },
  secondaryBtn: { display: "flex", alignItems: "center", gap: 6, background: "#fff", color: "#8a7c6d",
    border: "1px solid #e6dccb", borderRadius: 11, padding: "10px 14px", fontWeight: 700,
    fontSize: 14, cursor: "pointer", flexShrink: 0 },
  iconPicker: { display: "flex", flexWrap: "wrap", gap: 8 },
  iconChoice: { width: 44, height: 44, borderRadius: 11, border: "1.5px solid #ece2d2",
    background: "#fff", display: "grid", placeItems: "center", cursor: "pointer" },
  colorPicker: { display: "flex", flexWrap: "wrap", gap: 10 },
  colorChoice: { width: 30, height: 30, borderRadius: "50%", border: "none", cursor: "pointer" },
  dangerZone: { marginTop: 20, paddingTop: 16, borderTop: "1px solid #f0e6d6" },
  deleteFundBtn: { display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
    width: "100%", padding: "10px", border: "1px solid #f0cdcd", borderRadius: 11,
    background: "#fdf3f3", color: "#c0392b", fontWeight: 600, fontSize: 13.5, cursor: "pointer" },
  confirmBox: { background: "#fdf3f3", border: "1px solid #f0cdcd", borderRadius: 12, padding: 14 },
  confirmText: { fontSize: 13.5, color: "#a5382e", lineHeight: 1.5, marginBottom: 12 },
  confirmActions: { display: "flex", gap: 8 },
  confirmDelBtn: { flex: 1, background: "#c0392b", color: "#fff", border: "none", borderRadius: 10,
    padding: "10px", fontWeight: 700, fontSize: 14, cursor: "pointer" },
  confirmCancelBtn: { flex: 1, background: "#fff", color: "#8a7c6d", border: "1px solid #e6dccb",
    borderRadius: 10, padding: "10px", fontWeight: 700, fontSize: 14, cursor: "pointer" },
  iconDel: { border: "none", background: "none", color: "#cdae9a", cursor: "pointer", padding: 4,
    display: "grid", placeItems: "center" },
  ghostDel: { border: "none", background: "#f7f0e5", color: "#b3958a", cursor: "pointer",
    borderRadius: 9, padding: "8px", display: "grid", placeItems: "center" },

  empty: { textAlign: "center", color: "#b3a595", fontSize: 13.5, padding: "26px 0" },

  overlay: { position: "fixed", inset: 0, background: "rgba(43,35,32,.4)", display: "grid",
    placeItems: "center", zIndex: 100, padding: 16 },
  modal: { background: "#fff", borderRadius: 20, width: "100%", maxWidth: 460, maxHeight: "88vh",
    overflow: "auto", boxShadow: "0 20px 60px rgba(0,0,0,.2)" },
  modalHead: { display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "18px 20px", borderBottom: "1px solid #f0e6d6", position: "sticky", top: 0, background: "#fff" },
  modalTitle: { fontSize: 18, fontWeight: 800, margin: 0 },
  closeBtn: { border: "none", background: "#f4ece0", borderRadius: 9, width: 32, height: 32,
    display: "grid", placeItems: "center", cursor: "pointer", color: "#8a7c6d" },
  modalBody: { padding: 20 },
};
