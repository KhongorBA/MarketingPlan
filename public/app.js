(function () {
"use strict";

/* ---------- helpers ---------- */
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmt = n => Math.round(n).toLocaleString("en-US") + "₮";
const store = {
  get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} }
};

async function api(method, path, body) {
  let res;
  try {
    res = await fetch(path, {
      method, headers: body ? {"Content-Type": "application/json"} : {},
      body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(120000)
    });
  } catch (e) { throw new Error("Сервертэй холбогдож чадсангүй. Интернэтээ шалгаад дахин оролдоно уу."); }
  const j = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(j.error || "Сервер алдаа: " + res.status); e.status = res.status; throw e; }
  return j;
}

/* ---------- form (question by question) ---------- */
const rv = n => { const e = $('input[name="' + n + '"]:checked'); return e ? e.value : ""; };
const cv = n => $$('input[name="' + n + '"]:checked').map(x => x.value);
const setR = (n, v) => { const e = $('input[name="' + n + '"][value="' + v + '"]'); if (e) e.checked = true; };
const setC = (n, vals) => $$('input[name="' + n + '"]').forEach(x => { x.checked = vals.includes(x.value); });
/* Сонгосон сонголтын харагдах нэрийг DOM-оос авна (давхардсан жагсаалт хадгалахгүйн тулд). */
const labelOf = inp => { const b = inp.closest("label").querySelector("b") || inp.nextElementSibling; return b ? b.textContent : inp.value; };
const labels = n => $$('input[name="' + n + '"]:checked').map(labelOf);

function readForm() {
  return {
    product: $("#product").value.trim(), cat: rv("cat"),
    price: parseFloat($("#price").value) || 0, cost: parseFloat($("#cost").value) || 0,
    ages: cv("ages"), gender: rv("gender"), locations: cv("locations"), interests: $("#interests").value.trim(),
    stage: rv("stage") || "some", reasons: cv("reasons"), pf: cv("pf"), channels: cv("channels"), goals: cv("goals"),
    budget: parseFloat($("#budget").value) || 0, capacity: rv("capacity") || "small",
    usp: rv("usp"), uspOther: $("#uspOther").value.trim()
  };
}

function marginOf(d) { return d.price && d.cost && d.cost < d.price ? Math.round((d.price - d.cost) / d.price * 100) : null; }

let step = 0, autoT = null;
const slides = $$(".q");
const LAST = slides.length - 1;     /* summary slide */
const TOTALQ = LAST;
slides.forEach((el, i) => { if (i < LAST) el.querySelector(".qn").textContent = "Асуулт " + (i + 1); });

function showErr(t) { const e = $("#err"); e.textContent = t; e.hidden = !t; }
function validateSlide(i) {
  const key = slides[i] && slides[i].dataset.key, d = readForm();
  if (key === "product" && !d.product) return "Бүтээгдэхүүний нэрээ бичнэ үү.";
  if (key === "cat" && !d.cat) return "Ангилалаа сонгоно уу.";
  if (key === "cost" && d.cost && d.price && d.cost >= d.price) return "Өртөг нь зарах үнээс бага байх ёстой. Шалгаад дахин оруулна уу.";
  return null;
}
function isEmpty(opt) {
  const d = readForm();
  switch (opt) {
    case "price": return !d.price;
    case "cost": return !d.cost;
    case "ages": return !d.ages.length;
    case "gender": return !d.gender;
    case "locations": return !d.locations.length;
    case "interests": return !d.interests;
    case "reasons": return !d.reasons.length;
    case "usp": return !d.usp || (d.usp === "other" && !d.uspOther);
  }
  return false;
}
function updateNextLabel() {
  const el = slides[step]; if (!el) return;
  $("#nextBtn").textContent = el.dataset.opt && isEmpty(el.dataset.opt) ? "Алгасах" : "Дараах";
  const d = readForm(), m = marginOf(d);
  $("#marginHint").textContent = m != null ? "Ашгийн хувь: " + m + "% (нэг ширхэгээс " + fmt(d.price - d.cost) + ")" : "";
}
function fillSummary() {
  const d = readForm(), m = marginOf(d);
  const val = {
    product: d.product, cat: labels("cat").join(""),
    price: d.price ? fmt(d.price) : "",
    cost: d.cost ? fmt(d.cost) + (m != null ? " (ашиг " + m + "%)" : "") : "",
    ages: labels("ages").join(", "), gender: labels("gender").join(""), locations: labels("locations").join(", "),
    interests: d.interests, stage: labels("stage").join(""), reasons: labels("reasons").join(", "),
    pf: labels("pf").join(", "), channels: labels("channels").join(", "), goals: labels("goals").join(", "),
    budget: d.budget ? fmt(d.budget) : "Төсөвгүй", capacity: labels("capacity").join(""),
    usp: d.usp === "other" ? d.uspOther : labels("usp").join("")
  };
  $("#sum").innerHTML = slides.slice(0, LAST).map((el, i) =>
    '<div><dt>' + esc(el.dataset.label) + '</dt><dd>' + esc(val[el.dataset.key] || "оруулаагүй") + '</dd><button type="button" class="linkbtn" data-go="' + i + '">Засах</button></div>').join("");
}
function go(n) {
  clearTimeout(autoT);
  n = Math.max(0, Math.min(LAST, n)); step = n;
  slides.forEach((el, i) => { el.classList.toggle("on", i === n); el.classList.toggle("past", i < n); });
  $("#progFill").style.width = Math.round(Math.min(n, TOTALQ) / TOTALQ * 100) + "%";
  $("#qcount").textContent = n === LAST ? "Шалгах" : "Асуулт " + (n + 1) + " / " + TOTALQ;
  $("#prevBtn").hidden = n === 0; $("#nextBtn").hidden = n === LAST; $("#submitBtn").hidden = n !== LAST;
  showErr(""); updateNextLabel();
  if (n === LAST) fillSummary();
  const f = slides[n].querySelector("input[type=text],input[type=number]");
  if (f && !(window.matchMedia && matchMedia("(pointer:coarse)").matches)) setTimeout(() => { if (step === n) f.focus({preventScroll:true}); }, 380);
}
function next() {
  const e = validateSlide(step);
  if (e) { showErr(e); return; }
  go(step + 1);
}
$("#nextBtn").addEventListener("click", next);
$("#prevBtn").addEventListener("click", () => go(step - 1));

