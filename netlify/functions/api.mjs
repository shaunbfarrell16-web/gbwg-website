// The Great British Warcraft Guild – site API
// One Netlify Function handles everything under /api/*. Data lives in Netlify Blobs.
import { getStore } from "@netlify/blobs";
import crypto from "node:crypto";

// ---------- WoW Forever game data (Alliance) ----------
const RACE_CLASSES = {
  "Human": ["Hunter", "Mage", "Paladin", "Priest", "Rogue", "Warlock", "Warrior"],
  "Dwarf": ["Hunter", "Paladin", "Priest", "Rogue", "Shaman", "Warrior"],
  "Night Elf": ["Druid", "Hunter", "Priest", "Rogue", "Warrior"],
  "Gnome": ["Mage", "Priest", "Rogue", "Warlock", "Warrior"],
  "High Order Skyborne": ["Druid", "Hunter", "Mage", "Rogue", "Warrior"],
};
const SPECS = {
  Druid: ["Balance", "Feral", "Restoration"],
  Hunter: ["Beast Mastery", "Marksmanship", "Survival"],
  Mage: ["Arcane", "Fire", "Frost"],
  Paladin: ["Holy", "Protection", "Retribution"],
  Priest: ["Discipline", "Holy", "Shadow"],
  Rogue: ["Assassination", "Combat", "Subtlety"],
  Shaman: ["Elemental", "Enhancement", "Restoration"],
  Warlock: ["Affliction", "Demonology", "Destruction"],
  Warrior: ["Arms", "Fury", "Protection"],
};
const RACES = Object.keys(RACE_CLASSES);
const PROFS = ["None", "Alchemy", "Blacksmithing", "Enchanting", "Engineering", "Herbalism", "Leatherworking", "Mining", "Skinning", "Tailoring"];
const SECONDARY = ["Cooking", "First Aid", "Fishing"];
const ROLES = ["Tank", "Healer", "DPS"];
const RANKS = ["Officer", "Member"];
const EVENT_TYPES = ["Dungeon", "Raid", "PvP", "Group", "Social", "Other"];
const SIGNUP_STATUS = ["pending", "approved", "declined"];
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const OLD_ROSTER_URL = "https://tgbwg-roster.netlify.app/api/roster";

// ---------- helpers ----------
class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = (status, message) => { throw new HttpError(status, message); };
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
const clean = (v, max) => String(v ?? "").replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, max);
const cleanText = (v, max) => String(v ?? "").replace(/\r/g, "").replace(/[\u0000-\u0008\u000b-\u001f]/g, "").trim().slice(0, max);
const int = (v, min, max) => { const n = parseInt(v, 10); return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : null; };
const same = (a, b) => String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
const newId = () => crypto.randomBytes(12).toString("hex");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const db = () => getStore({ name: "gbwg-site", consistency: "strong" });
const imageStore = () => getStore({ name: "gbwg-images", consistency: "strong" });

const DEFAULTS = { members: [], apps: [], news: [], events: [], pins: {} };
const fresh = (key) => structuredClone(DEFAULTS[key]);

async function read(store, key) {
  return (await store.get(key, { type: "json" })) ?? fresh(key);
}

// Read-modify-write with optimistic locking, so two people saving at once never overwrite each other.
async function mutate(store, key, fn) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const current = await store.getWithMetadata(key, { type: "json" });
    const data = current ? current.data : fresh(key);
    const result = await fn(data);
    const res = await store.setJSON(key, data, current ? { onlyIfMatch: current.etag } : { onlyIfNew: true });
    if (res.modified) return result;
    await sleep(30 + Math.random() * 150);
  }
  fail(409, "The site is busy right now. Please try again.");
}

// ---------- auth ----------
let cachedSecret;
async function secret(store) {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  if (cachedSecret) return cachedSecret;
  let s = await store.get("secret", { type: "text" });
  if (!s) {
    const candidate = crypto.randomBytes(32).toString("hex");
    const res = await store.set("secret", candidate, { onlyIfNew: true });
    s = res.modified ? candidate : await store.get("secret", { type: "text" });
  }
  return (cachedSecret = s);
}
const mac = async (store, body) => crypto.createHmac("sha256", await secret(store)).update(body).digest("base64url");
async function signToken(store, payload) {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + 30 * 864e5 })).toString("base64url");
  return `${body}.${await mac(store, body)}`;
}
async function readToken(store, token) {
  const [body, sig] = String(token || "").split(".");
  if (!body || !sig) return null;
  const expected = await mac(store, body);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString());
    return p.exp > Date.now() ? p : null;
  } catch { return null; }
}
const pinVersion = () => crypto.createHash("sha256").update(process.env.ADMIN_PIN || "").digest("hex").slice(0, 12);
function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString("hex");
  return { salt, hash: crypto.scryptSync(pw, salt, 32).toString("hex") };
}
function checkPassword(pw, rec) {
  if (!rec?.salt) return false;
  const h = crypto.scryptSync(String(pw), rec.salt, 32);
  return crypto.timingSafeEqual(h, Buffer.from(rec.hash, "hex"));
}
function validPassword(pw) {
  pw = String(pw ?? "");
  if (pw.length < 4) fail(400, "Password must be at least 4 characters.");
  if (pw.length > 64) fail(400, "Password is too long.");
  return pw;
}

