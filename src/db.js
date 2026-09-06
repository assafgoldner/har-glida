import { supabase } from "./supabaseClient";

/* ============================================================================
   DATA LAYER — the single seam between the UI and Supabase.
   loadAll() returns the same shape the UI already expects:
     { children, funds (with groups), payments{childId_fundId:amount},
       expenses, requests, events, importedTxns, importMap, unassignedByFund }
   Mutations write to Supabase and return the affected rows.
   ========================================================================== */

// ---- READ: load everything into the app's shape ----
export async function loadAll() {
  const [
    childrenRes, fundsRes, groupsRes, paymentsRes,
    expensesRes, reimbRes, eventsRes, txnsRes, tasksRes, mapRes,
  ] = await Promise.all([
    supabase.from("children").select("*").order("sort_order"),
    supabase.from("funds").select("*").order("sort_order"),
    supabase.from("fund_groups").select("*").order("created_at"),
    supabase.from("payments").select("*"),
    supabase.from("expenses").select("*").order("date", { ascending: false }),
    supabase.from("reimbursements").select("*").order("created_at", { ascending: false }),
    supabase.from("events").select("*").order("date"),
    supabase.from("imported_txns").select("fingerprint"),
    supabase.from("tasks").select("*").order("created_at", { ascending: false }),
    supabase.from("import_map").select("mapping").eq("id", 1).maybeSingle(),
  ]);

  const anyErr = [childrenRes, fundsRes, groupsRes, paymentsRes, expensesRes,
    reimbRes, eventsRes, txnsRes].find((r) => r.error);
  if (anyErr) throw anyErr.error;

  const groupsByFund = {};
  (groupsRes.data || []).forEach((g) => {
    (groupsByFund[g.fund_id] ||= []).push({
      id: g.id, label: g.label, link: g.link || "", spent: Number(g.spent) || 0,
    });
  });

  const funds = (fundsRes.data || []).map((f) => ({
    id: f.id, name: f.name, icon: f.icon, color: f.color,
    annualFee: Number(f.annual_fee) || 0,
    unassignedCollected: Number(f.unassigned_collected) || 0,
    groups: groupsByFund[f.id] || [],
  }));

  const payments = {};
  (paymentsRes.data || []).forEach((p) => {
    payments[`${p.child_id}_${p.fund_id}`] = Number(p.amount) || 0;
  });

  const children = (childrenRes.data || []).map((c) => ({
    id: c.id, child: c.child_name, parents: c.parents || "",
  }));

  const expenses = (expensesRes.data || []).map((e) => ({
    id: e.id, fundId: e.fund_id, amount: Number(e.amount) || 0,
    desc: e.description || "", date: e.date, source: e.source, fp: e.fingerprint || null,
  }));

  const requests = (reimbRes.data || []).map((r) => ({
    id: r.id, requester: r.requester, fundId: r.fund_id, event: r.event,
    amount: Number(r.amount) || 0, note: r.note || "", status: r.status, date: r.date,
  }));

  const events = (eventsRes.data || []).map((e) => ({
    id: e.id, title: e.title, date: e.date, type: e.type, note: e.note || "",
  }));

  const importedTxns = (txnsRes.data || []).map((t) => t.fingerprint);
  const importMap = mapRes?.data?.mapping || null;

  const tasks = (tasksRes.data || []).map((t) => ({
    id: t.id, title: t.title, done: !!t.done,
  }));

  return { children, funds, payments, expenses, requests, events, tasks, importedTxns, importMap };
}

/* ---- WRITE: payments ---- */
export async function setPayment(childId, fundId, amount) {
  const { error } = await supabase.from("payments")
    .upsert({ child_id: childId, fund_id: fundId, amount, updated_at: new Date().toISOString() });
  if (error) throw error;
}