/* нэг сонголттой асуултад сонгосны дараа автоматаар шилжинэ */
$("#stage").addEventListener("change", ev => {
  const el = ev.target.closest(".q");
  if (ev.target.name === "usp") $("#uspOtherWrap").hidden = rv("usp") !== "other";
  if (el && el.dataset.auto && ev.target.type === "radio") { showErr(""); clearTimeout(autoT); const i = step; autoT = setTimeout(() => { if (step === i) go(i + 1); }, 300); }
  updateNextLabel();
});
$("#stage").addEventListener("input", updateNextLabel);
$("#budgetQuick").addEventListener("click", ev => {
  const b = ev.target.closest("button"); if (!b) return;
  $("#budget").value = b.dataset.v;
  clearTimeout(autoT); const i = step; autoT = setTimeout(() => { if (step === i) go(i + 1); }, 300);
});
$("#interestQuick").addEventListener("click", ev => {
  const b = ev.target.closest("button"); if (!b) return;
  const inp = $("#interests"), t = b.textContent.toLowerCase();
  const parts = inp.value.split(",").map(s => s.trim()).filter(Boolean);
  if (!parts.map(s => s.toLowerCase()).includes(t)) parts.push(t);
  inp.value = parts.join(", "); updateNextLabel();
});
$("#sum").addEventListener("click", ev => { const b = ev.target.closest("[data-go]"); if (b) go(+b.dataset.go); });

$("#fillDemo").addEventListener("click", () => {
  const set = (id, v) => { $("#" + id).value = v; };
  set("product", "Байгалийн найрлагатай гар саван"); setR("cat", "beauty"); set("price", 18000); set("cost", 8000);
  setC("ages", ["25-34", "35-44"]); setR("gender", "female"); setC("locations", ["ub"]); set("interests", "эрүүл амьдрал, гоо сайхан");
  setR("stage", "some"); setC("reasons", ["trust", "reach"]); setC("pf", ["facebook", "instagram"]);
  setC("channels", ["messenger"]); setC("goals", ["sales"]); set("budget", 500000); setR("capacity", "small"); setR("usp", "quality");
  go(LAST);
});

/* ---------- plan ---------- */
let current = null;   /* {key, paid, price, answers, plan} */

/* Төлөвлөгөө гарахад 10–60 секунд болдог тул хэрэглэгч гацсан гэж бодохгүйн тул алхам, хугацааг харуулна. */
const LOAD_STEPS = [[0, "Таны хариултыг шинжилж байна…"], [3, "Оношилгоо, гол чиглэлийг бичиж байна…"],
  [9, "Hook-уудыг таны бүтээгдэхүүнд тааруулж байна…"], [16, "7 хоногийн бэлэн текстийг бичиж байна…"],
  [30, "Чанарыг шалгаж байна…"], [50, "Төлөвлөгөөг нарийвчлан бэлтгэж байна, түр хүлээнэ үү…"]];
let loadT = null;
function showLoading(on) {
  $("#loading").hidden = !on;
  $("#submitBtn").disabled = on;
  clearInterval(loadT);
  if (!on) return;
  $("#doc").hidden = true; $("#loading").scrollIntoView({behavior:"smooth", block:"center"});
  const t0 = Date.now();
  const tick = () => {
    const sec = Math.floor((Date.now() - t0) / 1000);
    const msg = LOAD_STEPS.filter(x => sec >= x[0]).pop()[1];
    $("#loadMsg").textContent = msg + " (" + sec + " сек)";
  };
  tick(); loadT = setInterval(tick, 1000);
}

/* «Мэдээллээ засах»: өмнөх хариултаар маягтыг бөглөөд шалгах хуудас руу шилжинэ. */
function fillForm(a) {
  if (!a) return;
  const set = (id, v) => { $("#" + id).value = v == null ? "" : v; };
  set("product", a.product); set("price", a.price || ""); set("cost", a.cost || ""); set("interests", a.interests);
  set("budget", a.budget || 0); set("uspOther", a.uspOther);
  ["cat", "gender", "stage", "capacity", "usp"].forEach(n => { $('input[name="' + n + '"]').forEach(x => { x.checked = x.value === a[n]; }); });
  ["ages", "locations", "reasons", "pf", "channels", "goals"].forEach(n => setC(n, a[n] || []));
  $("#uspOtherWrap").hidden = a.usp !== "other";
}

function showPlan(v, scroll) {
  current = v;
  store.set("mz_plan", v.key);
  renderDoc(v);
  $("#doc").hidden = false; $("#navdoc").hidden = false;
  if (scroll) $("#doc").scrollIntoView({behavior:"smooth", block:"start"});
}

