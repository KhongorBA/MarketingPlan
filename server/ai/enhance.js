"use strict";
/* Загвараар гаргасан төлөвлөгөөний текстэн хэсгийг (оношилгоо, гол чиглэл, hook,
 * 7 хоногийн бэлэн текст) AI-аар шинээр бичүүлнэ. Тоо, төсөв, бүтэц өөрчлөгдөхгүй.
 * AI-ийн хариуны талбар бүрийг шалгаж, буруу бол загварын утгаа үлдээнэ. */
const {chatJson} = require("./providers");
const {REASONS, PF, GOALS, CHANNELS} = require("../engine/kb");
const {fmt} = require("../engine/build");

const SYSTEM = `Чи Монголын жижиг, дунд бизнест сошиал медиагаар борлуулалт өсгөхөд тусалдаг туршлагатай маркетингийн зөвлөх.
Дүрэм:
- Зөвхөн монгол хэлээр, кирилл үсгээр, энгийн ярианы хэлээр бич. Маркетингийн нэр томьёог (hook, CTA, Reels, boost) хэвээр нь үлдээж болно.
- Тухайн бизнесийн бүтээгдэхүүн, үзэгч, саад бэрхшээлд яг тохирсон, тодорхой бич. Ерөнхий, хаана ч хэрэглэж болох өгүүлбэрээс зайлсхий.
- Мэдэхгүй баримтыг (тоо, нэр, хаяг, сэтгэгдэл, гэрчилгээ, лабораторийн шинжилгээ, шагнал) бүү зохио. Оронд нь [дөрвөлжин хаалтад] нэг давхар орлуулах зай үлдээ, жишээ нь [Хэрэглэгчийн нэр].
- Хуурамч хямдрал, худал "хязгаарлагдмал" тоо бүү бич.
- Эрүүл мэнд, гоо сайхан, хүүхдийн бараанд үр дүн, аюулгүй байдлын амлалт (эмчилнэ, гаж нөлөөгүй, харшил үүсгэхгүй, төгс тохирно) бүү бич. Оронд нь хэрэглэгч өөрөө юу мэдэрснийг [сэтгэгдэл] хэлбэрээр үлдээ.
- Хариуг зөвхөн заасан JSON бүтцээр буцаа. JSON-оос гадуур юу ч бүү бич.`;

function facts(p) {
  const d = p.d;
  return {
    "Бүтээгдэхүүн": d.product,
    "Ангилал": p.cat.label,
    "Барааны төрөл": p.kind.name,
    "Үнэ": d.price ? fmt(d.price) : "оруулаагүй",
    "Зорилтот хэрэглэгч": d.audience || "оруулаагүй",
    "Одоогийн байдал": p.stage.label,
    "Өөрийн тэмдэглэсэн саад": d.reasons.map(k => REASONS[k].label),
    "Платформ": p.pfRows.map(r => r.name + " (" + r.level + ")"),
    "Захиалга авах суваг": (d.channels.length ? d.channels : ["messenger"]).map(c => CHANNELS[c].label),
    "Зорилго": (d.goals.length ? d.goals : ["sales"]).map(g => GOALS[g]),
    "Давуу тал": d.usp || "оруулаагүй",
    "Энэ сарын улирал": p.season.label,
    "Түгээмэл эргэлзээ": p.cat.objection,
    "Хэрэглэгчийн асуудал": p.cat.pain,
    "Зохицуулалттай ангилал (эрүүл мэнд/гоо сайхан/хүүхэд)": !!p.cat.reg
  };
}

/* Script-ийн алхам бүрийн шошгыг («Hook (0–3 сек)», «Слайд 1») код хадгална, AI зөвхөн агуулгыг бичнэ. */
const stepLabel = t => t.split(": ")[0];

function skeleton(p) {
  return p.days.map(x => x.level === "light"
    ? {day: x.day, type: "light", pillar: x.pillar}
    : {day: x.day, type: x.isLive ? "live" : "main", pillar: x.pillar, format: x.format,
       script: x.script ? x.script.map(stepLabel) : null});
}

function prompt(p) {
  return `Бизнесийн мэдээлэл:
${JSON.stringify(facts(p), null, 2)}

7 хоногийн контентын бүтэц (өдөр, багана, формат нь тогтсон, чи текстийг нь бичнэ):
${JSON.stringify(skeleton(p), null, 2)}

Пост бүрийн төгсгөлд яг энэ CTA-г оруул: "${p.days[0].cta}"

Яг ийм бүтэцтэй, хүчинтэй JSON буцаа (тайлбар, илүү таслал бүү оруул):
${JSON.stringify(example(p), null, 2)}

Шаардлага:
- "focus": яг 3 зүйл.
- "hooks": 10 ширхэг. "type" нь эдгээрээс: Асуудал, Алдаа, Эргэлзээ, Нотолгоо, Шалгуур, Ард талын түүх, Санал, Харьцуулалт, Бодит хэрэглээ, Улирал.
- "days": бүтэц дэх өдөр бүрт нэг объект, ижил дарааллаар.
- "script": бүтэц дэх шошго бүрт яг нэг алхам, ижил дарааллаар. Шошгыг өөрийг нь бүү давт, зөвхөн тухайн алхамд юу хийх/хэлэхийг бич. Бүтэцэд script null бол null.
- "caption": хуулж шууд нийтлэх бүрэн текст. Мөр шилжүүлэхдээ \\n ашигла.`;
}

