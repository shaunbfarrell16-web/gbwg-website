"use strict";
/* The Great British Warcraft Guild – website
   Tabs: News · Roster · Events · Guild Map · Apply · Officers */

// ---------- WoW Forever data (Alliance) ----------
const CLASSES = {
  Druid:   { c: "#FF7C0A", s: { Balance: "DPS", Feral: "DPS", Restoration: "Healer" } },
  Hunter:  { c: "#AAD372", s: { "Beast Mastery": "DPS", Marksmanship: "DPS", Survival: "DPS" } },
  Mage:    { c: "#3FC7EB", s: { Arcane: "DPS", Fire: "DPS", Frost: "DPS" } },
  Paladin: { c: "#F48CBA", s: { Holy: "Healer", Protection: "Tank", Retribution: "DPS" } },
  Priest:  { c: "#FFFFFF", s: { Discipline: "Healer", Holy: "Healer", Shadow: "DPS" } },
  Rogue:   { c: "#FFF468", s: { Assassination: "DPS", Combat: "DPS", Subtlety: "DPS" } },
  Shaman:  { c: "#0070DD", s: { Elemental: "DPS", Enhancement: "DPS", Restoration: "Healer" } },
  Warlock: { c: "#8788EE", s: { Affliction: "DPS", Demonology: "DPS", Destruction: "DPS" } },
  Warrior: { c: "#C69B6D", s: { Arms: "DPS", Fury: "DPS", Protection: "Tank" } },
};
const RACE_CLASSES = {
  "Human": ["Hunter", "Mage", "Paladin", "Priest", "Rogue", "Warlock", "Warrior"],
  "Dwarf": ["Hunter", "Paladin", "Priest", "Rogue", "Shaman", "Warrior"],
  "Night Elf": ["Druid", "Hunter", "Priest", "Rogue", "Warrior"],
  "Gnome": ["Mage", "Priest", "Rogue", "Warlock", "Warrior"],
  "High Order Skyborne": ["Druid", "Hunter", "Mage", "Rogue", "Warrior"],
};
const RACES = Object.keys(RACE_CLASSES);
const CLASS_NAMES = Object.keys(CLASSES);
const PROFS = ["Alchemy", "Blacksmithing", "Enchanting", "Engineering", "Herbalism", "Leatherworking", "Mining", "Skinning", "Tailoring"];
const SECONDARY = ["Cooking", "First Aid", "Fishing"];
const ROLES = ["Tank", "Healer", "DPS"];
const EVENT_TYPES = { Dungeon: "#6fb1ff", Raid: "#e6b84a", PvP: "#ff7a80", Group: "#5fd69a", Social: "#c79bff", Other: "#9fb0cc" };

// ---------- state & helpers ----------
const S = { members: [], news: [], events: [], pins: {}, apps: [], me: null, loaded: false };
const UI = { tab: "", f: { q: "", cls: "", role: "", prof: "" }, sortKey: "name", sortDir: 1, evView: "upcoming", zoom: 1, placing: false, applied: false, applySig: null, rosterBuilt: false, mapBuilt: false };