$("#intake").addEventListener("submit", async ev => {
  ev.preventDefault();
  if (step < LAST) { next(); return; }
  for (let i = 0; i < LAST; i++) { const e = validateSlide(i); if (e) { go(i); showErr(e); return; } }
  showErr("");
  showLoading(true);
  try { showPlan(await api("POST", "/api/plan", {answers: readForm()}), true); }
  catch (e) { showErr(e.message); $("#top").scrollIntoView({behavior:"smooth"}); }
  finally { showLoading(false); }
});

/* ---------- rendering ---------- */
const copyStore = [];
function copyBtn(text, label) {
  copyStore.push(text);
  return '<button type="button" class="copybtn" data-copy="' + (copyStore.length - 1) + '">' + (label || "Хуулах") + '</button>';
}

/* Түгжээтэй үед бодит агуулга браузерт ирэхгүй тул гарчиг + бүдгэрсэн орлуулагч харуулна. */
function lockedSection(n, id, title) {
  return '<section class="dsec"><h3 id="' + id + '"><span class="sn">' + n + '</span>' + title + '</h3>' +
    '<div class="ph w80"></div><div class="ph"></div><div class="ph w60"></div><div class="ph w40"></div></section>';
}

function paywallHtml(price) {
  return '<div class="paywall" id="paywall"><div class="paywall-card">' +
    '<div class="paywall-lock">🔒</div>' +
    '<h4>Дэлгэрэнгүй төлөвлөгөөг нээх</h4>' +
    '<p>Үлдсэн 6 өдрийн бэлэн текст, Hook сан, Boost/зарын төсөв, 30 хоногийн төлөвлөгөө, хэмжилт, анхаарах зүйлсийг үзэхийн тулд нэг удаа төлнө үү.</p>' +
    '<div class="paywall-price">' + fmt(price) + '</div>' +
    '<button class="btn" type="button" id="qpayBtn">QPay-ээр төлөх</button>' +
    '<div id="qpayPanel" class="qpay-panel" hidden></div>' +
    '<p class="muted small">Төлбөр баталгаажсаны дараа контент энэ хуудсанд шууд нээгдэнэ.</p>' +
    '</div></div>';
}

function dayHtml(x, open) {
  const light = x.level === "light";
  let h = '<details class="day"' + (open ? " open" : "") + '><summary>' +
    '<span class="dname">' + esc(x.day) + '<small>' + esc(x.pillar) + '</small></span>' +
    '<span class="dsum"><span class="dfmt">' + esc(light ? "Story, хөнгөн өдөр" : x.format) + '</span>' +
    (light ? '<span class="dhook">' + esc(x.light) + '</span>' : '<span class="dhook">«' + esc(x.hook) + '»</span>') +
    '<span class="tags">' + (light ? "" : '<span class="tag">Цаг: ' + esc(x.time) + '</span>') +
    (x.boost ? '<span class="tag k">Boost: ' + esc(x.boost) + '</span>' : "") + '</span></span></summary>';
  if (!light) {
    h += '<div class="dbody">';
    if (x.script) h += '<h5>' + esc(x.scriptLabel) + '</h5><ol>' + x.script.map(s => '<li>' + esc(s) + '</li>').join("") + '</ol>';
    h += '<h5>Бэлэн текст</h5><div class="cap">' + esc(x.caption) + '</div>' + copyBtn(x.caption, "Текстийг хуулах");
    h += '</div>';
  } else {
    h += '<div class="dbody"><p class="muted">Story-г 2–3 хэсэг, 5 минутаас илүүгүй хугацаанд хийж болно. Энэ өдөр нийтлэлийн ачаалал тавихгүй.</p></div>';
  }
  return h + '</details>';
}

function daysSection(p, paid) {
  const c = p.counts;
  let h = '<section class="dsec"><h3 id="s3"><span class="sn">3</span>7 хоногийн контент</h3>';
  h += '<div class="summary-line"><span><b>' + c.total + '</b> үндсэн контент</span><span><b>' + c.video + '</b> богино бичлэг</span><span><b>' + c.post + '</b> пост, carousel</span>' +
    (c.live ? '<span><b>' + c.live + '</b> live</span>' : "") + '<span><b>' + c.story + '</b> өдөр зөвхөн Story</span></div>';
  h += '<p class="muted">Контентыг 4 баганаар тэнцвэржүүлсэн: сургах, нотлох, дотно түүх, борлуулах. Нийтлэх цаг нь эхлэлийн таамаглал тул 2 долоо хоногийн дараа өөрийн Insights-ээр засаарай. Дөрвөлжин хаалтад [ ] байгаа хэсгийг өөрийн мэдээллээр солиод ашиглана.</p>';
  if (paid) {
    h += '<div class="toolrow"><button class="linkbtn noprint" type="button" id="calBtn">Календарьт нэмэх (.ics)</button>' +
      '<span style="width:18px"></span><button class="linkbtn noprint" type="button" id="toggleDays">Бүгдийг нээх</button></div>';
  } else {
    h += '<div class="callout"><b>Үнэгүй жишээ:</b> Даваа гарагийн контентыг бүтнээр нь үзүүлж байна. Үлдсэн 6 өдрийн бэлэн текст доорх төлбөрийн дараа нээгдэнэ.</div>';
  }
  p.days.forEach((x, i) => { h += dayHtml(x, i === 0); });
  return h + '</section>';
}