/* Загварт харуулах жишээ хариу: бүтэц нь яг тухайн төлөвлөгөөнийх, утга нь тайлбар. */
function example(p) {
  return {
    diagnosis: "Энэ бизнесийн одоогийн гол гацаа юу байж болох, яагаад (3–4 өгүүлбэр)",
    focus: [{t: "Хамгийн түрүүнд хийх зүйлийн гарчиг", d: "1–2 өгүүлбэр тайлбар"}],
    hooks: [{type: "Асуудал", text: "hook өгүүлбэр", use: "Хаана ашиглах"}],
    days: skeleton(p).map(x => x.type === "light"
      ? {day: x.day, light: "Тэр өдрийн Story-ийн санаа, 1 өгүүлбэр"}
      : {day: x.day, hook: "эхний өгүүлбэр", script: x.script ? x.script.map(l => "«" + l + "» алхамд юу хийх") : null, caption: "бүрэн текст"})
  };
}

/* ---------- чанарын шалгалт ---------- */
const FOREIGN = /[\u3000-\u9FFF\uAC00-\uD7AF\u0600-\u06FF\u0E00-\u0E7F]/;   /* хятад, япон, солонгос, араб, тай */
/* Эрүүл мэнд, гоо сайхан, хүүхдийн ангилалд сурталчилгааны хуулиар хориглох магадлалтай амлалт. */
const CLAIMS = /эмчил|эдгэ[эр]|анагаа|100\s*%|гарцаагүй|бүрэн арилга|үүрд|гаж нөлөө(гүй|ө?\s*байхгүй)|харшил\s*(үүсгэхгүй|өгөхгүй)|төгс тохир/i;

/* Кирилл үсэг нийт үсгийн 60%-иас бага бол англи/орос хэлээр бичсэн гэж үзнэ (Reels, CTA зэрэг үгсийг тооцоод). */
function cyrillicRatio(t) {
  const letters = t.match(/\p{L}/gu) || [];
  if (letters.length < 15) return 1;
  return (t.match(/[Ѐ-ӿ]/g) || []).length / letters.length;
}

function makeCheck(reg) {
  return (v, min) => {
    if (typeof v !== "string") return null;
    /* "[Д[Хэрэглэгчийн нэр]]" шиг давхар хаалтыг "[Хэрэглэгчийн нэр]" болгоно. */
    const t = v.trim().replace(/\[[^\[\]]{0,4}\[([^\[\]]+)\]\]/g, "[$1]");
    if (t.length < (min || 1) || FOREIGN.test(t) || cyrillicRatio(t) < 0.6) return null;
    if (reg && CLAIMS.test(t)) return null;
    return t;
  };
}

/* AI-ийн хариуг төлөвлөгөөнд нэгтгэнэ. Шалгалтад тэнцээгүй талбарт загварын текст үлдэнэ.
 * Буцаах утга: AI-аар солигдсон талбаруудын тоо. */
function merge(p, ai) {
  const s = makeCheck(!!p.cat.reg);
  let n = 0;
  const diag = s(ai.diagnosis, 40);
  if (diag) { p.diagnosis = diag; n++; }

  const focus = Array.isArray(ai.focus) ? ai.focus.filter(f => f && s(f.t) && s(f.d, 20)).map(f => ({t: s(f.t), d: s(f.d, 20)})) : [];
  if (focus.length >= 2) { p.focus = p.reasonNotes.slice(0, 1).concat(focus).slice(0, 4); n++; }

  const hooks = Array.isArray(ai.hooks) ? ai.hooks.filter(h => h && s(h.text, 10)).map(h => ({type: s(h.type) || "Hook", text: s(h.text, 10), use: s(h.use) || "Пост, бичлэгийн эхэнд"})) : [];
  if (hooks.length >= 5) { p.hooks = hooks.slice(0, 12); n++; }

  const days = Array.isArray(ai.days) ? ai.days : [];
  p.days.forEach((x, i) => {
    const a = days.find(y => y && y.day === x.day) || days[i];
    if (!a) return;
    if (x.level === "light") { const l = s(a.light, 10); if (l) { x.light = l; n++; } return; }
    const caption = s(a.caption, 60), hook = s(a.hook, 8);
    if (!caption || !hook) return;
    x.caption = caption; x.hook = hook; n++;
    if (x.script && Array.isArray(a.script) && a.script.length === x.script.length) {
      const steps = a.script.map(t => s(t, 5));
      if (steps.every(Boolean)) x.script = x.script.map((old, k) => {
        const label = stepLabel(old);
        /* AI шошгыг давтсан бол хасна: "Hook (0–3 сек): ..." → "..." */
        let body = steps[k].replace(/^\d+[.)]\s*/, "");
        if (body.toLowerCase().startsWith(label.toLowerCase())) body = body.slice(label.length).replace(/^\s*:\s*/, "");
        return label + ": " + body;
      });
    }
  });
  return n;
}

async function enhance(p) {
  const r = await chatJson([{role: "system", content: SYSTEM}, {role: "user", content: prompt(p)}], {
    /* Хуулбар дээр нэгтгэж, хангалттай бол л хүлээж авна. Үгүй бол дараагийн загварыг оролдоно. */
    accept: data => {
      const copy = structuredClone(p);
      const n = merge(copy, data || {});
      if (n < 6) throw new Error("хариу чанарын шалгалтад тэнцсэнгүй (" + n + " талбар)");
      return {copy, n};
    }
  });
  Object.assign(p, r.result.copy);
  return {provider: r.provider, model: r.model, ms: r.ms, fields: r.result.n};
}

module.exports = {enhance, merge, prompt, cyrillicRatio};
