"use strict";
/* Маркетинг Зөвлөх — backend. Нэмэлт сан шаардлагагүй (Node 20+).
 *   node server/index.js   →   http://localhost:3000 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

try { process.loadEnvFile(path.join(__dirname, "..", ".env")); } catch (e) { /* .env байхгүй бол орчны хувьсагчийг ашиглана */ }

const engine = require("./engine/build");
const {enhance} = require("./ai/enhance");
const {enabledProviders} = require("./ai/providers");
const qpay = require("./qpay");
const store = require("./store");

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, "..", "public");
const PRICE = Number(process.env.PLAN_PRICE) || 6900;
const TEST_MODE = process.env.QPAY_TEST_MODE === "true";
const PUBLIC_URL = (process.env.PUBLIC_URL || "http://localhost:" + PORT).replace(/\/$/, "");
const PLAN_LIMIT_PER_HOUR = Number(process.env.PLAN_LIMIT_PER_HOUR) || 20;

const TRUST_PROXY = process.env.TRUST_PROXY === "true";
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";

/* 3–8-р хэсэг: зөвхөн төлбөр баталгаажсан үед браузер руу илгээнэ. Төлөөгүй үед
 * чанарыг нь харуулахын тулд 7 хоногийн контентын эхний өдрийг л үнэгүй үзүүлнэ. */
const PREMIUM = ["days", "hooks", "split", "rows", "be", "weeks", "metrics", "cautions"];

function view(rec) {
  const p = rec.plan, out = {};
  for (const k of Object.keys(p)) if (rec.paid || !PREMIUM.includes(k)) out[k] = p[k];
  if (!rec.paid) out.days = p.days.slice(0, 1);
  /* Ямар аргаар (AI эсвэл загвар) гарсныг хэрэглэгчид илгээхгүй: зөвхөн админы статистикт харагдана. */
  return {key: rec.key, paid: rec.paid, price: PRICE, answers: rec.answers || null, plan: out};
}

/* Хэрэглэгчийн хариултыг (маягтыг дахин бөглөхөд) зөвхөн мэдэгдэж буй талбараар хадгална. */
const ANSWER_KEYS = ["product", "cat", "price", "cost", "ages", "gender", "locations", "interests", "stage", "reasons",
  "pf", "channels", "goals", "budget", "capacity", "usp", "uspOther"];
function pickAnswers(a) {
  const out = {};
  for (const k of ANSWER_KEYS) if (a && a[k] != null) out[k] = Array.isArray(a[k]) ? a[k].slice(0, 10).map(String) : typeof a[k] === "number" ? a[k] : String(a[k]).slice(0, 200);
  return out;
}

/* nginx/Cloudflare-ийн ард бол жинхэнэ IP нь X-Forwarded-For-ийн эхний утга. Шууд ажиллахад
 * энэ толгойд итгэхгүй: хэн ч бичиж хязгаарлагчийг тойрч чадна. */
function clientIp(req) {
  const xff = TRUST_PROXY && req.headers["x-forwarded-for"];
  return xff ? String(xff).split(",")[0].trim() : req.socket.remoteAddress;
}

/* ---------- AI-ийн үнэгүй квотыг хамгаалах энгийн хязгаарлагч ---------- */
const hits = new Map();
/* Хуучирсан IP-г цэвэрлэнэ, эс бөгөөс Map хязгааргүй өснө. */
setInterval(() => { const now = Date.now(); for (const [ip, arr] of hits) if (!arr.some(t => now - t < 3600e3)) hits.delete(ip); }, 600e3).unref();
function limited(req) {
  const ip = clientIp(req), now = Date.now(), arr = (hits.get(ip) || []).filter(t => now - t < 3600e3);
  arr.push(now); hits.set(ip, arr);
  return arr.length > PLAN_LIMIT_PER_HOUR;
}
const LIMIT_MSG = {error: "Цагт үүсгэх хязгаарт хүрлээ. Түр хүлээгээд дахин оролдоно уу."};

async function generate(d) {
  const plan = engine.build(d);
  let source = {type: "template"};
  if (enabledProviders().length) {
    try {
      const r = await enhance(plan);
      source = {type: "ai", provider: r.provider, model: r.model, ms: r.ms};
    } catch (e) {
      console.warn("[plan] AI ашиглаж чадсангүй, загвараар гаргав:", e.message);
      source = {type: "template", aiError: String(e.message).slice(0, 300)};
    }
  }
  return {plan, source};
}

/* ---------- admin ---------- */
function isAdmin(req) {
  if (!ADMIN_TOKEN) return false;
  const got = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const h = s => crypto.createHash("sha256").update(s).digest();
  return crypto.timingSafeEqual(h(got), h(ADMIN_TOKEN));
}

