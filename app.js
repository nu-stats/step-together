const CFG = window.APP_CONFIG;
const $ = (id) => document.getElementById(id);
const fmt = (n) => Math.round(n).toLocaleString();
const localToday = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const prettyDay = (s) => new Date(s + "T12:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });

/* ---------- backends: Supabase (real) or demo (browser only) ---------- */
function supabaseBackend() {
  const sb = supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
  const fail = (r) => { if (r.error) throw new Error(r.error.message); return r.data; };
  const target = (raw) => { const s = raw.trim(); return s.includes("@") ? { email: s } : { phone: normalizePhone(s) }; };
  return {
    demo: false,
    async sendCode(raw) { fail(await sb.auth.signInWithOtp({ ...target(raw), options: { shouldCreateUser: true } })); },
    async verify(raw, token) {
      const t = target(raw);
      fail(await sb.auth.verifyOtp({ ...t, token: token.trim(), type: t.email ? "email" : "sms" }));
    },
    async signedIn() { return !!(await sb.auth.getSession()).data.session; },
    async signOut() { await sb.auth.signOut(); },
    async mine() {
      const rows = fail(await sb.from("steps").select("day, steps").order("day", { ascending: false }));
      return rows;
    },
    async save(day, steps) {
      const { data: { session } } = await sb.auth.getSession();
      fail(await sb.from("steps").upsert({ user_id: session.user.id, day, steps }, { onConflict: "user_id,day" }));
    },
    async remove(day) { fail(await sb.from("steps").delete().eq("day", day)); },
    async totals() { return fail(await sb.rpc("team_totals")); },
  };
}
function normalizePhone(s) {
  let d = s.replace(/\D/g, "");
  if (d.length === 10) d = "1" + d;
  return "+" + d;
}

function demoBackend() {
  const load = (k, f) => { try { return JSON.parse(localStorage.getItem(k)) ?? f; } catch { return f; } };
  let rows = load("demo-steps", []), on = load("demo-in", false);
  // Pretend 11 other walkers are out there so the ticker has something to do.
  const base = { total: 214380, walkers: 11, today: 38210 };
  let extra = load("demo-extra", 0);
  const persist = () => { localStorage.setItem("demo-steps", JSON.stringify(rows)); localStorage.setItem("demo-in", on); localStorage.setItem("demo-extra", extra); };
  setInterval(() => { extra += Math.floor(40 + Math.random() * 160); persist(); }, 3000); // simulated teammates
  return {
    demo: true,
    async sendCode() {},
    async verify(_, token) { if (token.trim() !== "123456") throw new Error("Demo mode: use code 123456."); on = true; persist(); },
    async signedIn() { return on; },
    async signOut() { on = false; persist(); },
    async mine() { return [...rows].sort((a, b) => b.day.localeCompare(a.day)); },
    async save(day, steps) {
      if (steps < 0 || steps > 200000 || !Number.isInteger(steps)) throw new Error("Steps must be a whole number from 0 to 200,000.");
      const r = rows.find((x) => x.day === day); r ? (r.steps = steps) : rows.push({ day, steps }); persist();
    },
    async remove(day) { rows = rows.filter((x) => x.day !== day); persist(); },
    async totals() {
      const mine = rows.reduce((a, r) => a + r.steps, 0), tdy = rows.filter((r) => r.day === localToday()).reduce((a, r) => a + r.steps, 0);
      return { total: base.total + extra + mine, walkers: base.walkers + (rows.length ? 1 : 0), today: base.today + extra + tdy };
    },
  };
}
const be = CFG.SUPABASE_URL ? supabaseBackend() : demoBackend();

/* ---------- ticker + progress ---------- */
let shown = 0, target = null, raf = 0;
function tweenTo(next) {
  if (target === null) { shown = next; target = next; $("count").textContent = fmt(next); return; }
  if (next === target) return;
  const gain = next - target;
  target = next;
  if (gain > 0) { const p = $("plus"); p.textContent = "+" + fmt(gain); p.classList.remove("show"); void p.offsetWidth; p.classList.add("show"); }
  cancelAnimationFrame(raf);
  const from = shown, start = performance.now(), dur = Math.min(2500, 900 + Math.abs(next - from) / 40);
  const step = (now) => {
    const t = Math.min(1, (now - start) / dur), e = 1 - Math.pow(1 - t, 3);
    shown = from + (next - from) * e;
    $("count").textContent = fmt(shown);
    if (t < 1) raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
}
function renderTotal(d) {
  const goal = CFG.GOAL;
  tweenTo(d.total);
  const pct = Math.min(100, (d.total / goal) * 100);
  $("fill").style.width = pct + "%";
  $("bar").setAttribute("aria-valuenow", Math.round(pct));
  $("pct").textContent = (pct < 10 ? pct.toFixed(1) : Math.round(pct)) + "% of goal";
  $("goalline").textContent = "Team goal: " + fmt(goal) + " steps";
  $("remain").textContent = d.total >= goal ? "Goal reached! 🎉" : fmt(goal - d.total) + " to go";
  $("walkers").textContent = fmt(d.walkers);
  $("today").textContent = fmt(d.today);
  $("avg").textContent = d.walkers ? fmt(d.total / d.walkers) : "0";
  if (!$("bar").dataset.ticks) {
    $("bar").dataset.ticks = 1;
    [25, 50, 75].forEach((p) => { const t = document.createElement("div"); t.className = "tick"; t.style.left = p + "%"; $("bar").appendChild(t); });
  }
}
async function pollTotal() { try { renderTotal(await be.totals()); } catch (e) { console.warn(e); } }

/* ---------- auth ---------- */
function showSignedOut() { $("app").hidden = true; $("logout").hidden = true; $("signinTop").hidden = false; $("loginCard").hidden = false; }
$("signinTop").addEventListener("click", () => { $("loginCard").scrollIntoView({ behavior: "smooth", block: "center" }); $("ident").focus({ preventScroll: true }); });
async function showSignedIn() {
  $("signinTop").hidden = true; $("loginCard").hidden = true; $("app").hidden = false; $("logout").hidden = false;
  if (!$("day").value) $("day").value = localToday();
  $("day").max = localToday();
  await loadLog();
}
const say = (id, text, err) => { $(id).textContent = text; $(id).className = "msg" + (err ? " err" : ""); };
$("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault(); say("loginMsg", ""); $("loginBtn").disabled = true;
  try {
    await be.sendCode($("ident").value);
    $("loginForm").hidden = true; $("codeForm").hidden = false; $("code").focus();
    say("loginMsg", be.demo ? "Demo mode: enter code 123456." : "We sent you a code — enter it below.");
  } catch (err) { say("loginMsg", err.message, true); }
  $("loginBtn").disabled = false;
});
$("codeBack").addEventListener("click", () => { $("codeForm").hidden = true; $("loginForm").hidden = false; say("loginMsg", ""); });
$("codeForm").addEventListener("submit", async (e) => {
  e.preventDefault(); say("loginMsg", ""); $("codeBtn").disabled = true;
  try { await be.verify($("ident").value, $("code").value); $("code").value = ""; await showSignedIn(); pollTotal(); }
  catch (err) { say("loginMsg", err.message, true); }
  $("codeBtn").disabled = false;
});
$("logout").addEventListener("click", async () => {
  await be.signOut(); $("log").innerHTML = ""; $("codeForm").hidden = true; $("loginForm").hidden = false; say("loginMsg", ""); showSignedOut();
});

/* ---------- my log ---------- */
let entries = [];
async function loadLog() {
  entries = await be.mine();
  $("myTotal").textContent = fmt(entries.reduce((a, e) => a + e.steps, 0));
  $("empty").hidden = entries.length > 0;
  const ul = $("log"); ul.innerHTML = "";
  for (const en of entries) ul.appendChild(row(en));
}
function row(en) {
  const li = document.createElement("li");
  const view = () => {
    li.innerHTML = `<div class="d">${prettyDay(en.day)}</div><div class="n">${fmt(en.steps)}</div>
      <button class="icon" data-a="edit">Edit</button><button class="icon del" data-a="del">Delete</button>`;
    li.querySelector('[data-a="edit"]').onclick = edit;
    li.querySelector('[data-a="del"]').onclick = async () => {
      if (!confirm(`Delete ${fmt(en.steps)} steps on ${prettyDay(en.day)}?`)) return;
      await be.remove(en.day); await loadLog(); pollTotal();
    };
  };
  const edit = () => {
    li.innerHTML = `<div class="d">${prettyDay(en.day)}</div>
      <input type="number" min="0" max="200000" step="1" inputmode="numeric" value="${en.steps}">
      <button class="icon" data-a="save">Save</button><button class="icon" data-a="cancel">Cancel</button>`;
    const inp = li.querySelector("input"); inp.focus(); inp.select();
    const save = async () => {
      try { await be.save(en.day, Number(inp.value)); await loadLog(); pollTotal(); } catch (err) { alert(err.message); }
    };
    li.querySelector('[data-a="save"]').onclick = save;
    li.querySelector('[data-a="cancel"]').onclick = view;
    inp.onkeydown = (e) => { if (e.key === "Enter") save(); if (e.key === "Escape") view(); };
  };
  view();
  return li;
}
$("addForm").addEventListener("submit", async (e) => {
  e.preventDefault(); say("addMsg", "");
  const day = $("day").value, steps = Number($("steps").value);
  const existing = entries.find((x) => x.day === day);
  if (existing && !confirm(`You already logged ${fmt(existing.steps)} steps for ${prettyDay(day)}. Replace with ${fmt(steps)}?`)) return;
  $("addBtn").disabled = true;
  try {
    await be.save(day, steps);
    $("steps").value = ""; say("addMsg", `Saved ${fmt(steps)} steps for ${prettyDay(day)}.`);
    await loadLog(); pollTotal();
  } catch (err) { say("addMsg", err.message, true); }
  $("addBtn").disabled = false;
});

/* ---------- boot ---------- */
(async () => {
  $("team").textContent = CFG.TEAM_NAME; document.title = CFG.TEAM_NAME;
  if (be.demo) $("demoBadge").hidden = false;
  pollTotal(); setInterval(pollTotal, be.demo ? 3000 : 5000);
  try { (await be.signedIn()) ? await showSignedIn() : showSignedOut(); } catch { showSignedOut(); }
})();