function renderDoc(v) {
  copyStore.length = 0;
  const p = v.plan, d = p.d;
  let h = "";

  h += '<header class="dochead"><div class="docref">Баримт № ' + esc(p.id) + ' &nbsp;|&nbsp; Бэлтгэсэн огноо ' + esc(p.dateStr) + '</div>' +
    '<h2>Сошиал маркетингийн сарын төлөвлөгөө</h2><p class="docsub">' + esc(d.product) + '</p>' +
    '<dl class="meta">' +
    '<div><dt>Ангилал</dt><dd>' + esc(p.cat.label) + '</dd></div>' +
    '<div><dt>Гол зорилго</dt><dd>' + esc(p.goalLabel) + '</dd></div>' +
    '<div><dt>Одоогийн байдал</dt><dd>' + esc(p.stage.label) + '</dd></div>' +
    '<div><dt>Зорилтот хэрэглэгч</dt><dd>' + esc(d.audience || "Оруулаагүй") + '</dd></div>' +
    '<div><dt>Сарын зарын төсөв</dt><dd>' + (p.B ? fmt(p.B) : "Төсөвгүй") + '</dd></div>' +
    '<div><dt>Захиалгын суваг</dt><dd>' + esc(p.chanLabel) + '</dd></div></dl>' +
    '<div class="docactions noprint">' +
    (v.paid ? '<button class="btn" type="button" id="pdfBtn">PDF татах</button><button class="btn ghost" type="button" id="dlBtn">Markdown (.md)</button>' : "") +
    '<button class="btn ghost" type="button" id="copyAll">Бүгдийг хуулах</button>' +
    '<button class="btn ghost" type="button" id="regenBtn">Шинэ хувилбар гаргах</button>' +
    '<button class="btn ghost" type="button" id="editBtn">Мэдээллээ засах</button></div></header>';

  /* 1 */
  h += '<section class="dsec"><h3 id="s1"><span class="sn">1</span>Оношилгоо ба гол чиглэл</h3>';
  h += '<div class="callout"><b>Энэ сарын улирлын боломж (' + p.season.month + '-р сар):</b> ' + esc(p.season.label) + '. ' + esc(p.season.tip) + '</div>';
  h += '<p><b>Магадлалтай гол гацаа: ' + esc(p.stage.gap) + '.</b> ' + esc(p.diagnosis) + '</p>';
  if (p.reasonNotes.length) {
    h += '<h4>Та өөрөө тэмдэглэсэн саад бэрхшээл</h4><ul class="focus">' + p.reasonNotes.map(r => '<li><b>' + esc(r.t) + '</b><span>' + esc(r.d) + '</span></li>').join("") + '</ul>';
  }
  h += '<h4>Хамгийн түрүүнд хийх зүйлс</h4><ul class="focus">' + p.focus.map(f => '<li><b>' + esc(f.t) + '</b><span>' + esc(f.d) + '</span></li>').join("") + '</ul>';
  h += '<h4>Төлөвлөгөөний таамаглал</h4><ul>' + p.assumptions.map(a => '<li>' + esc(a) + '</li>').join("") + '</ul></section>';

  /* 2 */
  h += '<section class="dsec"><h3 id="s2"><span class="sn">2</span>Платформ</h3>' +
    '<div class="scroll"><table class="tbl"><thead><tr><th>Платформ</th><th>Үүрэг</th><th>Түвшин</th></tr></thead><tbody>' +
    p.pfRows.map(r => '<tr><td><b>' + esc(r.name) + '</b></td><td>' + esc(r.role) + '</td><td><span class="tag' + (r.level === "Үндсэн" ? " k" : "") + '">' + esc(r.level) + '</span></td></tr>').join("") +
    '</tbody></table></div>' +
    (p.pfNotes.length ? '<ul>' + p.pfNotes.map(n => '<li>' + esc(n) + '</li>').join("") + '</ul>' : "") + '</section>';

  /* 3: төлөөгүй үед сервер зөвхөн Даваа гарагийг илгээнэ (чанарыг нь үзүүлэх үнэгүй жишээ). */
  h += daysSection(p, v.paid);

  h += '<div class="premium-area" id="premiumArea">';
  if (!v.paid) {
    h += paywallHtml(v.price) + '<div class="premium-wrap locked" id="premiumWrap">' +
      lockedSection(4, "s4", "Hook сан") + lockedSection(5, "s5", "Boost ба зарын төсөв") +
      lockedSection(6, "s6", "30 хоногийн төлөвлөгөө") + lockedSection(7, "s7", "Хэмжилт") + lockedSection(8, "s8", "Анхаарах зүйл") + '</div></div>';
    $("#docBody").innerHTML = h;
    $("#qpayBtn").addEventListener("click", startQPayPayment);
    return;
  }
  h += '<div class="premium-wrap" id="premiumWrap">';

  /* 4 */
  h += '<section class="dsec"><h3 id="s4"><span class="sn">4</span>Hook сан</h3>' +
    '<p class="muted">Hook нь бичлэгийн эхний 1–3 секунд, постын эхний мөр. Бүтээгдэхүүний нэрээр биш, үзэгчийн нөхцөл байдлаар эхэлсэн нь үзэлт хадгалахад тустай. Нэг бичлэгт 2 өөр hook туршиж, аль нь илүү үзэлт авсныг ав.</p>' +
    '<ul class="hooks">' + p.hooks.map(k => '<li><span><span class="tag k">' + esc(k.type) + '</span></span><span><q>' + esc(k.text) + '</q><small>Хаана ашиглах: ' + esc(k.use) + '</small></span>' + copyBtn(k.text) + '</li>').join("") + '</ul></section>';

  /* 5 */
  h += '<section class="dsec"><h3 id="s5"><span class="sn">5</span>Boost ба зарын төсөв</h3>';
  if (p.B > 0) {
    const s = p.split;
    const segs = [["Cold: шинэ үзэгчид", s.cold, "var(--c1)"], ["Warm: харьцсан хүмүүс", s.warm, "var(--c2)"], ["Hot: асууж, сонирхсон", s.hot, "var(--c3)"], ["Туршилт", s.test, "var(--c4)"]].filter(x => x[1] > 0);
    h += '<p>Сарын ' + fmt(p.B) + ' төсвийг аудиторийн бэлэн байдлаар хуваав. Долоо хоногт ойролцоогоор ' + fmt(p.B / 4) + '.</p>';
    h += '<div class="bar" role="img" aria-label="Төсвийн хуваарилалт">' + segs.map(x => '<i style="width:' + (x[1] * 100) + '%;background:' + x[2] + '"></i>').join("") + '</div>';
    h += '<div class="legend">' + segs.map(x => '<span style="--c:' + x[2] + '">' + x[0] + ': ' + Math.round(x[1] * 100) + '% (' + fmt(p.B * x[1]) + ')</span>').join("") + '</div>';
    h += '<h4>Долоо хоног тутмын boost хуваарь</h4><div class="scroll"><table class="tbl"><thead><tr><th>Пост</th><th>Зорилго</th><th>Үзэгчид</th><th>Хугацаа</th><th>Төсөв</th></tr></thead><tbody>' +
      p.rows.map(r => '<tr><td><b>' + esc(r.post) + '</b><br><span class="tag">' + esc(r.temp) + '</span></td><td>' + esc(r.goal) + '</td><td>' + esc(r.aud) + '</td><td>' + r.days + ' хоног</td><td><b>' + fmt(r.amt) + '</b><br><span class="muted" style="font-size:.8rem">өдөрт ' + fmt(r.amt / r.days) + '</span></td></tr>').join("") +
      '</tbody></table></div>';
    h += '<h4>Boost хийхээс өмнөх шалгуур</h4><ul>' +
      '<li>Постыг organic-аар нийтэлж, 24–48 цагийн дотор мессеж, хадгалалт, сэтгэгдлийн хариу авсныг сонго.</li>' +
      '<li>Мессежийн бэлэн хариулт, үнэ, хүргэлт, төлбөрийн мэдээлэл бэлэн байх ёстой. Хариу удаан бол зарын мөнгө дэмий үрэгдэнэ.</li>' +
      '<li>Ашиг тэнцэх түвшнээ (доорх тооцоо) урьдчилан мэд.</li>' +
      '<li>Төсвийн ихэнхийг ажиллаж байгаа зүйлд, 10–20%-ийг шинэ туршилтад зарц. Хангалттай өгөгдөл (хэдэн өдөр) цуглуулахаас өмнө дүгнэхгүй.</li></ul>';
  } else {
    h += '<div class="callout"><b>Зарын төсөвгүй үед</b> төлбөргүй хүрэлт, итгэлийг эхэлж бий болго.</div>' +
      '<ul><li>Сонирхолтой 3–5 Facebook групп, community-д ашигтай контентоор оролцож, борлуулалтын пост биш тусламж, зөвлөгөө хуваалц.</li>' +
      '<li>Эхний худалдан авагчдаас сэтгэгдэл, зураг хүсч, UGC цуглуул.</li>' +
      '<li>Жижиг инфлюенсертэй бартер (бүтээгдэхүүн өгч, бодит хэрэглээгээр нь харуулах) хамтын ажиллагаа туршиж үз.</li>' +
      '<li>Organic пост 24–48 цагт өөрийн дунджаас илүү мессеж, хадгалалт авбал 3 хоногийн жижиг boost (жишээ нь өдөрт 5,000–10,000₮) туршиж эхэл.</li></ul>';
  }
  h += '<h4>Ашиг тэнцэх тооцоо</h4><dl class="calc">' +
    '<div><dt>Ашгийн хувь</dt><dd>' + p.be.m + '%</dd><small>Зарын өмнөх ашиг</small></div>' +
    '<div><dt>Ашиг тэнцэх ROAS</dt><dd>' + p.be.roas.toFixed(2) + '</dd><small>1 ÷ ашгийн хувь. Үүнээс дээш бол ашиг үлдэнэ.</small></div>' +
    (p.be.gp ? '<div><dt>Нэг захиалгын ашиг</dt><dd>' + fmt(p.be.gp) + '</dd><small>Нэгж үнэ ' + fmt(p.be.price) + ' × ' + p.be.m + '%. CPA үүнээс доош байх ёстой.</small></div>' : '<div><dt>Нэг захиалгын ашиг</dt><dd>—</dd><small>Нэгж үнэ оруулбал тооцно.</small></div>') +
    (p.be.gp && p.B ? '<div><dt>Зарыг нөхөх захиалга</dt><dd>' + p.be.orders + '</dd><small>Сарын ' + fmt(p.B) + '-ийг нөхөхөд зарын сувгаас хэрэгтэй захиалга.</small></div>' : "") +
    '</dl></section>';

  /* 6 */
  h += '<section class="dsec"><h3 id="s6"><span class="sn">6</span>30 хоногийн төлөвлөгөө</h3>' +
    p.weeks.map(w => '<div class="week"><h4>' + w.n + '-р долоо хоног: ' + esc(w.name) + '<small>' + esc(w.sub) + '</small></h4><ul>' + w.items.map(i => '<li>' + esc(i) + '</li>').join("") + '</ul></div>').join("") + '</section>';

  /* 7 */
  h += '<section class="dsec"><h3 id="s7"><span class="sn">7</span>Хэмжилт</h3>' +
    '<p class="muted">Бүх тоог хянах шаардлагагүй. Зорилгод шууд хамаатай цөөн үзүүлэлтийг долоо хоног бүрийн Даваа гарагт 30 минут хараад шийдвэр гарга.</p>' +
    '<div class="scroll"><table class="tbl"><thead><tr><th>Үзүүлэлт</th><th>Зорилт, хэмжих арга</th><th>Юуг харуулах вэ</th></tr></thead><tbody>' +
    p.metrics.map(r => '<tr><td><b>' + esc(r[0]) + '</b></td><td>' + esc(r[1]) + '</td><td>' + esc(r[2]) + '</td></tr>').join("") + '</tbody></table></div></section>';

  /* 8 */
  h += '<section class="dsec"><h3 id="s8"><span class="sn">8</span>Анхаарах зүйл</h3><div class="callout warn"><ul style="margin:0">' +
    p.cautions.map(c => '<li>' + esc(c) + '</li>').join("") + '</ul></div></section>';

  h += '</div></div>';
  $("#docBody").innerHTML = h;
}