function stats() {
  const rows = store.all(r => ({
    createdAt: r.createdAt, paid: !!r.paid, paidAt: r.paidAt, amount: r.paidAmount || 0, test: !!r.testPaid,
    cat: r.plan && r.plan.cat && r.plan.cat.label, source: r.source || {}
  }));
  const now = Date.now(), day = 24 * 3600e3;
  const count = (arr, f) => arr.reduce((m, x) => { const k = f(x); m[k] = (m[k] || 0) + 1; return m; }, {});
  const realPaid = rows.filter(r => r.paid && !r.test);
  const ai = rows.filter(r => r.source.type === "ai");
  const daily = [];
  for (let i = 13; i >= 0; i--) {
    const d0 = new Date(now - i * day); d0.setHours(0, 0, 0, 0);
    const a = d0.getTime(), b = a + day;
    /* toISOString() нь UTC тул Монголын цагаар (UTC+8) нэг өдрөөр хоцорно: орон нутгийн огноог ашиглана. */
    const date = d0.getFullYear() + "-" + String(d0.getMonth() + 1).padStart(2, "0") + "-" + String(d0.getDate()).padStart(2, "0");
    daily.push({date, plans: rows.filter(r => r.createdAt >= a && r.createdAt < b).length,
      paid: realPaid.filter(r => r.paidAt >= a && r.paidAt < b).length});
  }
  return {
    plans: rows.length, last7: rows.filter(r => r.createdAt > now - 7 * day).length,
    paid: realPaid.length, testPaid: rows.filter(r => r.paid && r.test).length,
    revenue: realPaid.reduce((s, r) => s + r.amount, 0),
    conversion: rows.length ? realPaid.length / rows.length : 0,
    ai: {ok: ai.length, failed: rows.filter(r => r.source.aiError).length,
      byModel: count(ai, r => r.source.provider + "/" + r.source.model),
      avgMs: ai.length ? Math.round(ai.reduce((s, r) => s + (r.source.ms || 0), 0) / ai.length) : 0,
      lastErrors: rows.filter(r => r.source.aiError).sort((a, b) => b.createdAt - a.createdAt).slice(0, 5)
        .map(r => ({at: new Date(r.createdAt).toISOString(), error: r.source.aiError}))},
    byCategory: count(rows, r => r.cat || "—"),
    daily
  };
}

/* ---------- routes ---------- */
const routes = {
  "GET /api/health": async () => [200, {ok: true, qpay: qpay.configured(), testMode: TEST_MODE && !qpay.configured(), price: PRICE}],

  "POST /api/plan": async (req, body) => {
    if (limited(req)) return [429, LIMIT_MSG];
    const d = engine.normalize(body.answers);
    const err = engine.validate(d);
    if (err) return [400, {error: err}];
    const {plan, source} = await generate(d);
    const key = crypto.randomBytes(16).toString("hex");
    return [200, view(store.put(key, {key, plan, source, answers: pickAnswers(body.answers), paid: false, createdAt: Date.now()}))];
  },

  "GET /api/plan/:key": async (req, body, key) => {
    const rec = store.get(key);
    return rec ? [200, view(rec)] : [404, {error: "Төлөвлөгөө олдсонгүй"}];
  },

  /* Ижил мэдээллээр шинэ хувилбар (AI-тай үед текст нь өөр гарна). Төлбөрийн төлөв хадгалагдана. */
  "POST /api/plan/:key/regenerate": async (req, body, key) => {
    const rec = store.get(key);
    if (!rec) return [404, {error: "Төлөвлөгөө олдсонгүй"}];
    if (limited(req)) return [429, LIMIT_MSG];
    const {plan, source} = await generate(rec.plan.d);
    plan.id = rec.plan.id;
    return [200, view(store.update(key, {plan, source}))];
  },

  "POST /api/qpay/invoice": async (req, body) => {
    const rec = store.get(body.key);
    if (!rec) return [404, {error: "Төлөвлөгөө олдсонгүй"}];
    if (rec.paid) return [200, {paid: true}];
    if (!qpay.configured()) return TEST_MODE ? [200, {test: true}] : [503, {error: "QPay тохируулаагүй байна"}];
    /* Өмнө үүсгэсэн нэхэмжлэлээр аль хэдийн төлсөн бол шинийг үүсгэхгүй. */
    if ((await checkPaid(rec.key))[1].paid) return [200, {paid: true}];
    const inv = await qpay.createInvoice({
      planKey: rec.key, amount: PRICE,
      description: "Маркетингийн төлөвлөгөө " + rec.plan.id,
      callbackUrl: PUBLIC_URL + "/api/qpay/callback?key=" + rec.key
    });
    /* Хуучин нэхэмжлэлүүдийг хадгална: хэрэглэгч өмнөх QR-аар төлсөн ч баталгаажна. */
    store.update(rec.key, {invoiceIds: (rec.invoiceIds || []).concat(inv.invoice_id).slice(-5)});
    return [200, {invoice_id: inv.invoice_id, qr_image: inv.qr_image, urls: inv.urls || []}];
  },

  "POST /api/qpay/check": async (req, body) => checkPaid(body.key),
  /* QPay төлбөр орсны дараа энэ хаягийг дуудна. Callback-д итгэхгүй, QPay-ээс дахин шалгана. */
  "GET /api/qpay/callback": async (req, body, _, q) => checkPaid(q.get("key")),
  "POST /api/qpay/callback": async (req, body, _, q) => checkPaid(q.get("key")),

  "POST /api/qpay/test-pay": async (req, body) => {
    /* QPay тохируулсан үед туршилтын горим ажиллахгүй: үнэгүй нээх цоорхой үлдээхгүй. */
    if (!TEST_MODE || qpay.configured()) return [403, {error: "Туршилтын горим идэвхгүй"}];
    const rec = store.get(body.key);
    if (!rec) return [404, {error: "Төлөвлөгөө олдсонгүй"}];
    return [200, view(store.update(rec.key, {paid: true, paidAt: Date.now(), testPaid: true}))];
  },

  "GET /api/admin/stats": async req => isAdmin(req) ? [200, stats()] : [401, {error: "Нэвтрэх эрхгүй"}]
};

