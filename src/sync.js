import { supabase } from "./supabaseClient";

/* ============================================================================
   SYNC — diff the previous and next in-memory db and persist only what changed.
   This lets every existing view keep calling update((d)=>{...}) unchanged:
   App applies the mutation locally (instant UI), then calls syncToSupabase
   which figures out the minimal set of writes.
   Small data scale (one kindergarten), so full-collection diffing is fine.
   ========================================================================== */

const byId = (arr) => Object.fromEntries((arr || []).map((x) => [x.id, x]));

export async function syncToSupabase(prev, next) {
  const jobs = [];

  // ---- children ----
  diffRows(prev.children, next.children, jobs,
    (c) => supabase.from("children").insert({ id: c.id, child_name: c.child, parents: c.parents }),
    (c) => supabase.from("children").update({ child_name: c.child, parents: c.parents }).eq("id", c.id),
    (id) => supabase.from("children").delete().eq("id", id),
    (a, b) => a.child === b.child && a.parents === b.parents);

  // ---- events ----
  diffRows(prev.events, next.events, jobs,
    (e) => supabase.from("events").insert({ id: e.id, title: e.title, date: e.date, type: e.type, note: e.note || null }),
    (e) => supabase.from("events").update({ title: e.title, date: e.date, type: e.type, note: e.note || null }).eq("id", e.id),
    (id) => supabase.from("events").delete().eq("id", id),
    (a, b) => a.title === b.title && a.date === b.date && a.type === b.type && (a.note||"") === (b.note||""));

  // ---- tasks ----
  diffRows(prev.tasks, next.tasks, jobs,
    (t) => supabase.from("tasks").insert({ id: t.id, title: t.title, done: t.done }),
    (t) => supabase.from("tasks").update({ title: t.title, done: t.done }).eq("id", t.id),
    (id) => supabase.from("tasks").delete().eq("id", id),
    (a, b) => a.title === b.title && a.done === b.done);

  // ---- requests (reimbursements) ----
  diffRows(prev.requests, next.requests, jobs,
    (r) => supabase.from("reimbursements").insert({
      id: r.id, requester: r.requester, fund_id: r.fundId, event: r.event,
      amount: r.amount, note: r.note, status: r.status }),
    (r) => supabase.from("reimbursements").update({ status: r.status, note: r.note }).eq("id", r.id),
    (id) => supabase.from("reimbursements").delete().eq("id", id),
    (a, b) => a.status === b.status && a.note === b.note);

  // ---- expenses ----
  diffRows(prev.expenses, next.expenses, jobs,
    (e) => supabase.from("expenses").insert({
      id: e.id, fund_id: e.fundId, amount: e.amount, description: e.desc,
      date: e.date, source: e.source, fingerprint: e.fp || null }),
    null, // expenses aren't edited in place
    (id) => supabase.from("expenses").delete().eq("id", id),
    () => true);

  // ---- funds (name/fee/icon/color/unassigned) ----
  diffRows(prev.funds, next.funds, jobs,
    (f) => supabase.from("funds").insert({
      id: f.id, name: f.name, icon: f.icon, color: f.color,
      annual_fee: f.annualFee, unassigned_collected: f.unassignedCollected }),
    (f) => supabase.from("funds").update({
      name: f.name, icon: f.icon, color: f.color,
      annual_fee: f.annualFee, unassigned_collected: f.unassignedCollected }).eq("id", f.id),
    (id) => supabase.from("funds").delete().eq("id", id),
    (a, b) => a.name === b.name && a.annualFee === b.annualFee &&
      a.icon === b.icon && a.color === b.color &&
      a.unassignedCollected === b.unassignedCollected);

  // ---- fund groups (nested inside funds) ----
  const prevGroups = flattenGroups(prev.funds), nextGroups = flattenGroups(next.funds);
  diffRows(prevGroups, nextGroups, jobs,
    (g) => supabase.from("fund_groups").insert({
      id: g.id, fund_id: g.fundId, label: g.label, link: g.link, spent: g.spent }),
    (g) => supabase.from("fund_groups").update({
      label: g.label, link: g.link, spent: g.spent }).eq("id", g.id),
    (id) => supabase.from("fund_groups").delete().eq("id", id),
    (a, b) => a.label === b.label && a.link === b.link && a.spent === b.spent);

  // ---- payments (map childId_fundId -> amount) ----
  diffPayments(prev.payments, next.payments, jobs);

  // ---- imported txns (append-only set) ----
  const prevSet = new Set(prev.importedTxns || []);
  (next.importedTxns || []).forEach((fp) => {
    if (!prevSet.has(fp)) jobs.push(supabase.from("imported_txns").upsert({ fingerprint: fp }));
  });
  const nextSet = new Set(next.importedTxns || []);
  (prev.importedTxns || []).forEach((fp) => {
    if (!nextSet.has(fp)) jobs.push(supabase.from("imported_txns").delete().eq("fingerprint", fp));
  });

  // ---- import map ----
  if (JSON.stringify(prev.importMap) !== JSON.stringify(next.importMap)) {
    jobs.push(supabase.from("import_map").upsert({ id: 1, mapping: next.importMap }));
  }

  const results = await Promise.all(jobs.map((p) => p.then((r) => r).catch((e) => ({ error: e }))));
  const firstErr = results.find((r) => r && r.error);
  if (firstErr) throw firstErr.error;
}

function flattenGroups(funds) {
  const out = [];
  (funds || []).forEach((f) => (f.groups || []).forEach((g) =>
    out.push({ ...g, fundId: f.id })));
  return out;
}

function diffRows(prevArr, nextArr, jobs, insertFn, updateFn, deleteFn, eq) {
  const p = byId(prevArr), n = byId(nextArr);
  // inserts + updates
  for (const id in n) {
    if (!p[id]) jobs.push(insertFn(n[id]));
    else if (updateFn && !eq(p[id], n[id])) jobs.push(updateFn(n[id]));
  }
  // deletes
  for (const id in p) {
    if (!n[id]) jobs.push(deleteFn(id));
  }
}

function diffPayments(prev, next, jobs) {
  const p = prev || {}, n = next || {};
  const keys = new Set([...Object.keys(p), ...Object.keys(n)]);
  for (const k of keys) {
    if (p[k] === n[k]) continue;
    const [childId, fundId] = k.split("_");
    if (n[k] === undefined) {
      jobs.push(supabase.from("payments").delete().eq("child_id", childId).eq("fund_id", fundId));
    } else {
      jobs.push(supabase.from("payments").upsert({
        child_id: childId, fund_id: fundId, amount: n[k], updated_at: new Date().toISOString(),
      }));
    }
  }
}