/* ---------- markdown export ---------- */
function toMD(v) {
  const p = v.plan, d = p.d, L = [];
  L.push("# Сошиал маркетингийн сарын төлөвлөгөө: " + d.product);
  L.push("Баримт № " + p.id + ", " + p.dateStr, "");
  L.push("- Ангилал: " + p.cat.label, "- Зорилго: " + p.goalLabel, "- Одоогийн байдал: " + p.stage.label,
    "- Зорилтот хэрэглэгч: " + (d.audience || "оруулаагүй"),
    "- Сарын зарын төсөв: " + (p.B ? fmt(p.B) : "Төсөвгүй"), "- Захиалгын суваг: " + p.chanLabel, "");
  L.push("## 1. Оношилгоо ба гол чиглэл");
  L.push("Улирлын боломж (" + p.season.month + "-р сар): " + p.season.label + ". " + p.season.tip, "");
  L.push("Магадлалтай гол гацаа: " + p.stage.gap + ". " + p.diagnosis, "");
  if (p.reasonNotes.length) { L.push("Тэмдэглэсэн саад бэрхшээл:"); p.reasonNotes.forEach(r => L.push("- **" + r.t + "**: " + r.d)); L.push(""); }
  p.focus.forEach((f, i) => L.push((i + 1) + ". **" + f.t + "**: " + f.d));
  L.push("", "Таамаглал:"); p.assumptions.forEach(a => L.push("- " + a));
  L.push("", "## 2. Платформ"); p.pfRows.forEach(r => L.push("- " + r.name + " (" + r.level + "): " + r.role));
  p.pfNotes.forEach(n => L.push("- Тэмдэглэл: " + n));
  if (!v.paid) {
    L.push("", "---", "", "**3–8-р хэсэг түгжээтэй.** " + fmt(v.price) + " төлж QPay-ээр нээнэ үү.");
    return L.join("\n");
  }
  L.push("", "## 3. 7 хоногийн контент");
  L.push("Нийт " + p.counts.total + " үндсэн контент (" + p.counts.video + " богино бичлэг, " + p.counts.post + " пост" + (p.counts.live ? ", " + p.counts.live + " live" : "") + "), " + p.counts.story + " өдөр Story.", "");
  p.days.forEach(x => {
    if (x.level === "light") { L.push("### " + x.day + " (" + x.pillar + "): Story", x.light, ""); return; }
    L.push("### " + x.day + " (" + x.pillar + "): " + x.format, "Цаг: " + x.time + (x.boost ? ". Boost: " + x.boost : ""), "Hook: " + x.hook, "");
    if (x.script) { L.push(x.scriptLabel + ":"); x.script.forEach((s, i) => L.push((i + 1) + ". " + s)); L.push(""); }
    L.push("Бэлэн текст:", "```", x.caption, "```", "");
  });
  L.push("## 4. Hook сан"); p.hooks.forEach(k => L.push("- [" + k.type + "] " + k.text + " (Хаана: " + k.use + ")"));
  L.push("", "## 5. Boost ба зарын төсөв");
  if (p.B > 0) {
    L.push("Сарын төсөв " + fmt(p.B) + ", долоо хоногт ойролцоогоор " + fmt(p.B / 4) + ".");
    p.rows.forEach(r => L.push("- " + r.post + " [" + r.temp + "]: " + fmt(r.amt) + ", " + r.days + " хоног. Зорилго: " + r.goal + ". Үзэгчид: " + r.aud));
  } else L.push("Зарын төсөвгүй үед: Facebook групп, UGC, бартер хамтын ажиллагаа, органик постын дараа жижиг boost.");
  L.push("", "Ашиг тэнцэх ROAS: " + p.be.roas.toFixed(2) + " (ашгийн хувь " + p.be.m + "%)");
  if (p.be.gp) L.push("Нэг захиалгын ашиг: " + fmt(p.be.gp) + (p.B ? ". Зарыг нөхөх захиалга: " + p.be.orders : ""));
  L.push("", "## 6. 30 хоногийн төлөвлөгөө");
  p.weeks.forEach(w => { L.push("### " + w.n + "-р долоо хоног: " + w.name); w.items.forEach(i => L.push("- " + i)); L.push(""); });
  L.push("## 7. Хэмжилт"); p.metrics.forEach(r => L.push("- " + r[0] + ": " + r[1] + ". " + r[2]));
  L.push("", "## 8. Анхаарах зүйл"); p.cautions.forEach(c => L.push("- " + c));
  return L.join("\n");
}