const $ = (id) => document.getElementById(id);
const el = (form, name) => form.elements[name];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
const opt = (v, sel, label) => `<option value="${esc(v)}" ${v === sel ? "selected" : ""}>${esc(label ?? v)}</option>`;
const col = (cls) => CLASSES[cls]?.c || "#c9d3e6";
const byId = (id) => S.members.find((m) => m.id === id);
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
const fmtDate = (ts) => new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const fmtTime = (d) => d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
const isPast = (e) => Date.parse(e.start) < Date.now() - 3 * 3600e3;
const upcoming = () => S.events.filter((e) => !isPast(e)).sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
const hasProf = (m, p) => m.prof1 === p || m.prof2 === p || (m.secondary || []).includes(p);
const roleWord = (r) => (r === "DPS" ? "DPS" : r + "s");
const avatar = (m, size = 34) => `<span class="avatar" style="--c:${col(m.cls)};width:${size}px;height:${size}px;font-size:${Math.round(size * 0.44)}px">${esc((m.name || "?")[0])}</span>`;
function profText(m) {
  const p = [m.prof1, m.prof2].filter((x) => x && x !== "None");
  const sec = m.secondary || [];
  return (esc(p.join(" · ")) || "–") + (sec.length ? ` <span class="sec-p">+ ${esc(sec.join(", "))}</span>` : "");
}
function fmtText(s) {
  const linked = esc(s).replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)\]])/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
  return linked.split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`).join("");
}

const local = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};
let token = local.get("gbwg-token") || "";
function setToken(t) { token = t || ""; t ? local.set("gbwg-token", t) : local.del("gbwg-token"); }

function toast(msg, bad) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.toggle("bad", !!bad);
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("show"), 3200);
}

async function api(path, { method = "GET", body, raw, type } = {}) {
  const headers = {};
  if (token) headers.authorization = "Bearer " + token;
  let payload;
  if (raw) { payload = raw; headers["content-type"] = type; }
  else if (body !== undefined) { payload = JSON.stringify(body); headers["content-type"] = "application/json"; }
  let r;
  try { r = await fetch("/api" + path, { method, headers, body: payload, cache: "no-store" }); }
  catch { throw new Error("Couldn't reach the server. Check your connection."); }
  let out = {};
  try { out = await r.json(); } catch {}
  if (!r.ok) throw new Error(out.error || `Something went wrong (${r.status}).`);
  return out;
}

async function busy(btn, fn) {
  if (btn) btn.disabled = true;
  try { await fn(); } catch (e) { toast(e.message, true); }
  finally { if (btn) btn.disabled = false; }
}
function submitter(form, fn) {
  return async (e) => {
    e.preventDefault();
    const err = form.querySelector(".err"), btn = form.querySelector("button.primary");
    if (err) err.textContent = "";
    if (btn) btn.disabled = true;
    try { await fn(); } catch (ex) { if (err) err.textContent = ex.message; else toast(ex.message, true); }
    finally { if (btn) btn.disabled = false; }
  };
}

// ---------- loading ----------
let loadSeq = 0;
async function load() {
  const seq = ++loadSeq, sentToken = token;
  try {
    const d = await api("/state");
    if (seq !== loadSeq) return; // a newer refresh (e.g. right after logging in) has already been sent
    S.members = d.members || [];
    S.news = d.news || [];
    S.events = d.events || [];
    S.pins = d.pins || {};
    S.apps = d.apps || [];
    S.me = d.me || null;
    if (sentToken && sentToken === token && !d.me) setToken(""); // login expired or password changed elsewhere
    S.loaded = true;
    $("banner").hidden = true;
    renderAll();
  } catch (e) {
    if (seq !== loadSeq) return;
    const b = $("banner");
    b.textContent = "Couldn't load the guild data: " + e.message;
    b.hidden = false;
  }
}

// ---------- tabs & navigation ----------
const TABS = { news: renderNews, roster: renderRoster, events: renderEvents, map: renderMap, apply: renderApply, officers: renderOfficers };
function currentTab() {
  let t = location.hash.slice(1);
  if (!TABS[t]) t = "news";
  if (t === "officers" && S.loaded && !S.me?.officer) t = "news";
  return t;
}
function showTab() {
  const t = currentTab();
  const changed = t !== UI.tab;
  UI.tab = t;
  document.querySelectorAll(".tab").forEach((s) => (s.hidden = s.id !== "tab-" + t));
  document.querySelectorAll("#nav a").forEach((a) => a.classList.toggle("on", a.dataset.tab === t));
  if (changed) { UI.placing = false; window.scrollTo(0, 0); }
  if (S.loaded) TABS[t]();
  else $("tab-" + t).innerHTML = `<div class="card empty">Loading the guild hall…</div>`;
  closeMenu();
}
function renderAll() { renderNav(); showTab(); }
function openMenu() { $("side").classList.add("open"); $("scrim").classList.add("show"); }
function closeMenu() { $("side").classList.remove("open"); $("scrim").classList.remove("show"); }

function renderNav() {
  const me = S.me;
  $("navOfficers").hidden = !me?.officer;
  $("navApply").hidden = !!(me && !me.gm);
  const pend = S.apps.length;
  $("appBadge").hidden = !pend;
  $("appBadge").textContent = pend;
  const pendSu = me?.officer ? upcoming().reduce((n, e) => n + e.signups.filter((s) => s.status === "pending").length, 0) : 0;
  $("evBadge").hidden = !pendSu;
  $("evBadge").textContent = pendSu;
  const ub = $("userbox");
  if (!me) {
    ub.innerHTML = `<p class="muted" style="font-size:13px;margin:0 0 10px">Members can log in to sign up for events and drop a pin on the map.</p>
      <div class="row"><button class="primary" data-act="login">Log in</button><a class="btn ghost" href="#apply">Apply</a></div>`;
  } else {
    const c = me.gm ? "var(--gold)" : col(me.cls);
    ub.innerHTML = `<div class="me"><span class="avatar" style="--c:${c}">${esc(me.name[0])}</span>
      <div><b style="color:${me.gm ? "var(--gold2)" : c}">${esc(me.name)}</b><small>${me.gm ? "Guild Master (PIN)" : esc(me.rank || "Member")}</small></div></div>
      <div class="row">${me.gm ? "" : `<button class="ghost small" data-act="profile" data-id="${me.id}">My profile</button>`}<button class="ghost small" data-act="logout">Log out</button></div>`;
  }
}

// ---------- dialogs ----------
const modal = $("modal");
function openModal(html, { wide, small } = {}) {
  modal.className = wide ? "wide" : small ? "small" : "";
  modal.innerHTML = `<button class="x" type="button" data-act="closeModal" aria-label="Close">×</button>${html}`;
  if (!modal.open) modal.showModal();
  modal.scrollTop = 0;
}
function closeModal() { if (modal.open) modal.close(); }
modal.addEventListener("click", (e) => { if (e.target === modal && !modal.querySelector("form")) closeModal(); });

function promptBox(message, { input = true, label = "", placeholder = "", ok = "OK", danger = false, type = "text" } = {}) {
  return new Promise((resolve) => {
    const d = $("confirm");
    d.innerHTML = `<form><p style="margin:0 0 14px">${esc(message)}</p>
      ${input ? `<label>${esc(label)}<input name="v" type="${type}" placeholder="${esc(placeholder)}" maxlength="300"></label>` : ""}
      <div class="row end" style="margin-top:16px"><button type="button" class="ghost" data-c="1">Cancel</button><button class="${danger ? "danger-solid" : "primary"}">${esc(ok)}</button></div></form>`;
    const f = d.querySelector("form");
    let done = false;
    const finish = (v) => { if (done) return; done = true; if (d.open) d.close(); resolve(v); };
    f.querySelector("[data-c]").onclick = () => finish(null);
    f.onsubmit = (e) => { e.preventDefault(); finish(input ? el(f, "v").value : true); };
    d.onclose = () => finish(null);
    d.showModal();
    (input ? el(f, "v") : f.querySelector("button.primary, button.danger-solid")).focus();
  });
}
const confirmBox = (msg, ok = "Yes", danger = true) => promptBox(msg, { input: false, ok, danger }).then((v) => v === true);

// ---------- shared character form ----------
function charFields(c = {}, { password = false, about = false, rank = false } = {}) {
  const sec = c.secondary || [];
  return `<div class="fgrid">
    <label>Character name *<input name="name" maxlength="24" required value="${esc(c.name || "")}" autocomplete="off"></label>
    <label>Player / Discord name<input name="player" maxlength="32" value="${esc(c.player || "")}" autocomplete="off"></label>
    <label>Race *<select name="race" required>${RACES.map((r) => opt(r, RACES.includes(c.race) ? c.race : "Human")).join("")}</select></label>
    <label>Class *<select name="cls" required></select></label>
    <label>Spec<select name="spec"></select></label>
    <label>Role *<select name="role" required>${ROLES.map((r) => opt(r, c.role || "DPS")).join("")}</select></label>
    <label>Profession 1<select name="prof1">${["None", ...PROFS].map((p) => opt(p, c.prof1 || "None")).join("")}</select></label>
    <label>Profession 2<select name="prof2">${["None", ...PROFS].map((p) => opt(p, c.prof2 || "None")).join("")}</select></label>
    <div class="full"><span class="lbl">Secondary professions</span><div class="checks">${SECONDARY.map((p) => `<label><input type="checkbox" name="secondary" value="${p}" ${sec.includes(p) ? "checked" : ""}>${p}</label>`).join("")}</div></div>
    <label>Level<input name="level" type="number" min="1" max="90" placeholder="Optional" value="${c.level ?? ""}"></label>
    ${rank ? `<label>Rank<select name="rank">${["Member", "Officer"].map((r) => opt(r, c.rank || "Member")).join("")}</select></label>` : ""}
    ${about ? `<label class="full">About you<textarea name="about" rows="4" maxlength="1000" placeholder="Tell us a bit about yourself – how long you've played, what you enjoy (dungeons, raids, PvP, professions, a good natter…)"></textarea></label>` : ""}
    ${password ? `<label>Choose a password *<input name="password" type="password" minlength="4" maxlength="64" required autocomplete="new-password"></label>
      <label>Confirm password *<input name="password2" type="password" minlength="4" maxlength="64" required autocomplete="new-password"></label>
      <p class="muted full" style="margin:-4px 0 0;font-size:13px">Once you're approved, you'll log in with your character name and this password.</p>` : ""}
  </div>`;
}
function wireCharForm(form, c = {}) {
  const race = el(form, "race"), cls = el(form, "cls"), spec = el(form, "spec"), role = el(form, "role");
  const syncRole = () => { const r = CLASSES[cls.value]?.s[spec.value]; if (r) role.value = r; };
  const fillSpecs = (want) => {
    spec.innerHTML = Object.keys(CLASSES[cls.value]?.s || {}).map((s) => opt(s, want)).join("");
    if (!want) syncRole();
  };
  const fillClasses = (want, wantSpec) => {
    cls.innerHTML = RACE_CLASSES[race.value].map((x) => opt(x, want)).join("");
    fillSpecs(cls.value === want ? wantSpec : "");
  };
  race.onchange = () => fillClasses(cls.value);
  cls.onchange = () => fillSpecs("");
  spec.onchange = syncRole;
  fillClasses(c.cls, c.spec);
  if (c.role) role.value = c.role;
}
function readCharForm(form) {
  const fd = new FormData(form);
  const d = Object.fromEntries(fd);
  d.secondary = fd.getAll("secondary");
  return d;
}

// ---------- login / profile ----------
function openLogin() {
  openModal(`<h3>Log in</h3>
    <div class="seg" id="lmode"><button type="button" class="on" data-m="member">Member</button><button type="button" data-m="gm">Guild Master PIN</button></div>
    <form id="lf">
      <div id="lmMember" class="fgrid" style="grid-template-columns:1fr">
        <label>Character name<input name="name" autocomplete="username" required></label>
        <label>Password<input name="password" type="password" autocomplete="current-password" required></label>
      </div>
      <div id="lmGm" hidden><label>Guild Master PIN<input name="pin" type="password" inputmode="numeric" autocomplete="off"></label></div>
      <p class="err"></p>
      <div class="row end"><span class="muted" style="font-size:13px;margin-right:auto">Not a member? <a href="#apply" data-act="closeModal">Apply here</a></span><button class="primary">Log in</button></div>
    </form>`, { small: true });
  const f = $("lf");
  let mode = "member";
  $("lmode").onclick = (e) => {
    const b = e.target.closest("button[data-m]");
    if (!b) return;
    mode = b.dataset.m;
    $("lmode").querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
    $("lmMember").hidden = mode !== "member";
    $("lmGm").hidden = mode !== "gm";
    el(f, "name").required = el(f, "password").required = mode === "member";
    (mode === "gm" ? el(f, "pin") : el(f, "name")).focus();
  };
  f.onsubmit = submitter(f, async () => {
    const r = mode === "gm"
      ? await api("/login/gm", { method: "POST", body: { pin: el(f, "pin").value } })
      : await api("/login", { method: "POST", body: { name: el(f, "name").value, password: el(f, "password").value } });
    setToken(r.token);
    closeModal();
    UI.applySig = null;
    await load();
    toast(`Welcome${S.me ? ", " + S.me.name : ""}!`);
  });
  setTimeout(() => el(f, "name").focus(), 30);
}
async function logout() {
  setToken("");
  S.me = null;
  UI.placing = false;
  UI.applySig = null;
  await load();
  toast("Logged out");
}

function openProfile(id) {
  const m = byId(id);
  if (!m) return;
  const self = S.me && S.me.id === m.id, off = !!S.me?.officer;
  const pin = S.pins[m.id];
  const btns = [];
  if (self || off) btns.push(`<button class="ghost" data-act="editProfile" data-id="${m.id}">Edit details</button>`);
  if (self) btns.push(`<button class="ghost" data-act="changePw">Change password</button>`);
  else if (off) btns.push(`<button class="ghost" data-act="resetPw" data-id="${m.id}">Set password</button>`);
  if (pin && (self || off)) btns.push(`<button class="ghost" data-act="removePin" data-id="${m.id}">Remove map pin</button>`);
  if (off && !self) btns.push(`<button class="ghost danger" data-act="removeMember" data-id="${m.id}">Remove from guild</button>`);
  openModal(`<div class="prof-head">${avatar(m, 56)}<div><h3 style="color:${col(m.cls)}">${esc(m.name)}</h3>
      <div class="row wrap" style="gap:8px"><span class="rank ${esc(m.rank)}">${esc(m.rank)}</span><span class="muted">${esc(m.race)} ${esc(m.cls)}</span></div></div></div>
    <dl class="facts">
      <dt>Spec</dt><dd>${esc(m.spec) || "–"}</dd>
      <dt>Role</dt><dd><span class="role ${esc(m.role)}">${esc(m.role)}</span></dd>
      <dt>Level</dt><dd>${m.level ?? "–"}</dd>
      <dt>Professions</dt><dd>${esc([m.prof1, m.prof2].filter((p) => p && p !== "None").join(" · ")) || "–"}</dd>
      <dt>Secondary</dt><dd>${esc((m.secondary || []).join(", ")) || "–"}</dd>
      <dt>Player</dt><dd>${esc(m.player) || "–"}</dd>
      <dt>Joined</dt><dd>${m.joined ? fmtDate(m.joined) : "–"}</dd>
      <dt>Guild map</dt><dd>${pin ? `<a href="#map" data-act="flashPin" data-id="${m.id}">Show on map</a>` : "No pin yet"}</dd>
      ${off && m.needsPw ? `<dt>Login</dt><dd style="color:#ffd27a">No password set yet</dd>` : ""}
    </dl>
    ${btns.length ? `<div class="row wrap">${btns.join("")}</div>` : ""}`);
}
function openEditProfile(id) {
  const m = byId(id);
  if (!m) return;
  const off = !!S.me?.officer;
  openModal(`<h3>Edit ${esc(m.name)}</h3>
    ${m.race && !RACES.includes(m.race) ? `<p class="note">${esc(m.race)} isn't a WoW Forever race, so please pick a new one.</p>` : ""}
    <form id="pf">${charFields(m, { rank: off })}<p class="err"></p>
    <div class="row end"><button type="button" class="ghost" data-act="closeModal">Cancel</button><button class="primary">Save</button></div></form>`, { wide: true });
  const f = $("pf");
  wireCharForm(f, m);
  f.onsubmit = submitter(f, async () => {
    await api(`/members/${id}`, { method: "PUT", body: readCharForm(f) });
    closeModal();
    toast("Saved");
    await load();
  });
}
function openChangePw() {
  openModal(`<h3>Change password</h3><form id="cpf"><div class="fgrid" style="grid-template-columns:1fr">
      <label>New password<input name="p1" type="password" minlength="4" maxlength="64" required autocomplete="new-password"></label>
      <label>Confirm new password<input name="p2" type="password" minlength="4" maxlength="64" required autocomplete="new-password"></label></div>
    <p class="err"></p><div class="row end"><button type="button" class="ghost" data-act="closeModal">Cancel</button><button class="primary">Save</button></div></form>`, { small: true });
  const f = $("cpf");
  f.onsubmit = submitter(f, async () => {
    if (el(f, "p1").value !== el(f, "p2").value) throw new Error("The passwords don't match.");
    const r = await api(`/members/${S.me.id}`, { method: "PUT", body: { password: el(f, "p1").value } });
    if (r.token) setToken(r.token);
    closeModal();
    toast("Password changed");
  });
}
function openResetPw(id) {
  const m = byId(id);
  if (!m) return;
  openModal(`<h3>Set password for ${esc(m.name)}</h3><form id="rpf">
    <label>New password<input name="p1" type="text" minlength="4" maxlength="64" required autocomplete="off" placeholder="At least 4 characters"></label>
    <p class="muted" style="font-size:13px">Let ${esc(m.name)} know this password. They can change it later from My profile.</p>
    <p class="err"></p><div class="row end"><button type="button" class="ghost" data-act="closeModal">Cancel</button><button class="primary">Set password</button></div></form>`, { small: true });
  const f = $("rpf");
  f.onsubmit = submitter(f, async () => {
    await api(`/members/${id}`, { method: "PUT", body: { password: el(f, "p1").value } });
    closeModal();
    toast(`Password set for ${m.name}`);
    await load();
  });
  setTimeout(() => el(f, "p1").focus(), 30);
}
async function removeMember(id, btn) {
  const m = byId(id);
  if (!m || !(await confirmBox(`Remove ${m.name} from the guild? Their event sign-ups and map pin will go too.`, "Remove"))) return;
  await busy(btn, async () => {
    await api(`/members/${id}`, { method: "DELETE" });
    closeModal();
    toast(`${m.name} removed`);
    await load();
  });
}
async function removePin(id, btn) {
  const self = S.me?.id === id;
  if (!(await confirmBox(self ? "Remove your pin from the map?" : `Remove ${byId(id)?.name || "this"} pin from the map?`, "Remove"))) return;
  await busy(btn, async () => {
    await api(`/pins/${self ? "me" : id}`, { method: "DELETE" });
    closeModal();
    toast("Pin removed");
    await load();
  });
}

// ---------- NEWS ----------
function renderNews() {
  const off = !!S.me?.officer;
  const posts = [...S.news].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.created - a.created);
  const next = upcoming().slice(0, 3);
  $("tab-news").innerHTML = `
    ${!S.me ? `<div class="card hero"><div><h2>Welcome to the guild hall</h2><p>A friendly British Alliance guild on WoW Forever. Better bakes than wipes.</p></div><a class="btn primary" href="#apply">Apply to join</a></div>` : ""}
    <div class="head"><h1>Guild News</h1>${off ? `<div class="btns"><button class="primary" data-act="newPost">+ New post</button></div>` : ""}</div>
    ${next.length ? `<div class="card" style="margin-bottom:18px"><h2>Coming up</h2><div class="mlist">${next.map((e) => {
      const d = new Date(e.start);
      return `<a class="btn mrow" href="#events" style="justify-content:stretch"><span class="etype" style="color:${EVENT_TYPES[e.type] || "#9fb0cc"}">${esc(e.type)}</span><span class="who"><b>${esc(e.title)}</b><span>${d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })} · ${fmtTime(d)}</span></span><span class="muted" style="font-size:13px">${e.signups.filter((s) => s.status === "approved").length} going</span></a>`;
    }).join("")}</div></div>` : ""}
    ${posts.length ? posts.map(postCard).join("") : `<div class="card empty">No news yet.${off ? " Post the first update!" : " Check back soon."}</div>`}`;
}
function postCard(p) {
  const n = p.images.length;
  return `<article class="card post">
    <h2>${esc(p.title)}</h2>
    <div class="meta">${p.pinned ? `<span class="pill pinned">Pinned</span>` : ""}<span>By ${esc(p.author)}</span><span>·</span><span>${fmtDate(p.created)}</span>${p.updated ? "<span>· edited</span>" : ""}</div>
    ${p.body ? `<div class="body">${fmtText(p.body)}</div>` : ""}
    ${n ? `<div class="gallery g${Math.min(n, 4)}">${p.images.map((id, i) => `<button class="ph" data-act="lightbox" data-id="${p.id}" data-i="${i}" aria-label="View picture ${i + 1}"><img loading="lazy" src="/api/images/${id}" alt=""></button>`).join("")}</div>` : ""}
    ${S.me?.officer ? `<div class="row acts"><button class="ghost small" data-act="editPost" data-id="${p.id}">Edit</button><button class="ghost small danger" data-act="deletePost" data-id="${p.id}">Delete</button></div>` : ""}
  </article>`;
}
function openLightbox(postId, start) {
  const p = S.news.find((x) => x.id === postId);
  if (!p) return;
  const lb = $("lightbox");
  let i = +start || 0;
  const step = (k) => { i = (i + k + p.images.length) % p.images.length; draw(); };
  const draw = () => {
    lb.innerHTML = `<button class="x" type="button" aria-label="Close">×</button><img src="/api/images/${p.images[i]}" alt="">
      ${p.images.length > 1 ? `<button class="nav prev" type="button" aria-label="Previous">‹</button><button class="nav next" type="button" aria-label="Next">›</button>` : ""}`;
    lb.querySelector(".x").onclick = () => lb.close();
    lb.querySelector(".prev")?.addEventListener("click", () => step(-1));
    lb.querySelector(".next")?.addEventListener("click", () => step(1));
  };
  draw();
  lb.onkeydown = (e) => { if (e.key === "ArrowLeft") step(-1); if (e.key === "ArrowRight") step(1); };
  lb.onclick = (e) => { if (e.target === lb) lb.close(); };
  lb.showModal();
}
async function shrinkImage(file) {
  if (!file.type.startsWith("image/")) throw new Error(`${file.name} isn't a picture.`);
  if (file.type === "image/gif" && file.size < 4.5e6) return file; // keep animations
  let src;
  try { src = await createImageBitmap(file); }
  catch {
    src = await new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = () => rej(new Error(`Couldn't read ${file.name}.`));
      im.src = URL.createObjectURL(file);
    });
  }
  const k = Math.min(1, 1600 / Math.max(src.width, src.height));
  const c = document.createElement("canvas");
  c.width = Math.round(src.width * k);
  c.height = Math.round(src.height * k);
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#0a1220";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(src, 0, 0, c.width, c.height);
  return new Promise((res) => c.toBlob(res, "image/jpeg", 0.85));
}
function openPost(p) {
  const imgs = p ? p.images.map((id) => ({ id })) : [];
  openModal(`<h3>${p ? "Edit post" : "New post"}</h3>
    <form id="nf">
      <div class="fgrid" style="grid-template-columns:1fr">
        <label>Title *<input name="title" maxlength="120" required value="${esc(p?.title || "")}"></label>
        <label>Message<textarea name="body" rows="8" maxlength="8000" placeholder="What's happening in the guild?">${esc(p?.body || "")}</textarea></label>
        <div><span class="lbl">Pictures (up to 8)</span><div class="thumbs" id="thumbs"></div>
          <label class="btn ghost small filebtn">+ Add pictures<input type="file" accept="image/*" multiple hidden id="fileIn"></label></div>
        <label class="check"><input type="checkbox" name="pinned" ${p?.pinned ? "checked" : ""}> Pin this post to the top</label>
      </div>
      <p class="err"></p>
      <div class="row end"><button type="button" class="ghost" data-act="closeModal">Cancel</button><button class="primary">${p ? "Save" : "Post"}</button></div>
    </form>`, { wide: true });
  const f = $("nf"), thumbs = $("thumbs");
  const draw = () => {
    thumbs.innerHTML = imgs.map((im, i) => `<div class="thumb"><img src="${im.id ? `/api/images/${im.id}` : im.url}" alt=""><button type="button" data-i="${i}" aria-label="Remove picture">×</button></div>`).join("");
  };
  draw();
  thumbs.onclick = (e) => { const b = e.target.closest("button[data-i]"); if (b) { imgs.splice(+b.dataset.i, 1); draw(); } };
  $("fileIn").onchange = async (e) => {
    const err = f.querySelector(".err");
    err.textContent = "";
    for (const file of e.target.files) {
      if (imgs.length >= 8) { err.textContent = "That's the maximum of 8 pictures."; break; }
      try { const blob = await shrinkImage(file); imgs.push({ blob, url: URL.createObjectURL(blob) }); }
      catch (ex) { err.textContent = ex.message; }
    }
    e.target.value = "";
    draw();
  };
  f.onsubmit = submitter(f, async () => {
    const btn = f.querySelector("button.primary");
    const label = btn.textContent;
    try {
      const todo = imgs.filter((x) => !x.id).length;
      let n = 0;
      for (const im of imgs) {
        if (im.id) continue;
        btn.textContent = `Uploading picture ${++n} of ${todo}…`;
        im.id = (await api("/images", { method: "POST", raw: im.blob, type: im.blob.type || "image/jpeg" })).id;
      }
      btn.textContent = "Saving…";
      const body = { title: el(f, "title").value, body: el(f, "body").value, pinned: el(f, "pinned").checked, images: imgs.map((x) => x.id) };
      if (p) await api(`/news/${p.id}`, { method: "PUT", body });
      else await api("/news", { method: "POST", body });
      closeModal();
      toast(p ? "Post updated" : "Posted!");
      await load();
    } finally { btn.textContent = label; }
  });
}
async function deletePost(id, btn) {
  if (!(await confirmBox("Delete this post and its pictures?", "Delete"))) return;
  await busy(btn, async () => { await api(`/news/${id}`, { method: "DELETE" }); toast("Post deleted"); await load(); });
}

