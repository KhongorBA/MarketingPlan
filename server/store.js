"use strict";
/* Төлөвлөгөө бүрийг data/plans/<key>.json тусдаа файлд хадгална. Бичих бүр шууд,
 * атомаар (tmp → rename) хийгдэх тул сервер унасан ч төлбөрийн мэдээлэл алдагдахгүй,
 * олон мянган төлөвлөгөөтэй үед ч нэг жижиг файл л бичнэ. Нэмэлт сан шаардлагагүй. */
const fs = require("fs");
const path = require("path");

const ROOT = process.env.DATA_DIR || path.join(__dirname, "..", "data");
const DIR = path.join(ROOT, "plans");
const MAX_AGE_MS = 90 * 24 * 3600 * 1000;
const KEY = /^[a-f0-9]{32}$/;

fs.mkdirSync(DIR, {recursive: true});
const file = key => path.join(DIR, key + ".json");

function write(key, rec) {
  const f = file(key);
  fs.writeFileSync(f + ".tmp", JSON.stringify(rec));
  fs.renameSync(f + ".tmp", f);
  return rec;
}

function get(key) {
  if (!KEY.test(String(key))) return null;   /* хэрэглэгчийн өгсөн утгаар файлын зам үүсгэхээс өмнө шалгана */
  try { return JSON.parse(fs.readFileSync(file(key), "utf8")); } catch (e) { return null; }
}

function put(key, rec) { return KEY.test(key) ? write(key, rec) : null; }

/* Шинэчилсэн бичлэгийг буцаана. Өмнө нь get()-ээр авсан объект хуучирсан байхыг анхаар. */
function update(key, patch) {
  const rec = get(key);
  return rec ? write(key, Object.assign(rec, patch)) : null;
}

/* Админы статистикт: бичлэг бүрээс fields(rec)-ийн буцаасан жижиг объектыг цуглуулна. */
function all(fields) {
  return fs.readdirSync(DIR).filter(n => n.endsWith(".json")).map(n => {
    try { return fields(JSON.parse(fs.readFileSync(path.join(DIR, n), "utf8"))); } catch (e) { return null; }
  }).filter(Boolean);
}

function cleanup() {
  const cutoff = Date.now() - MAX_AGE_MS;
  for (const n of fs.readdirSync(DIR)) {
    const f = path.join(DIR, n);
    try { if (fs.statSync(f).mtimeMs < cutoff) fs.unlinkSync(f); } catch (e) { /* зэрэг устгагдсан */ }
  }
}

/* Өмнөх хувилбарын нэг том plans.json-оос шилжүүлнэ. */
(function migrate() {
  const old = path.join(ROOT, "plans.json");
  if (!fs.existsSync(old)) return;
  try {
    const plans = JSON.parse(fs.readFileSync(old, "utf8"));
    for (const k of Object.keys(plans)) if (KEY.test(k) && !fs.existsSync(file(k))) {
      const r = plans[k];
      if (r.invoiceId && !r.invoiceIds) r.invoiceIds = [r.invoiceId];
      write(k, r);
    }
    fs.renameSync(old, old + ".migrated");
  } catch (e) { console.warn("[store] plans.json шилжүүлж чадсангүй:", e.message); }
})();

cleanup();
setInterval(cleanup, 24 * 3600e3).unref();

module.exports = {get, put, update, all};