/* ---------- payment (QPay) ----------
 * Нууц мэдээлэл болон төлбөрийн шалгалт бүгд сервер дээр. Төлбөр баталгаажсаны
 * дараа л сервер 3–8-р хэсгийг илгээнэ. */
const POLL_MS = 3000, POLL_TIMEOUT_MS = 5 * 60 * 1000;
let pollT = null, pollDeadline = 0;

async function unlocked() {
  clearTimeout(pollT);
  showPlan(await api("GET", "/api/plan/" + current.key), false);
  toast("Төлбөр баталгаажлаа! Дэлгэрэнгүй төлөвлөгөө нээгдлээ.");
}

async function poll() {
  if (Date.now() > pollDeadline) {
    const panel = $("#qpayPanel");
    if (panel) panel.insertAdjacentHTML("beforeend", '<p class="err">Төлбөрийн хугацаа дууслаа. Дахин QR үүсгэж үзнэ үү.</p>');
    const btn = $("#qpayBtn"); if (btn) { btn.disabled = false; btn.textContent = "Дахин QR үүсгэх"; }
    return;
  }
  try { if ((await api("POST", "/api/qpay/check", {key: current.key})).paid) return unlocked(); }
  catch (e) { /* сервертэй түр тасарсан ч үргэлжлүүлнэ */ }
  pollT = setTimeout(poll, POLL_MS);
}

