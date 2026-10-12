"use strict";
/* Серверийг тусдаа процесс болгон (AI-гүй, туршилтын төлбөртэй, түр хавтастай) асааж API-г шалгана. */
const test = require("node:test");
const assert = require("node:assert");
const {spawn} = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const PORT = 3900 + Math.floor(Math.random() * 90);
const BASE = "http://localhost:" + PORT;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), "mz-test-"));
let srv;

test.before(async () => {
  srv = spawn(process.execPath, [path.join(__dirname, "..", "server", "index.js")], {
    env: Object.assign({}, process.env, {PORT: String(PORT), DATA_DIR: DATA, AI_PROVIDERS: "none", QPAY_TEST_MODE: "true",
      QPAY_USERNAME: "", ADMIN_TOKEN: "secret-test", PLAN_LIMIT_PER_HOUR: "100"}),
    stdio: "ignore"
  });
  for (let i = 0; i < 50; i++) {
    try { await fetch(BASE + "/api/health"); return; } catch (e) { await new Promise(r => setTimeout(r, 100)); }
  }
  throw new Error("сервер асахгүй байна");
});
test.after(() => { srv.kill(); fs.rmSync(DATA, {recursive: true, force: true}); });

const post = (p, body) => fetch(BASE + p, {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(body)});
const answers = {product: "Гар саван", cat: "beauty", price: 18000, cost: 8000, ages: ["25-34"], gender: "female", locations: ["ub"], budget: 500000};

test("төлөөгүй үед зөвхөн Даваа гараг ирж, төлсний дараа бүгд нээгдэнэ", async () => {
  const v = await (await post("/api/plan", {answers})).json();
  assert.strictEqual(v.paid, false);
  assert.strictEqual(v.plan.days.length, 1);
  assert.strictEqual(v.plan.days[0].day, "Даваа");
  assert.ok(!v.plan.hooks && !v.plan.weeks && !v.plan.rows, "төлбөртэй хэсэг ирэх ёсгүй");
  assert.strictEqual(v.answers.product, "Гар саван", "маягтыг сэргээх хариулт хадгалагдана");
  assert.ok(!("source" in v), "ямар аргаар гарсныг хэрэглэгчид илгээхгүй");
  const health = await (await fetch(BASE + "/api/health")).json();
  assert.ok(!("ai" in health), "health-ээр AI үйлчилгээний жагсаалт ил гарахгүй");

  const inv = await (await post("/api/qpay/invoice", {key: v.key})).json();
  assert.deepStrictEqual(inv, {test: true});
  const paid = await (await post("/api/qpay/test-pay", {key: v.key})).json();
  assert.strictEqual(paid.paid, true);
  assert.strictEqual(paid.plan.days.length, 7);
  assert.ok(paid.plan.hooks.length >= 10);

  const again = await (await fetch(BASE + "/api/plan/" + v.key)).json();
  assert.strictEqual(again.paid, true, "төлбөрийн төлөв файлд хадгалагдсан");
});

test("буруу хүсэлтүүд серверийг унагаахгүй", async () => {
  assert.strictEqual((await fetch(BASE + "/%E0%A4%A")).status, 400);
  assert.strictEqual((await fetch(BASE + "/..%2Fserver%2Fqpay.js")).status, 403);
  assert.strictEqual((await post("/api/plan", null)).status, 400);
  assert.strictEqual((await post("/api/qpay/check", {key: "../../etc/passwd"})).status, 404);
  assert.strictEqual((await fetch(BASE + "/api/health")).status, 200);
});

test("админ статистик нууц үгтэй л харагдана", async () => {
  assert.strictEqual((await fetch(BASE + "/api/admin/stats")).status, 401);
  const r = await fetch(BASE + "/api/admin/stats", {headers: {Authorization: "Bearer secret-test"}});
  assert.strictEqual(r.status, 200);
  const s = await r.json();
  assert.ok(s.plans >= 1);
  assert.strictEqual(s.revenue, 0, "туршилтын төлбөр орлогод орохгүй");
  assert.strictEqual(s.daily.length, 14);
});