async function whoAmI(req, store, members) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const p = await readToken(store, token);
  if (!p) return null;
  if (p.sub === "gm") {
    return process.env.ADMIN_PIN && p.pv === pinVersion()
      ? { id: "gm", name: "Guild Master", gm: true, officer: true }
      : null;
  }
  const m = members.find((x) => x.id === p.sub);
  if (!m || (m.pv || 0) !== p.pv) return null;
  return { id: m.id, name: m.name, cls: m.cls, rank: m.rank, gm: false, officer: m.rank === "Officer" };
}
const needOfficer = (me) => { if (!me?.officer) fail(403, "Officers only."); };
const needMember = (me) => {
  if (!me) fail(401, "Please log in first.");
  if (me.gm) fail(403, "Log in with your own character to do this.");
};

// ---------- validation ----------
function character(body) {
  const c = {
    name: clean(body.name, 24),
    player: clean(body.player, 32),
    race: clean(body.race, 30),
    cls: clean(body.cls, 20),
    spec: clean(body.spec, 24),
    role: clean(body.role, 10),
    prof1: clean(body.prof1, 20) || "None",
    prof2: clean(body.prof2, 20) || "None",
    secondary: [...new Set((Array.isArray(body.secondary) ? body.secondary : []).filter((p) => SECONDARY.includes(p)))],
    level: int(body.level, 1, 90),
  };
  if (!c.name) fail(400, "Character name is required.");
  if (!RACES.includes(c.race)) fail(400, "Pick an Alliance race.");
  if (!RACE_CLASSES[c.race].includes(c.cls)) fail(400, `${c.race} can't be a ${c.cls} in WoW Forever.`);
  if (!SPECS[c.cls].includes(c.spec)) c.spec = "";
  if (!ROLES.includes(c.role)) fail(400, "Pick a role.");
  if (!PROFS.includes(c.prof1) || !PROFS.includes(c.prof2)) fail(400, "Invalid profession.");
  if (c.prof1 !== "None" && c.prof1 === c.prof2) fail(400, "Pick two different professions.");
  return c;
}
function nameTaken(name, members, apps, exceptId) {
  return members.some((m) => m.id !== exceptId && same(m.name, name)) ||
    apps.some((a) => a.status === "pending" && a.id !== exceptId && same(a.name, name));
}
const publicMember = (m, officer) => {
  const { pw, pv, ...rest } = m;
  return officer ? { ...rest, needsPw: !pw } : rest;
};
const publicApp = ({ pw, ...rest }) => rest;

function eventFields(body) {
  const e = {
    title: clean(body.title, 80),
    type: EVENT_TYPES.includes(body.type) ? body.type : "Other",
    start: body.start && !Number.isNaN(Date.parse(body.start)) ? new Date(body.start).toISOString() : null,
    size: int(body.size, 0, 80) || 0,
    need: {
      Tank: int(body.need?.Tank, 0, 40) || 0,
      Healer: int(body.need?.Healer, 0, 40) || 0,
      DPS: int(body.need?.DPS, 0, 80) || 0,
    },
    desc: cleanText(body.desc, 2000),
  };
  if (!e.title) fail(400, "Give the event a title.");
  if (!e.start) fail(400, "Pick a date and time.");
  return e;
}
function newsFields(body) {
  const n = {
    title: clean(body.title, 120),
    body: cleanText(body.body, 8000),
    images: (Array.isArray(body.images) ? body.images : []).filter((id) => /^[a-f0-9]{24}$/.test(id)).slice(0, 8),
    pinned: !!body.pinned,
  };
  if (!n.title) fail(400, "Give the post a title.");
  return n;
}

// ---------- router ----------
export default async (req) => {
  try {
    return await route(req);
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    console.error(e);
    return json({ error: "Something went wrong on the server." }, 500);
  }
};
export const config = { path: "/api/*" };