async function checkPaid(key) {
  const rec = store.get(key);
  if (!rec) return [404, {error: "Төлөвлөгөө олдсонгүй"}];
  if (!rec.paid && rec.invoiceIds && qpay.configured()) {
    for (const id of rec.invoiceIds) {
      if (await qpay.isPaid(id, PRICE)) {
        store.update(rec.key, {paid: true, paidAt: Date.now(), paidAmount: PRICE});
        return [200, {paid: true}];
      }
    }
  }
  return [200, {paid: !!rec.paid}];
}

function match(method, pathname) {
  for (const k of Object.keys(routes)) {
    const [m, pat] = k.split(" ");
    if (m !== method) continue;
    const re = new RegExp("^" + pat.replace(/:key/, "([a-f0-9]{32})") + "$");
    const r = pathname.match(re);
    if (r) return {fn: routes[k], param: r[1]};
  }
  return null;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0, chunks = [];
    req.on("data", c => { size += c.length; if (size > 64 * 1024) { reject(new Error("too large")); req.destroy(); } else chunks.push(c); });
    req.on("end", () => {
      const s = Buffer.concat(chunks).toString("utf8");
      let j = {};
      try { j = s ? JSON.parse(s) : {}; } catch (e) { /* буруу JSON → хоосон объект */ }
      resolve(j && typeof j === "object" && !Array.isArray(j) ? j : {});
    });
    req.on("error", reject);
  });
}

const TYPES = {".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon"};

function serveStatic(pathname, res) {
  let rel;
  try { rel = pathname === "/" ? "index.html" : decodeURIComponent(pathname); }
  catch (e) { res.writeHead(400); return res.end(); }   /* буруу %-кодчилол серверийг унагаахгүй */
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, {"Content-Type": "text/plain; charset=utf-8"}); return res.end("Олдсонгүй"); }
    res.writeHead(200, {"Content-Type": TYPES[path.extname(file)] || "application/octet-stream"});
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (!url.pathname.startsWith("/api/")) return serveStatic(url.pathname, res);
  const send = (code, obj) => { res.writeHead(code, {"Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store"}); res.end(JSON.stringify(obj)); };
  const r = match(req.method, url.pathname);
  if (!r) return send(404, {error: "Not found"});
  try {
    const body = req.method === "POST" ? await readBody(req) : {};
    const [code, obj] = await r.fn(req, body, r.param, url.searchParams);
    send(code, obj);
  } catch (e) {
    console.error("[api]", req.method, url.pathname, e.message);
    send(500, {error: "Серверийн алдаа. Дахин оролдоно уу."});
  }
});

server.listen(PORT, () => {
  const ai = enabledProviders();
  console.log("Маркетинг Зөвлөх: " + PUBLIC_URL);
  console.log("  AI: " + (ai.length ? ai.join(" → ") + " → загвар" : "тохируулаагүй (загвараар гаргана)"));
  console.log("  QPay: " + (qpay.configured() ? "холбогдсон" : TEST_MODE ? "туршилтын горим" : "тохируулаагүй"));
  console.log("  Админ: " + (ADMIN_TOKEN ? PUBLIC_URL + "/admin.html" : "ADMIN_TOKEN тохируулаагүй"));
});

["SIGINT", "SIGTERM"].forEach(s => process.on(s, () => server.close(() => process.exit(0))));