// ---------- ROSTER ----------
function renderRoster() {
  const root = $("tab-roster");
  if (!UI.rosterBuilt) {
    const cols = [["name", "Character"], ["player", "Player"], ["cls", "Class"], ["spec", "Spec"], ["role", "Role"], ["race", "Race"], ["level", "Lvl"], ["prof1", "Professions"], ["rank", "Rank"]];
    root.innerHTML = `
      <div class="head"><h1>Guild Roster</h1><p class="sub">Click any number, class, race or profession to see who's who – or click a member for their details.</p></div>
      <div class="stats" id="rStats"></div>
      <div class="grid2">
        <div class="card"><h2>Classes</h2><div class="bars" id="rClasses"></div></div>
        <div class="card"><h2>Races</h2><div class="chips" id="rRaces"></div><h2 style="margin-top:22px">Ranks</h2><div class="chips" id="rRanks"></div></div>
      </div>
      <div class="card" style="margin-bottom:16px"><h2>Professions</h2><div class="profs" id="rProfs"></div></div>
      <div class="card"><h2>Members</h2>
        <div class="toolbar">
          <input id="rQ" placeholder="Search name or player…" aria-label="Search">
          <select id="rCls" aria-label="Class"><option value="">All classes</option>${CLASS_NAMES.map((c) => opt(c)).join("")}</select>
          <select id="rRole" aria-label="Role"><option value="">All roles</option>${ROLES.map((r) => opt(r)).join("")}</select>
          <select id="rProf" aria-label="Profession"><option value="">All professions</option>${[...PROFS, ...SECONDARY].map((p) => opt(p)).join("")}</select>
          <button class="ghost small" data-act="rosterClear">Clear</button>
        </div>
        <div class="tablewrap"><table><thead><tr>${cols.map(([k, l]) => `<th data-sort="${k}">${l}</th>`).join("")}</tr></thead><tbody id="rRows"></tbody></table></div>
      </div>`;
    $("rQ").oninput = (e) => { UI.f.q = e.target.value; drawRosterTable(); };
    $("rCls").onchange = (e) => { UI.f.cls = e.target.value; drawRosterTable(); };
    $("rRole").onchange = (e) => { UI.f.role = e.target.value; drawRosterTable(); };
    $("rProf").onchange = (e) => { UI.f.prof = e.target.value; drawRosterTable(); };
    root.querySelector("thead").onclick = (e) => {
      const th = e.target.closest("th[data-sort]");
      if (!th) return;
      UI.sortDir = UI.sortKey === th.dataset.sort ? -UI.sortDir : 1;
      UI.sortKey = th.dataset.sort;
      drawRosterTable();
    };
    UI.rosterBuilt = true;
  }
  const M = S.members;
  const cnt = (f) => M.filter(f).length;
  $("rStats").innerHTML = [["Members", M.length, "all"], ["Tanks", cnt((m) => m.role === "Tank"), "Tank"], ["Healers", cnt((m) => m.role === "Healer"), "Healer"], ["DPS", cnt((m) => m.role === "DPS"), "DPS"], ["Officers", cnt((m) => m.rank === "Officer"), "Officer"]]
    .map(([l, n, k]) => `<button class="stat" data-act="listStat" data-k="${k}"><div class="n">${n}</div><div class="l">${l}</div></button>`).join("");

  const classes = [...CLASS_NAMES, ...new Set(M.map((m) => m.cls).filter((c) => c && !CLASSES[c]))];
  const max = Math.max(1, ...classes.map((c) => cnt((m) => m.cls === c)));
  $("rClasses").innerHTML = classes.map((c) => {
    const n = cnt((m) => m.cls === c);
    return `<button class="bar" data-act="listClass" data-v="${esc(c)}"><span style="color:${col(c)}">${esc(c)}</span><span class="track"><span class="fill" style="display:block;width:${(n / max) * 100}%;background:${col(c)}"></span></span><span class="c">${n}</span></button>`;
  }).join("");

  const races = [...RACES, ...new Set(M.map((m) => m.race).filter((r) => r && !RACE_CLASSES[r]))].map((r) => [r, cnt((m) => m.race === r)]).sort((a, b) => b[1] - a[1]);
  $("rRaces").innerHTML = races.map(([r, n]) => `<button class="chip" data-act="listRace" data-v="${esc(r)}">${esc(r)}<b>${n}</b></button>`).join("");
  $("rRanks").innerHTML = ["Officer", "Member"].map((r) => `<button class="chip" data-act="listRank" data-v="${r}">${r}s<b>${cnt((m) => m.rank === r)}</b></button>`).join("");

  $("rProfs").innerHTML = [...PROFS, ...SECONDARY].map((p) => {
    const who = M.filter((m) => hasProf(m, p));
    const sec = SECONDARY.includes(p);
    return `<button class="prof ${who.length ? "" : "gap"} ${sec ? "sec" : ""}" data-act="listProf" data-v="${esc(p)}">
      <div class="t">${esc(p)}<span>${who.length}</span></div>
      <div class="w">${who.length ? esc(who.map((w) => w.name).join(", ")) : "Nobody yet – wanted!"}</div></button>`;
  }).join("");
  drawRosterTable();
}
function drawRosterTable() {
  const q = UI.f.q.toLowerCase().trim(), f = UI.f, k = UI.sortKey;
  const list = S.members.filter((m) =>
    (!q || m.name.toLowerCase().includes(q) || (m.player || "").toLowerCase().includes(q)) &&
    (!f.cls || m.cls === f.cls) && (!f.role || m.role === f.role) && (!f.prof || hasProf(m, f.prof)));
  list.sort((a, b) => String(a[k] ?? "").localeCompare(String(b[k] ?? ""), "en", { numeric: true }) * UI.sortDir);
  document.querySelectorAll("#tab-roster th").forEach((th) => th.classList.toggle("sorted", th.dataset.sort === k));
  $("rRows").innerHTML = list.length
    ? list.map((m) => `<tr data-act="profile" data-id="${m.id}">
        <td class="cname" style="color:${col(m.cls)}">${esc(m.name)}</td><td>${esc(m.player) || "–"}</td>
        <td style="color:${col(m.cls)}">${esc(m.cls)}</td><td>${esc(m.spec) || "–"}</td>
        <td><span class="role ${esc(m.role)}">${esc(m.role)}</span></td><td>${esc(m.race)}</td><td>${m.level ?? "–"}</td>
        <td>${profText(m)}</td><td><span class="rank ${esc(m.rank)}">${esc(m.rank)}</span></td></tr>`).join("")
    : `<tr><td colspan="9" class="empty">${S.members.length ? "No members match those filters." : "No members yet – approved applications will appear here."}</td></tr>`;
}
function showList(title, list, extra = "") {
  list = [...list].sort((a, b) => a.name.localeCompare(b.name));
  openModal(`<h3>${esc(title)} <span class="muted" style="font-family:Inter,sans-serif;font-size:15px">(${list.length})</span></h3>${extra}
    <div class="mlist">${list.length ? list.map((m) => `<button class="mrow" data-act="profile" data-id="${m.id}">${avatar(m)}
      <span class="who"><b style="color:${col(m.cls)}">${esc(m.name)}</b><span>${esc([m.spec, m.cls].filter(Boolean).join(" "))} · ${esc(m.race)}${m.level ? ` · Lvl ${m.level}` : ""}</span></span>
      <span class="role ${esc(m.role)}">${esc(m.role)}</span></button>`).join("") : `<p class="muted">Nobody yet.</p>`}</div>`);
}
function listClass(c) {
  const list = S.members.filter((m) => m.cls === c);
  const specs = Object.keys(CLASSES[c]?.s || {});
  const extra = specs.length && list.length ? `<div class="chips" style="margin-bottom:14px">${specs.map((s) => `<span class="chip">${esc(s)}<b>${list.filter((m) => m.spec === s).length}</b></span>`).join("")}</div>` : "";
  showList(c + (c.endsWith("s") ? "es" : "s"), list, extra);
}
function listStat(k) {
  if (k === "all") return showList("All members", S.members);
  if (k === "Officer") return showList("Officers", S.members.filter((m) => m.rank === "Officer"));
  showList(roleWord(k), S.members.filter((m) => m.role === k));
}
function listProf(p) {
  const list = S.members.filter((m) => hasProf(m, p));
  showList(p, list, `<p class="muted" style="margin-top:-6px">${SECONDARY.includes(p) ? "Secondary profession" : "Primary profession"}</p>`);
}