async function route(req) {
  const url = new URL(req.url);
  const [a, b, c, d] = url.pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean);
  const M = req.method;
  const store = db();

  // Pictures are public and cacheable.
  if (a === "images" && b && M === "GET") {
    if (!/^[a-f0-9]{24}$/.test(b)) fail(404, "Not found");
    const r = await imageStore().getWithMetadata(b, { type: "arrayBuffer" });
    if (!r) fail(404, "Not found");
    return new Response(r.data, {
      headers: { "content-type": r.metadata?.type || "image/jpeg", "cache-control": "public, max-age=31536000, immutable" },
    });
  }

  const members = await read(store, "members");
  const me = await whoAmI(req, store, members);
  const body = M === "GET" || (a === "images" && M === "POST") ? {} : await req.json().catch(() => ({}));

  // ---- everything the site needs in one go ----
  if (a === "state" && M === "GET") {
    const [apps, news, events, pins] = await Promise.all(["apps", "news", "events", "pins"].map((k) => read(store, k)));
    const ids = new Set(members.map((m) => m.id));
    const livePins = Object.fromEntries(Object.entries(pins).filter(([id]) => ids.has(id)));
    const pending = apps.filter((x) => x.status === "pending");
    return json({
      me,
      members: members.map((m) => publicMember(m, me?.officer)),
      news,
      events,
      pins: livePins,
      apps: me?.officer ? pending.map(publicApp) : [],
    });
  }

  // ---- applications ----
  if (a === "apply" && M === "POST") {
    const ch = character(body);
    const pw = hashPassword(validPassword(body.password));
    const about = cleanText(body.about, 1000);
    await mutate(store, "apps", (apps) => {
      if (nameTaken(ch.name, members, apps)) fail(409, `${ch.name} is already in the guild or has an application waiting.`);
      for (let i = apps.length - 1; i >= 0; i--) if (same(apps[i].name, ch.name)) apps.splice(i, 1); // clear old declined ones
      apps.push({ id: newId(), ...ch, about, pw, status: "pending", created: Date.now() });
    });
    return json({ ok: true }, 201);
  }

  if (a === "apps" && b && c === "approve" && M === "POST") {
    needOfficer(me);
    const apps = await read(store, "apps");
    const app = apps.find((x) => x.id === b && x.status === "pending");
    if (!app) fail(404, "That application has already been dealt with.");
    const { id, about, pw, status, created, reason, ...ch } = app;
    await mutate(store, "members", (list) => {
      if (list.some((m) => m.id === id)) return;
      if (list.some((m) => same(m.name, ch.name))) fail(409, `${ch.name} is already on the roster.`);
      list.push({ id, ...ch, rank: body.rank === "Officer" ? "Officer" : "Member", joined: Date.now(), pw, pv: 1 });
    });
    await mutate(store, "apps", (list) => { const i = list.findIndex((x) => x.id === id); if (i >= 0) list.splice(i, 1); });
    return json({ ok: true });
  }

  if (a === "apps" && b && c === "decline" && M === "POST") {
    needOfficer(me);
    await mutate(store, "apps", (list) => {
      const app = list.find((x) => x.id === b && x.status === "pending");
      if (!app) fail(404, "That application has already been dealt with.");
      app.status = "declined";
      app.reason = clean(body.reason, 300);
      app.decided = Date.now();
    });
    return json({ ok: true });
  }

  // ---- logging in ----
  if (a === "login" && !b && M === "POST") {
    const name = clean(body.name, 24);
    const password = String(body.password ?? "");
    const m = members.find((x) => same(x.name, name));
    if (m) {
      if (!m.pw) fail(403, "No password has been set for this character yet. Ask an officer to set one for you.");
      if (!checkPassword(password, m.pw)) { await sleep(400); fail(401, "Wrong character name or password."); }
      return json({ token: await signToken(store, { sub: m.id, pv: m.pv || 0 }) });
    }
    const apps = await read(store, "apps");
    const app = apps.find((x) => same(x.name, name));
    if (app && checkPassword(password, app.pw)) {
      if (app.status === "pending") fail(403, "Your application is still waiting for an officer to approve it. Hang tight!");
      fail(403, `Sorry, your application wasn't accepted this time.${app.reason ? ` Reason: ${app.reason}` : ""}`);
    }
    await sleep(400);
    fail(401, "Wrong character name or password.");
  }

  if (a === "login" && b === "gm" && M === "POST") {
    const real = process.env.ADMIN_PIN;
    if (!real) fail(400, "No Guild Master PIN is set up yet. Add ADMIN_PIN in Netlify's environment variables.");
    const given = String(body.pin ?? "");
    const ok = given.length === real.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(real));
    if (!ok) { await sleep(600); fail(401, "Wrong PIN."); }
    return json({ token: await signToken(store, { sub: "gm", pv: pinVersion() }) });
  }

  // ---- members ----
  if (a === "members" && b && M === "PUT") {
    if (!me) fail(401, "Please log in first.");
    const isSelf = me.id === b;
    if (!isSelf && !me.officer) fail(403, "You can only edit your own details.");
    const editingDetails = body.name !== undefined;
    const ch = editingDetails ? character(body) : null;
    const newPw = body.password ? hashPassword(validPassword(body.password)) : null;
    const apps = editingDetails ? await read(store, "apps") : [];
    const updated = await mutate(store, "members", (list) => {
      const m = list.find((x) => x.id === b);
      if (!m) fail(404, "Member not found.");
      if (ch) {
        if (nameTaken(ch.name, list, apps, m.id)) fail(409, `${ch.name} is already taken.`);
        Object.assign(m, ch, { updated: Date.now() });
      }
      if (me.officer && RANKS.includes(body.rank)) m.rank = body.rank;
      if (newPw) { m.pw = newPw; m.pv = (m.pv || 0) + 1; }
      return { ...m };
    });
    const out = { member: publicMember(updated, me.officer) };
    if (newPw && isSelf) out.token = await signToken(store, { sub: updated.id, pv: updated.pv });
    return json(out);
  }

  if (a === "members" && b && M === "DELETE") {
    needOfficer(me);
    await mutate(store, "members", (list) => { const i = list.findIndex((x) => x.id === b); if (i >= 0) list.splice(i, 1); });
    await mutate(store, "pins", (pins) => { delete pins[b]; });
    await mutate(store, "events", (events) => { for (const e of events) e.signups = e.signups.filter((s) => s.memberId !== b); });
    return json({ ok: true });
  }

  // ---- news & pictures ----
  if (a === "images" && !b && M === "POST") {
    needOfficer(me);
    const type = (req.headers.get("content-type") || "").split(";")[0];
    if (!IMAGE_TYPES.includes(type)) fail(400, "Only JPG, PNG, GIF or WebP pictures please.");
    const data = await req.arrayBuffer();
    if (!data.byteLength) fail(400, "That picture was empty.");
    if (data.byteLength > 5.5 * 1024 * 1024) fail(413, "That picture is too big (max about 5MB).");
    const id = newId();
    await imageStore().set(id, data, { metadata: { type } });
    return json({ id }, 201);
  }

  if (a === "news" && !b && M === "POST") {
    needOfficer(me);
    const n = newsFields(body);
    const post = { id: newId(), ...n, author: me.name, authorId: me.id, created: Date.now() };
    await mutate(store, "news", (list) => { list.push(post); });
    return json({ post }, 201);
  }

  if (a === "news" && b && M === "PUT") {
    needOfficer(me);
    const n = newsFields(body);
    const removed = await mutate(store, "news", (list) => {
      const p = list.find((x) => x.id === b);
      if (!p) fail(404, "Post not found.");
      const gone = p.images.filter((id) => !n.images.includes(id));
      Object.assign(p, n, { updated: Date.now() });
      return gone;
    });
    await Promise.all(removed.map((id) => imageStore().delete(id).catch(() => {})));
    return json({ ok: true });
  }

  if (a === "news" && b && M === "DELETE") {
    needOfficer(me);
    const removed = await mutate(store, "news", (list) => {
      const i = list.findIndex((x) => x.id === b);
      return i >= 0 ? list.splice(i, 1)[0].images : [];
    });
    await Promise.all(removed.map((id) => imageStore().delete(id).catch(() => {})));
    return json({ ok: true });
  }

  // ---- events & sign-ups ----
  if (a === "events" && !b && M === "POST") {
    needOfficer(me);
    const e = { id: newId(), ...eventFields(body), signups: [], createdBy: me.name, created: Date.now() };
    await mutate(store, "events", (list) => { list.push(e); });
    return json({ event: e }, 201);
  }

  if (a === "events" && b && !c && M === "PUT") {
    needOfficer(me);
    const fields = eventFields(body);
    await mutate(store, "events", (list) => {
      const e = list.find((x) => x.id === b);
      if (!e) fail(404, "Event not found.");
      Object.assign(e, fields, { updated: Date.now() });
    });
    return json({ ok: true });
  }

  if (a === "events" && b && !c && M === "DELETE") {
    needOfficer(me);
    await mutate(store, "events", (list) => { const i = list.findIndex((x) => x.id === b); if (i >= 0) list.splice(i, 1); });
    return json({ ok: true });
  }

  if (a === "events" && b && c === "signup" && M === "POST") {
    needMember(me);
    const role = ROLES.includes(body.role) ? body.role : fail(400, "Pick a role.");
    const note = clean(body.note, 140);
    await mutate(store, "events", (list) => {
      const e = list.find((x) => x.id === b);
      if (!e) fail(404, "Event not found.");
      if (Date.parse(e.start) < Date.now() - 3 * 3600e3) fail(400, "This event has already happened.");
      const mine = e.signups.find((s) => s.memberId === me.id);
      if (mine) {
        if (mine.role !== role && mine.status === "approved") mine.status = "pending";
        Object.assign(mine, { role, note });
      } else {
        e.signups.push({ memberId: me.id, role, note, status: "pending", at: Date.now() });
      }
    });
    return json({ ok: true });
  }

  if (a === "events" && b && c === "signup" && M === "DELETE") {
    needMember(me);
    await mutate(store, "events", (list) => {
      const e = list.find((x) => x.id === b);
      if (e) e.signups = e.signups.filter((s) => s.memberId !== me.id);
    });
    return json({ ok: true });
  }

  if (a === "events" && b && c === "signups" && d && (M === "POST" || M === "DELETE")) {
    needOfficer(me);
    if (M === "POST" && !SIGNUP_STATUS.includes(body.status)) fail(400, "Unknown status.");
    await mutate(store, "events", (list) => {
      const e = list.find((x) => x.id === b);
      if (!e) fail(404, "Event not found.");
      if (M === "DELETE") e.signups = e.signups.filter((s) => s.memberId !== d);
      else {
        const s = e.signups.find((x) => x.memberId === d);
        if (!s) fail(404, "Sign-up not found.");
        s.status = body.status;
      }
    });
    return json({ ok: true });
  }

  // ---- map pins ----
  if (a === "pins" && b === "me" && M === "PUT") {
    needMember(me);
    const x = Number(body.x), y = Number(body.y);
    if (!(x >= 0 && x <= 100 && y >= 0 && y <= 100)) fail(400, "That spot is off the map.");
    await mutate(store, "pins", (pins) => { pins[me.id] = { x: +x.toFixed(2), y: +y.toFixed(2), at: Date.now() }; });
    return json({ ok: true });
  }

  if (a === "pins" && b && M === "DELETE") {
    if (!me) fail(401, "Please log in first.");
    const target = b === "me" ? me.id : b;
    if (target !== me.id && !me.officer) fail(403, "You can only remove your own pin.");
    await mutate(store, "pins", (pins) => { delete pins[target]; });
    return json({ ok: true });
  }

  // ---- bring characters over from the old roster tracker ----
  if (a === "import" && M === "POST") {
    needOfficer(me);
    const found = [];
    try {
      const r = await fetch(OLD_ROSTER_URL, { signal: AbortSignal.timeout(8000) });
      if (r.ok) found.push(...(await r.json()));
    } catch {}
    try {
      const old = getStore({ name: "gbwg-roster", consistency: "strong" });
      const { blobs } = await old.list();
      found.push(...(await Promise.all(blobs.map((x) => old.get(x.key, { type: "json" })))).filter(Boolean));
    } catch {}
    if (!found.length) fail(404, "Couldn't reach the old roster. Is tgbwg-roster.netlify.app still online?");
    const result = await mutate(store, "members", (list) => {
      let added = 0, skipped = 0;
      for (const o of found) {
        const name = clean(o.name, 24);
        if (!name || list.some((m) => same(m.name, name))) { skipped++; continue; }
        list.push({
          id: newId(), name, player: clean(o.player, 32), race: clean(o.race, 30), cls: clean(o.cls, 20),
          spec: clean(o.spec, 24), role: ROLES.includes(o.role) ? o.role : "DPS",
          prof1: clean(o.prof1, 20) || "None", prof2: clean(o.prof2, 20) || "None",
          secondary: Array.isArray(o.secondary) ? o.secondary.filter((p) => SECONDARY.includes(p)) : [],
          level: int(o.level, 1, 90), rank: "Member", joined: o.joined || Date.now(), pw: null, pv: 0, imported: true,
        });
        added++;
      }
      return { added, skipped };
    });
    return json(result);
  }

  fail(404, "Unknown request.");
}