async function startQPayPayment() {
  const btn = $("#qpayBtn"), panel = $("#qpayPanel");
  btn.disabled = true; btn.textContent = "Нэхэмжлэл үүсгэж байна…";
  panel.hidden = false; panel.innerHTML = '<p class="muted">QPay-тай холбогдож байна…</p>';
  try {
    const inv = await api("POST", "/api/qpay/invoice", {key: current.key});
    if (inv.paid) return unlocked();
    if (inv.test) {
      /* Зөвхөн сервер дээр QPAY_TEST_MODE=true үед. Бодит төлбөр авахгүй. */
      panel.innerHTML = '<p class="muted"><b>Туршилтын горим:</b> QPay тохируулаагүй. Бодит төлбөргүйгээр нээж байна…</p>';
      await api("POST", "/api/qpay/test-pay", {key: current.key});
      return unlocked();
    }
    const qr = inv.qr_image ? (String(inv.qr_image).startsWith("data:") ? inv.qr_image : "data:image/png;base64," + inv.qr_image) : "";
    panel.innerHTML =
      (qr ? '<img class="qpay-qr" src="' + esc(qr) + '" alt="QPay QR код">' : "") +
      '<p class="muted">Банкны аппаараа QR кодыг уншуулж ' + fmt(current.price) + ' төлнө үү.</p>' +
      (inv.urls.length ? '<div class="qpay-apps">' + inv.urls.map(u => '<a class="btn ghost small" href="' + esc(u.link || "#") + '" target="_blank" rel="noopener">' + esc(u.name || u.description || "Апп нээх") + '</a>').join("") + '</div>' : "") +
      '<p class="muted small" id="qpayStatus">Төлбөр хүлээж байна…</p>';
    btn.textContent = "QR үүссэн — хүлээж байна";
    pollDeadline = Date.now() + POLL_TIMEOUT_MS;
    poll();
  } catch (e) {
    btn.disabled = false; btn.textContent = "QPay-ээр төлөх";
    panel.innerHTML = '<p class="err">' + esc(e.status === 503 ? "Төлбөрийн систем түр ажиллахгүй байна. Дараа дахин оролдоно уу." : "Алдаа гарлаа: " + e.message) + '</p>';
  }
}

/* ---------- PDF ба календарь ---------- */
/* Хөтчийн «PDF болгож хадгалах»-ыг ашиглана: нэмэлт сангүй, монгол үсэг зөв гарна. */
function printPdf() {
  const days = $("details.day"), was = days.map(x => x.open);
  days.forEach(x => { x.open = true; });
  const restore = () => { days.forEach((x, i) => { x.open = was[i]; }); window.removeEventListener("afterprint", restore); };
  window.addEventListener("afterprint", restore);
  toast("«Save as PDF / PDF болгож хадгалах»-ыг сонгоно уу");
  setTimeout(() => window.print(), 300);
}