/* ---- funds ---- */
export async function setFundFee(fundId, annualFee) {
  const { error } = await supabase.from("funds").update({ annual_fee: annualFee }).eq("id", fundId);
  if (error) throw error;
}
export async function addFund(fund) {
  const { data, error } = await supabase.from("funds").insert({
    name: fund.name, icon: fund.icon, color: fund.color, annual_fee: fund.annualFee,
  }).select().single();
  if (error) throw error;
  // first group
  await supabase.from("fund_groups").insert({
    fund_id: data.id, label: fund.groupLabel || "קבוצה ראשית", link: fund.link || "",
  });
  return data.id;
}
export async function deleteFund(fundId) {
  const { error } = await supabase.from("funds").delete().eq("id", fundId);
  if (error) throw error;
}
export async function bumpUnassigned(fundId, delta) {
  // read-modify-write; small scale so safe
  const { data } = await supabase.from("funds").select("unassigned_collected").eq("id", fundId).single();
  const next = (Number(data?.unassigned_collected) || 0) + delta;
  const { error } = await supabase.from("funds").update({ unassigned_collected: next }).eq("id", fundId);
  if (error) throw error;
}

/* ---- fund groups ---- */
export async function addGroup(fundId, label) {
  const { error } = await supabase.from("fund_groups").insert({ fund_id: fundId, label });
  if (error) throw error;
}
export async function updateGroup(groupId, patch) {
  const row = {};
  if (patch.label !== undefined) row.label = patch.label;
  if (patch.link !== undefined) row.link = patch.link;
  if (patch.spent !== undefined) row.spent = patch.spent;
  const { error } = await supabase.from("fund_groups").update(row).eq("id", groupId);
  if (error) throw error;
}
export async function deleteGroup(groupId) {
  const { error } = await supabase.from("fund_groups").delete().eq("id", groupId);
  if (error) throw error;
}

/* ---- expenses ---- */
export async function addExpense(exp) {
  const { error } = await supabase.from("expenses").insert({
    fund_id: exp.fundId, amount: exp.amount, description: exp.desc,
    date: exp.date, source: exp.source, fingerprint: exp.fp || null,
  });
  if (error) throw error;
  if (exp.fp) await addImportedTxn(exp.fp);
}
export async function deleteExpense(id, fp) {
  const { error } = await supabase.from("expenses").delete().eq("id", id);
  if (error) throw error;
  if (fp) await supabase.from("imported_txns").delete().eq("fingerprint", fp);
}

/* ---- reimbursements ---- */
export async function addRequest(req) {
  const { error } = await supabase.from("reimbursements").insert({
    requester: req.requester, fund_id: req.fundId, event: req.event,
    amount: req.amount, note: req.note, status: "pending",
  });
  if (error) throw error;
}
export async function approveRequest(id) {
  const { error } = await supabase.from("reimbursements").update({ status: "done" }).eq("id", id);
  if (error) throw error;
}
export async function deleteRequest(id) {
  const { error } = await supabase.from("reimbursements").delete().eq("id", id);
  if (error) throw error;
}

/* ---- events ---- */
export async function addEvent(ev) {
  const { error } = await supabase.from("events").insert({
    title: ev.title, date: ev.date, type: ev.type,
  });
  if (error) throw error;
}
export async function deleteEvent(id) {
  const { error } = await supabase.from("events").delete().eq("id", id);
  if (error) throw error;
}

/* ---- children ---- */
export async function addChild(child) {
  const { error } = await supabase.from("children").insert({
    child_name: child.child, parents: child.parents,
  });
  if (error) throw error;
}
export async function deleteChild(id) {
  const { error } = await supabase.from("children").delete().eq("id", id);
  if (error) throw error;
}

/* ---- import dedup + map ---- */
export async function addImportedTxn(fp) {
  await supabase.from("imported_txns").upsert({ fingerprint: fp });
}
export async function saveImportMap(mapping) {
  await supabase.from("import_map").upsert({ id: 1, mapping, updated_at: new Date().toISOString() });
}

/* ---- auth / role ---- */
export async function getRole(email) {
  if (!email) return null;
  const { data } = await supabase.from("allowed_emails").select("role").eq("email", email).maybeSingle();
  return data?.role || null; // 'admin' | 'viewer' | null (no access)
}