// ---------- EVENTS ----------
const statusLabel = (s) => ({ pending: "Waiting for approval", approved: "Confirmed", declined: "Declined" }[s] || s);
function renderEvents() {
  const off = !!S.me?.officer;
  const up = upcoming();
  const past = S.events.filter(isPast).sort((a, b) => Date.parse(b.start) - Date.parse(a.start));
  const showPast = UI.evView === "past";
  const list = showPast ? past : up;
  $("tab-events").innerHTML = `
    <div class="head"><h1>Events &amp; Sign-ups</h1>${off ? `<div class="btns"><button class="primary" data-act="newEvent">+ New event</button></div>` : ""}
      <p class="sub">Dungeons, raids and guild get-togethers. Sign up and an officer will confirm your spot.</p></div>
    <div class="seg"><button class="${showPast ? "" : "on"}" data-act="evView" data-v="upcoming">Upcoming (${up.length})</button><button class="${showPast ? "on" : ""}" data-act="evView" data-v="past">Past (${past.length})</button></div>
    ${!S.me ? `<p class="note">Guild members: <a href="#" data-act="login">log in</a> to sign up for events.</p>` : S.me.gm ? `<p class="note">You're logged in with the Guild Master PIN. Log in with your own character to sign yourself up.</p>` : ""}
    ${list.length ? list.map(eventCard).join("") : `<div class="card empty">${showPast ? "No past events yet." : "Nothing planned yet."}${off && !showPast ? " Create the first event!" : ""}</div>`}`;
}
function eventCard(e) {
  const d = new Date(e.start), past = isPast(e), off = !!S.me?.officer, me = S.me;
  const mine = me && !me.gm ? e.signups.find((s) => s.memberId === me.id) : null;
  const appr = e.signups.filter((s) => s.status === "approved" && byId(s.memberId));
  const need = e.need || {};
  const comp = ROLES.map((r) => {
    const n = appr.filter((s) => s.role === r).length, k = need[r] || 0;
    return `<span class="${k && n >= k ? "full-up" : ""}">${roleWord(r)} <b>${n}${k ? "/" + k : ""}</b></span>`;
  }).join("") + `<span>Confirmed <b>${appr.length}${e.size ? "/" + e.size : ""}</b></span>`;
  const groups = ["approved", "pending", "declined"].map((st) => {
    let sus = e.signups.filter((s) => s.status === st && byId(s.memberId));
    if (st === "declined" && !off) sus = sus.filter((s) => s.memberId === me?.id);
    if (!sus.length) return "";
    sus.sort((a, b) => ROLES.indexOf(a.role) - ROLES.indexOf(b.role));
    return `<div class="sgroup"><h4>${{ approved: "Confirmed", pending: "Waiting for approval", declined: "Declined" }[st]} (${sus.length})</h4>${sus.map((s) => signupRow(e, s)).join("")}</div>`;
  }).join("");
  let mineBar = "";
  if (me && !me.gm && !past) {
    mineBar = mine
      ? `<div class="mine-bar"><span>You're signed up as <span class="role ${mine.role}">${mine.role}</span></span><span class="status ${mine.status}">${statusLabel(mine.status)}</span><span class="spacer"></span>
          <button class="ghost small" data-act="signup" data-id="${e.id}">Change</button><button class="ghost small danger" data-act="withdraw" data-id="${e.id}">Withdraw</button></div>`
      : `<button class="primary" data-act="signup" data-id="${e.id}">Sign up</button>`;
  }
  const tc = EVENT_TYPES[e.type] || "#9fb0cc";
  return `<article class="card event ${past ? "past" : ""}">
    <div class="date"><div class="m">${d.toLocaleDateString("en-GB", { month: "short" })}</div><div class="d">${d.getDate()}</div><div class="w">${d.toLocaleDateString("en-GB", { weekday: "short" })} ${fmtTime(d)}</div></div>
    <div>
      <div class="row wrap" style="gap:10px"><h2>${esc(e.title)}</h2><span class="etype" style="color:${tc}">${esc(e.type)}</span></div>
      <div class="emeta"><span>${d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })} at ${fmtTime(d)}</span><span>·</span><span>Organised by ${esc(e.createdBy)}</span></div>
      ${e.desc ? `<p class="edesc">${esc(e.desc)}</p>` : ""}
      <div class="comp">${comp}</div>
      ${groups ? `<div class="signups">${groups}</div>` : `<p class="muted" style="margin:0 0 12px">No sign-ups yet.</p>`}
      ${mineBar}
      ${off ? `<div class="row acts" style="margin-top:12px"><button class="ghost small" data-act="editEvent" data-id="${e.id}">Edit event</button><button class="ghost small danger" data-act="deleteEvent" data-id="${e.id}">Delete</button></div>` : ""}
    </div>
  </article>`;
}
function signupRow(e, s) {
  const m = byId(s.memberId);
  const ops = S.me?.officer ? `<span class="ops">
      ${s.status !== "approved" ? `<button class="small okbtn" data-act="suSet" data-e="${e.id}" data-m="${s.memberId}" data-s="approved">✓ Approve</button>` : ""}
      ${s.status !== "declined" ? `<button class="small ghost danger" data-act="suSet" data-e="${e.id}" data-m="${s.memberId}" data-s="declined">${s.status === "approved" ? "Decline" : "✗ Decline"}</button>` : ""}
      <button class="small ghost" data-act="suRemove" data-e="${e.id}" data-m="${s.memberId}">Remove</button></span>` : "";
  return `<div class="su"><span class="nm" style="color:${col(m.cls)}" data-act="profile" data-id="${m.id}">${esc(m.name)}</span>
    <span class="muted" style="font-size:13px">${esc(m.cls)}</span><span class="role ${s.role}">${s.role}</span>
    ${s.note ? `<span class="nt">“${esc(s.note)}”</span>` : ""}${ops}</div>`;
}
function openSignup(id) {
  const e = S.events.find((x) => x.id === id), m = byId(S.me?.id);
  if (!e || !m) return;
  const mine = e.signups.find((s) => s.memberId === m.id);
  openModal(`<h3>Sign up: ${esc(e.title)}</h3><form id="sf"><div class="fgrid">
      <label>Character<input value="${esc(m.name)} – ${esc(m.cls)}" disabled></label>
      <label>Role<select name="role">${ROLES.map((r) => opt(r, mine?.role || m.role || "DPS")).join("")}</select></label>
      <label class="full">Note (optional)<input name="note" maxlength="140" placeholder="e.g. Can only stay for 2 hours" value="${esc(mine?.note || "")}"></label>
    </div><p class="err"></p><div class="row end"><button type="button" class="ghost" data-act="closeModal">Cancel</button><button class="primary">${mine ? "Update" : "Sign up"}</button></div></form>`);
  const f = $("sf");
  f.onsubmit = submitter(f, async () => {
    await api(`/events/${id}/signup`, { method: "POST", body: { role: el(f, "role").value, note: el(f, "note").value } });
    closeModal();
    toast(mine ? "Sign-up updated" : "You're signed up – an officer will confirm your spot");
    await load();
  });
}
function openEvent(e) {
  const pad = (n) => String(n).padStart(2, "0");
  const d = e ? new Date(e.start) : (() => { const x = new Date(); x.setDate(x.getDate() + 1); x.setHours(19, 30, 0, 0); return x; })();
  openModal(`<h3>${e ? "Edit event" : "New event"}</h3><form id="ef"><div class="fgrid">
      <label class="full">Title *<input name="title" maxlength="80" required placeholder="e.g. Deadmines run" value="${esc(e?.title || "")}"></label>
      <label>Type<select name="etype">${Object.keys(EVENT_TYPES).map((t) => opt(t, e?.type || "Dungeon")).join("")}</select></label>
      <label>Group size (optional)<input name="size" type="number" min="0" max="80" value="${e?.size || ""}"></label>
      <label>Date *<input name="date" type="date" required value="${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}"></label>
      <label>Start time *<input name="time" type="time" required value="${pad(d.getHours())}:${pad(d.getMinutes())}"></label>
      <div class="full"><span class="lbl">Roles needed (optional)</span><div class="fgrid" style="grid-template-columns:repeat(3,1fr)">
        ${ROLES.map((r) => `<label>${roleWord(r)}<input name="need${r}" type="number" min="0" max="80" value="${e?.need?.[r] || ""}"></label>`).join("")}</div></div>
      <label class="full">Details<textarea name="desc" rows="4" maxlength="2000" placeholder="Where to meet, what to bring, loot rules…">${esc(e?.desc || "")}</textarea></label>
    </div><p class="err"></p><div class="row end"><button type="button" class="ghost" data-act="closeModal">Cancel</button><button class="primary">${e ? "Save" : "Create event"}</button></div></form>`, { wide: true });
  const f = $("ef");
  if (!e) {
    const preset = () => { if (el(f, "etype").value === "Dungeon") { el(f, "size").value = 5; el(f, "needTank").value = 1; el(f, "needHealer").value = 1; el(f, "needDPS").value = 3; } };
    preset();
    el(f, "etype").onchange = preset;
  }
  f.onsubmit = submitter(f, async () => {
    const start = new Date(`${el(f, "date").value}T${el(f, "time").value}`);
    if (Number.isNaN(start.getTime())) throw new Error("Pick a valid date and time.");
    const body = {
      title: el(f, "title").value, type: el(f, "etype").value, start: start.toISOString(), size: el(f, "size").value,
      need: { Tank: el(f, "needTank").value, Healer: el(f, "needHealer").value, DPS: el(f, "needDPS").value }, desc: el(f, "desc").value,
    };
    if (e) await api(`/events/${e.id}`, { method: "PUT", body });
    else await api("/events", { method: "POST", body });
    closeModal();
    toast(e ? "Event updated" : "Event created");
    UI.evView = "upcoming";
    await load();
  });
}

// ---------- MAP ----------
const PIN_PATH = "M13 1C6.4 1 1 6.3 1 12.8 1 21.5 13 33 13 33s12-11.5 12-20.2C25 6.3 19.6 1 13 1z";
function renderMap() {
  if (!UI.mapBuilt) {
    $("tab-map").innerHTML = `
      <div class="head"><h1>Guild Map</h1><p class="sub">Where in the Isles of Brittania are we all? Drop a pin roughly where you live – no need to be exact. Hover over (or tap) a pin to see who's there.</p></div>
      <div class="mapctl" id="mapCtl"></div>
      <div id="mapHint"></div>
      <div class="mapwrap" id="mapWrap"><div class="mapinner" id="mapInner"><img src="map.webp" alt="Map of the Isles of Brittania" width="1408" height="768" draggable="false"><div id="pins"></div></div></div>
      <div class="whos" id="mapWho"></div>`;
    wireMap();
    UI.mapBuilt = true;
  }
  drawMap();
}
function drawMap() {
  const me = S.me, member = me && !me.gm, mine = member && S.pins[me.id];
  const entries = Object.entries(S.pins).map(([id, p]) => ({ m: byId(id), p })).filter((x) => x.m);
  $("mapCtl").innerHTML = `
    ${member ? `<button class="${UI.placing ? "ghost" : "primary"}" data-act="mapPlace">${UI.placing ? "Cancel" : mine ? "Move my pin" : "Drop my pin"}</button>${mine && !UI.placing ? `<button class="ghost danger" data-act="removePin" data-id="${me.id}">Remove my pin</button>` : ""}`
      : !me ? `<button class="primary" data-act="login">Log in to add your pin</button>` : ""}
    <span class="spacer"></span><span class="muted">${plural(entries.length, "member")} on the map</span>
    <button class="iconbtn" data-act="mapZoom" data-z="-1" aria-label="Zoom out" ${UI.zoom <= 1 ? "disabled" : ""}><svg viewBox="0 0 24 24"><path d="M5 12h14"/></svg></button>
    <button class="iconbtn" data-act="mapZoom" data-z="1" aria-label="Zoom in" ${UI.zoom >= 3 ? "disabled" : ""}><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></button>`;
  $("mapHint").innerHTML = UI.placing ? `<div class="placing-hint">Click the map roughly where you live. Press Esc or Cancel to stop.</div>` : "";
  const wrap = $("mapWrap");
  wrap.classList.toggle("placing", UI.placing);
  wrap.classList.toggle("zoomed", UI.zoom > 1);
  $("mapInner").style.width = UI.zoom * 100 + "%";
  $("pins").innerHTML = [...entries].sort((a, b) => a.p.y - b.p.y).map(({ m, p }) => `
    <button class="pin ${me && m.id === me.id ? "mine" : ""} ${p.y < 12 ? "low" : ""}" id="pin-${m.id}" style="left:${p.x}%;top:${p.y}%;--c:${col(m.cls)}" data-act="profile" data-id="${m.id}" aria-label="${esc(m.name)}">
      <svg viewBox="0 0 26 34"><path class="body" d="${PIN_PATH}"/><path class="rim" d="${PIN_PATH}"/><circle class="dot" cx="13" cy="12.5" r="4.5"/></svg>
      <span class="tip"><b style="color:${col(m.cls)}">${esc(m.name)}</b><small>${esc(m.race)} ${esc(m.cls)}</small></span></button>`).join("");
  $("mapWho").innerHTML = entries.length
    ? entries.sort((a, b) => a.m.name.localeCompare(b.m.name)).map(({ m }) => `<button class="ghost" style="color:${col(m.cls)}" data-act="flashPin" data-id="${m.id}">${esc(m.name)}</button>`).join("")
    : `<span class="muted">No pins yet${member ? " – be the first!" : "."}</span>`;
}
function wireMap() {
  const wrap = $("mapWrap"), inner = $("mapInner");
  let drag = null, moved = false;
  wrap.addEventListener("pointerdown", (e) => {
    if (UI.placing || UI.zoom <= 1 || e.button !== 0 || e.pointerType === "touch") return;
    drag = { x: e.clientX, y: e.clientY, sl: wrap.scrollLeft, st: wrap.scrollTop };
    moved = false;
  });
  window.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 5) { moved = true; wrap.classList.add("dragging"); }
    wrap.scrollLeft = drag.sl - dx;
    wrap.scrollTop = drag.st - dy;
  });
  window.addEventListener("pointerup", () => { drag = null; wrap.classList.remove("dragging"); });
  wrap.addEventListener("click", (e) => { if (moved) { e.stopPropagation(); e.preventDefault(); moved = false; } }, true);
  inner.addEventListener("click", async (e) => {
    if (!UI.placing) return;
    e.stopPropagation();
    e.preventDefault();
    const r = inner.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 100, y = ((e.clientY - r.top) / r.height) * 100;
    try {
      await api("/pins/me", { method: "PUT", body: { x, y } });
      UI.placing = false;
      toast("Pin dropped!");
      await load();
    } catch (ex) { toast(ex.message, true); }
  }, true);
}
function mapZoom(dir) {
  const steps = [1, 1.5, 2, 3], wrap = $("mapWrap");
  const i = steps.indexOf(UI.zoom), ni = Math.max(0, Math.min(steps.length - 1, i + dir));
  if (ni === i) return;
  const cx = (wrap.scrollLeft + wrap.clientWidth / 2) / wrap.scrollWidth;
  const cy = (wrap.scrollTop + wrap.clientHeight / 2) / wrap.scrollHeight;
  UI.zoom = steps[ni];
  drawMap();
  wrap.scrollLeft = cx * wrap.scrollWidth - wrap.clientWidth / 2;
  wrap.scrollTop = cy * wrap.scrollHeight - wrap.clientHeight / 2;
}
function flashPin(id) {
  closeModal();
  const go = () => {
    const pin = $("pin-" + id);
    if (!pin) return;
    pin.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
    pin.classList.add("flash");
    setTimeout(() => pin.classList.remove("flash"), 2200);
  };
  if (UI.tab !== "map") { location.hash = "map"; setTimeout(go, 120); } else go();
}

// ---------- APPLY ----------
function renderApply() {
  const sig = `${S.me?.id || ""}|${UI.applied}`;
  if (UI.applySig === sig) return;
  UI.applySig = sig;
  const root = $("tab-apply");
  if (S.me && !S.me.gm) {
    root.innerHTML = `<div class="card success"><div class="big">🦁</div><h2>You're already in the guild!</h2>
      <p class="muted">Head to <a href="#events">Events</a> to sign up for a run, or drop your pin on the <a href="#map">Guild Map</a>.</p></div>`;
    return;
  }
  if (UI.applied) {
    root.innerHTML = `<div class="card success"><div class="big">📜</div><h2>Application sent!</h2>
      <p class="muted">An officer will look at it soon. Once you're approved, log in with your character name and the password you just chose.</p>
      <button class="ghost" data-act="applyAgain">Send another application</button></div>`;
    return;
  }
  root.innerHTML = `<div class="apply-wrap">
    <div class="head"><h1>Apply to Join</h1><p class="sub">Fancy joining The Great British Warcraft Guild? Tell us about your character and an officer will review your application.</p></div>
    <form class="card" id="applyForm">${charFields({}, { about: true, password: true })}<p class="err"></p>
      <div class="row end wrap"><span class="muted" style="font-size:13px;margin-right:auto">Already applied? <a href="#" data-act="login">Log in</a> to check your status.</span><button class="primary">Send application</button></div>
    </form></div>`;
  const f = $("applyForm");
  wireCharForm(f, {});
  f.onsubmit = submitter(f, async () => {
    const d = readCharForm(f);
    if (d.password !== d.password2) throw new Error("The two passwords don't match.");
    await api("/apply", { method: "POST", body: d });
    UI.applied = true;
    renderApply();
    window.scrollTo(0, 0);
  });
}

// ---------- OFFICERS ----------
function renderOfficers() {
  if (!S.me?.officer) return;
  const noPw = S.members.filter((m) => m.needsPw);
  const apps = [...S.apps].sort((a, b) => a.created - b.created);
  $("tab-officers").innerHTML = `
    <div class="head"><h1>Officers</h1><p class="sub">Approve new members and look after the guild.</p></div>
    ${S.me.gm ? `<p class="note">You're logged in with the Guild Master PIN. Tip: apply with your own character, approve it below, then make yourself an Officer (Roster → click your name → Edit details → Rank). Your name will then show on news posts and you can sign up for events.</p>` : ""}
    <h2>Applications (${apps.length})</h2>
    ${apps.length ? apps.map(appCard).join("") : `<div class="card empty" style="margin-bottom:20px">No applications waiting. 🎉</div>`}
    ${noPw.length ? `<h2 style="margin-top:26px">Members without a password (${noPw.length})</h2>
      <div class="card" style="margin-bottom:20px"><p class="muted" style="margin-top:0">These came over from the old roster. Set a password for each person and let them know it, so they can log in. They can change it later from My profile.</p>
      <div class="mlist">${noPw.map((m) => `<div class="mrow">${avatar(m)}<span class="who"><b style="color:${col(m.cls)}">${esc(m.name)}</b><span>${esc(m.player || "")}</span></span><button class="small" data-act="resetPw" data-id="${m.id}">Set password</button></div>`).join("")}</div></div>` : ""}
    <h2 style="margin-top:26px">Officer tools</h2>
    <div class="card"><ul class="tips">
      <li><b>Make someone an officer:</b> Roster → click their name → Edit details → set Rank to Officer.</li>
      <li><b>Forgotten password:</b> Roster → click their name → Set password.</li>
      <li><b>Events:</b> create them on the Events tab and approve sign-ups right on each event.</li>
      <li><b>News:</b> post updates and pictures from the News tab.</li>
    </ul>
    <div class="row wrap" style="margin-top:16px"><button class="ghost" data-act="importOld">Import characters from the old roster tracker</button>
      <span class="muted" style="font-size:13px;flex:1;min-width:220px">Copies everyone from tgbwg-roster.netlify.app. Safe to run more than once, as it skips names that are already here.</span></div></div>`;
}
function appCard(a) {
  return `<div class="card appcard">
    <div class="row wrap"><h3 style="margin:0;color:${col(a.cls)}">${esc(a.name)}</h3><span class="role ${esc(a.role)}">${esc(a.role)}</span><span class="spacer"></span><span class="muted" style="font-size:13px">Applied ${fmtDate(a.created)}</span></div>
    <div class="kv" style="margin-top:8px"><span>Race <b>${esc(a.race)}</b></span><span>Class <b style="color:${col(a.cls)}">${esc([a.spec, a.cls].filter(Boolean).join(" "))}</b></span>
      <span>Level <b>${a.level ?? "–"}</b></span><span>Professions <b>${profText(a)}</b></span>${a.player ? `<span>Player <b>${esc(a.player)}</b></span>` : ""}</div>
    ${a.about ? `<div class="about">${esc(a.about)}</div>` : ""}
    <div class="row wrap" style="margin-top:12px"><button class="primary" data-act="approveApp" data-id="${a.id}">✓ Approve</button>
      <button class="ghost" data-act="approveApp" data-id="${a.id}" data-rank="Officer">Approve as Officer</button>
      <button class="ghost danger" data-act="declineApp" data-id="${a.id}">✗ Decline</button></div>
  </div>`;
}

// ---------- click actions ----------
const ACT = {
  openMenu, closeMenu, closeModal,
  login: openLogin,
  logout,
  profile: (a) => openProfile(a.dataset.id),
  editProfile: (a) => openEditProfile(a.dataset.id),
  changePw: openChangePw,
  resetPw: (a) => openResetPw(a.dataset.id),
  removeMember: (a) => removeMember(a.dataset.id, a),
  removePin: (a) => removePin(a.dataset.id, a),
  newPost: () => openPost(),
  editPost: (a) => openPost(S.news.find((p) => p.id === a.dataset.id)),
  deletePost: (a) => deletePost(a.dataset.id, a),
  lightbox: (a) => openLightbox(a.dataset.id, a.dataset.i),
  newEvent: () => openEvent(),
  editEvent: (a) => openEvent(S.events.find((x) => x.id === a.dataset.id)),
  deleteEvent: async (a) => {
    if (!(await confirmBox("Delete this event and all its sign-ups?", "Delete"))) return;
    busy(a, async () => { await api(`/events/${a.dataset.id}`, { method: "DELETE" }); toast("Event deleted"); await load(); });
  },
  signup: (a) => openSignup(a.dataset.id),
  withdraw: async (a) => {
    if (!(await confirmBox("Withdraw from this event?", "Withdraw"))) return;
    busy(a, async () => { await api(`/events/${a.dataset.id}/signup`, { method: "DELETE" }); toast("You've withdrawn"); await load(); });
  },
  suSet: (a) => busy(a, async () => {
    await api(`/events/${a.dataset.e}/signups/${a.dataset.m}`, { method: "POST", body: { status: a.dataset.s } });
    toast(`${byId(a.dataset.m)?.name || "Sign-up"} ${a.dataset.s === "approved" ? "confirmed" : "declined"}`);
    await load();
  }),
  suRemove: async (a) => {
    if (!(await confirmBox(`Remove ${byId(a.dataset.m)?.name || "this person"} from the event?`, "Remove"))) return;
    busy(a, async () => { await api(`/events/${a.dataset.e}/signups/${a.dataset.m}`, { method: "DELETE" }); await load(); });
  },
  evView: (a) => { UI.evView = a.dataset.v; renderEvents(); },
  listStat: (a) => listStat(a.dataset.k),
  listClass: (a) => listClass(a.dataset.v),
  listRace: (a) => showList(a.dataset.v, S.members.filter((m) => m.race === a.dataset.v)),
  listRank: (a) => showList(a.dataset.v + "s", S.members.filter((m) => m.rank === a.dataset.v)),
  listProf: (a) => listProf(a.dataset.v),
  rosterClear: () => {
    UI.f = { q: "", cls: "", role: "", prof: "" };
    ["rQ", "rCls", "rRole", "rProf"].forEach((id) => ($(id).value = ""));
    drawRosterTable();
  },
  approveApp: (a) => busy(a, async () => {
    const app = S.apps.find((x) => x.id === a.dataset.id);
    await api(`/apps/${a.dataset.id}/approve`, { method: "POST", body: { rank: a.dataset.rank || "Member" } });
    toast(`${app?.name || "Applicant"} is now in the guild!`);
    await load();
  }),
  declineApp: async (a) => {
    const app = S.apps.find((x) => x.id === a.dataset.id);
    const reason = await promptBox(`Decline ${app?.name || "this application"}?`, { label: "Reason (optional – they'll see it if they try to log in)", ok: "Decline", danger: true });
    if (reason === null) return;
    busy(a, async () => { await api(`/apps/${a.dataset.id}/decline`, { method: "POST", body: { reason } }); toast("Application declined"); await load(); });
  },
  importOld: (a) => busy(a, async () => {
    const r = await api("/import", { method: "POST" });
    toast(`Imported ${plural(r.added, "character")}${r.skipped ? ` (${r.skipped} already here)` : ""}`);
    await load();
  }),
  applyAgain: () => { UI.applied = false; renderApply(); },
  mapPlace: () => { UI.placing = !UI.placing; drawMap(); },
  mapZoom: (a) => mapZoom(+a.dataset.z),
  flashPin: (a) => flashPin(a.dataset.id),
};
document.addEventListener("click", (e) => {
  const a = e.target.closest("[data-act]");
  if (!a || a.disabled) return;
  if (a.tagName === "A" && a.getAttribute("href") === "#") e.preventDefault();
  ACT[a.dataset.act]?.(a, e);
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && UI.placing && UI.tab === "map") { UI.placing = false; drawMap(); }
});
window.addEventListener("hashchange", showTab);

// ---------- start ----------
showTab();
load();
setInterval(() => { if (!document.hidden && !document.querySelector("dialog[open]") && !UI.placing) load(); }, 45000);
document.addEventListener("visibilitychange", () => { if (!document.hidden && S.loaded && !document.querySelector("dialog[open]")) load(); });