/* Маргаашаас эхлэн 7 хоногийн нийтлэл бүрийг календарийн үйл явдал болгоно. */
const WEEKDAY = {"Ням": 0, "Даваа": 1, "Мягмар": 2, "Лхагва": 3, "Пүрэв": 4, "Баасан": 5, "Бямба": 6};
function toICS(p) {
  const pad2 = n => String(n).padStart(2, "0");
  const stamp = d => d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) + "T" + pad2(d.getHours()) + pad2(d.getMinutes()) + "00";
  /* RFC 5545: таслал, цэг таслал, мөр шилжилтийг escape хийнэ. */
  const txt = s => String(s || "").replace(/\\/g, "\\\\").replace(/[,;]/g, m => "\\" + m).replace(/\n/g, "\\n");
  const L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Marketing Zuvluh//MN", "CALSCALE:GREGORIAN"];
  const start = new Date(); start.setDate(start.getDate() + 1); start.setHours(0, 0, 0, 0);
  p.days.forEach((x, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + ((WEEKDAY[x.day] - d.getDay() + 7) % 7));
    const hm = (x.level === "light" ? "12:00" : String(x.time).slice(0, 5)).split(":");
    d.setHours(+hm[0] || 12, +hm[1] || 0);
    const end = new Date(d.getTime() + (x.isLive && x.level !== "light" ? 60 : 30) * 60000);
    const title = x.level === "light" ? "Story: " + x.light : x.format + " — " + x.hook;
    const body = x.level === "light" ? x.light : (x.script ? x.script.join("\n") + "\n\n" : "") + x.caption;
    L.push("BEGIN:VEVENT", "UID:" + p.id + "-" + i + "@marketing-zuvluh", "DTSTAMP:" + stamp(new Date()),
      "DTSTART:" + stamp(d), "DTEND:" + stamp(end), "SUMMARY:" + txt(title.slice(0, 120)), "DESCRIPTION:" + txt(body),
      "RRULE:FREQ=WEEKLY;COUNT=4", "BEGIN:VALARM", "TRIGGER:-PT30M", "ACTION:DISPLAY", "DESCRIPTION:" + txt(title.slice(0, 60)), "END:VALARM", "END:VEVENT");
  });
  L.push("END:VCALENDAR");
  /* RFC 5545: мөр 75 байтаас урт байж болохгүй. Кирилл үсэг 2 байт тул 30 тэмдэгтээр тасална. */
  const fold = line => {
    const ch = Array.from(line), parts = [];   /* Array.from: emoji-г хоёр хувааж эвдэхгүй */
    for (let i = 0; i < ch.length; i += 30) parts.push(ch.slice(i, i + 30).join(""));
    return parts.join("\r\n ");
  };
  return L.map(fold).join("\r\n");
}

/* ---------- doc actions ---------- */
function toast(t) {
  const el = $("#toast"); el.textContent = t; el.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => { el.hidden = true; }, 1800);
}
function copyText(t) {
  const fallback = () => {
    const ta = document.createElement("textarea"); ta.value = t; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand("copy"); } catch (e) {}
    ta.remove(); toast(ok ? "Хуулагдлаа" : "Хуулах боломжгүй байна");
  };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(() => toast("Хуулагдлаа"), fallback);
  else fallback();
}
function download(name, text, type) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], {type: (type || "text/plain") + ";charset=utf-8"}));
  a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

document.addEventListener("click", async ev => {
  const cb = ev.target.closest("[data-copy]");
  if (cb) { copyText(copyStore[+cb.dataset.copy]); return; }
  const id = ev.target.id;
  if (id === "copyAll" && current) { copyText(toMD(current)); return; }
  if (id === "dlBtn" && current) { download("marketing-plan-" + current.plan.id + ".md", toMD(current), "text/markdown"); return; }
  if (id === "pdfBtn") { printPdf(); return; }
  if (id === "calBtn" && current) { download("content-calendar-" + current.plan.id + ".ics", toICS(current.plan), "text/calendar"); toast("Календарийн файлыг нээж нэмнэ үү"); return; }
  if (id === "editBtn") { if (current) { fillForm(current.answers); go(LAST); } $("#top").scrollIntoView({behavior:"smooth"}); return; }
  if (id === "regenBtn" && current) {
    showLoading(true);
    try { showPlan(await api("POST", "/api/plan/" + current.key + "/regenerate"), true); toast("Шинэ хувилбар гарлаа"); }
    catch (e) { toast(e.message); $("#doc").hidden = false; }
    finally { showLoading(false); }
    return;
  }
  if (id === "toggleDays") {
    const all = $$("details.day"), open = all.some(x => !x.open);
    all.forEach(x => { x.open = open; });
    ev.target.textContent = open ? "Бүгдийг хаах" : "Бүгдийг нээх";
  }
});

/* ---------- theme ---------- */
/* Үндсэн нь бараан; цайвар сонгосныг хадгална (head доторх жижиг скрипт ачаалахад нь хэрэглэнэ). */
$("#themeBtn").addEventListener("click", () => {
  const root = document.documentElement;
  const light = root.getAttribute("data-theme") !== "light";
  if (light) root.setAttribute("data-theme", "light"); else root.removeAttribute("data-theme");
  store.set("mz_theme", light ? "light" : "dark");
});

/* ---------- start ---------- */
go(0);
/* Үнийг серверийн PLAN_PRICE-аас авна: хуудсанд бичсэн үнэ өөр байхаас сэргийлнэ. */
api("GET", "/api/health").then(h => { $$("[data-price]").forEach(el => { el.textContent = fmt(h.price); }); }).catch(() => {});
$("#ctaStart").addEventListener("click", ev => {
  ev.preventDefault();
  $("#top").scrollIntoView({behavior:"smooth"});
  setTimeout(() => { if (step === 0) $("#product").focus({preventScroll:true}); }, 500);
});
/* Өмнө гаргасан төлөвлөгөөг сэргээнэ (жишээ нь QPay апп-аас буцаж ирэхэд). */
const lastKey = store.get("mz_plan");
if (lastKey) api("GET", "/api/plan/" + lastKey).then(async v => {
  showPlan(v, false);
  fillForm(v.answers); go(0);
  /* Банкны аппаас буцаж ирэхэд хуудас дахин ачаалагдсан бол төлбөрийг нэг шалгана. */
  if (!v.paid && (await api("POST", "/api/qpay/check", {key: v.key}).catch(() => ({}))).paid) unlocked();
}).catch(() => {});

})();
