"use strict";
/* Дүрэмд суурилсан төлөвлөгөөний engine. Тоо (төсөв, ROAS, CPA) болон бүтэц эндээс
 * гарна; AI ажиллахгүй үед бүх текст ч мөн эндээс (загвараар) гарна. */
const {CATS, KINDS, GOAL_FOCUS, ZERO_FOCUS, STAGES, PF, CHANNELS, CLOSE, REASONS, GOALS, USP_OPTS, SEASON} = require("./kb");

const fmt = n => Math.round(n).toLocaleString("en-US") + "₮";
const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
const pad = n => String(n).padStart(2, "0");

const AGES = ["13-17", "18-24", "25-34", "35-44", "45-54", "55+"];
const GENDERS = {female:"эмэгтэйчүүд", male:"эрэгтэйчүүд", all:"эрэгтэй, эмэгтэй хүмүүс"};
const LOCATIONS = {ub:"Улаанбаатар", darkhan:"Дархан", erdenet:"Эрдэнэт", aimag:"орон нутаг, аймгууд", nationwide:"Монгол даяар", abroad:"гадаадад байгаа монголчууд"};

const list = (v, allowed) => (Array.isArray(v) ? v : []).filter(x => allowed.includes(x));
const str = (v, max) => String(v == null ? "" : v).trim().slice(0, max);
const num = v => { const n = parseFloat(v); return Number.isFinite(n) && n > 0 ? n : 0; };

/* Хөрш насны бүлгүүдийг нэгтгэнэ: ["25-34","35-44"] → "25–44" */
function ageText(ages) {
  if (!ages.length) return "";
  const idx = ages.map(a => AGES.indexOf(a)).sort((a, b) => a - b);
  const runs = [];
  idx.forEach(i => { const r = runs[runs.length - 1]; if (r && r[1] === i - 1) r[1] = i; else runs.push([i, i]); });
  return runs.map(([a, b]) => {
    const lo = AGES[a].split(/[-+]/)[0], hi = AGES[b];
    return hi.endsWith("+") ? lo + "+" : lo + "–" + hi.split("-")[1];
  }).join(", ") + " настай";
}

/* Хэрэглэгчийн оруулсан утгыг шалгаж, engine-д ойлгомжтой хэлбэрт оруулна. */
function normalize(input) {
  const i = input || {};
  const price = num(i.price), cost = num(i.cost);
  let margin = num(i.margin);
  if (price && cost && cost < price) margin = Math.round((price - cost) / price * 100);
  margin = Math.min(95, Math.max(1, margin || 40));
  const aud = {
    ages: list(i.ages, AGES),
    gender: GENDERS[i.gender] ? i.gender : "all",
    locations: list(i.locations, Object.keys(LOCATIONS)),
    interests: str(i.interests, 200)
  };
  const parts = [];
  const at = ageText(aud.ages);
  if (at || i.gender) parts.push((at ? at + " " : "") + GENDERS[aud.gender]);
  if (aud.locations.length) parts.push(aud.locations.map(l => LOCATIONS[l]).join(", "));
  if (aud.interests) parts.push("сонирхол: " + aud.interests);
  const uspKey = str(i.usp, 40);
  const usp = uspKey === "other" ? str(i.uspOther, 200) : (USP_OPTS[uspKey] ? USP_OPTS[uspKey].text : "");
  return {
    product: str(i.product, 120),
    cat: CATS[i.cat] ? i.cat : "",
    price, cost, margin, marginKnown: !!(price && cost && cost < price) || num(i.margin) > 0,
    aud, audience: parts.join("; "),
    stage: STAGES[i.stage] ? i.stage : "some",
    reasons: list(i.reasons, Object.keys(REASONS)),
    pf: list(i.pf, Object.keys(PF)),
    channels: list(i.channels, Object.keys(CHANNELS)),
    goals: list(i.goals, Object.keys(GOALS)),
    budget: num(i.budget),
    capacity: ["solo", "small", "team"].includes(i.capacity) ? i.capacity : "small",
    usp
  };
}

function validate(d) {
  if (!d.product) return "Бүтээгдэхүүний нэрээ бичнэ үү.";
  if (!d.cat) return "Ангилалаа сонгоно уу.";
  return null;
}

/* Зарын менежерт шууд оруулах хэлбэрээр: Нас · Хүйс · Байршил · Сонирхол */
function targeting(a) {
  const ages = a.ages.length ? a.ages.map(x => x.replace("-", "–")).join(", ") : "18–54 (ерөнхий)";
  const g = {female:"Эмэгтэй", male:"Эрэгтэй", all:"Бүгд"}[a.gender];
  const loc = a.locations.length ? a.locations.map(l => LOCATIONS[l]).join(", ") : "Монгол даяар";
  return "Нас: " + ages + " · Хүйс: " + g + " · Байршил: " + loc + " · Сонирхол: " + (a.interests || "бүтээгдэхүүнд хамааралтай 3–5 сонирхол");
}

function build(d){
  const cat = CATS[d.cat], kind = KINDS[cat.kind];
  const channels = d.channels.length ? d.channels : ["messenger"];
  const goals = d.goals.length ? d.goals : ["sales"];
  const chan = CHANNELS[channels[0]], stage = STAGES[d.stage];
  const chanLabel = channels.map(c => CHANNELS[c].label).join(", ");
  const chanCTA = channels.length === 1 ? CHANNELS[channels[0]].cta
    : channels.map(c => CHANNELS[c].short).join(" эсвэл ") + ".";
  const chanShort = channels.map(c => CHANNELS[c].short).join(" эсвэл ");
  const chanObj = channels.length === 1 ? CHANNELS[channels[0]].obj : channels.map(c => CHANNELS[c].obj).join(", ");
  const goalLabel = goals.map(g => GOALS[g]).join(", ");
  const now = new Date();
  const season = {month: now.getMonth() + 1, label: SEASON[now.getMonth()][0], tip: SEASON[now.getMonth()][1]};
  const m = d.margin, price = d.price, B = d.budget;

  const offer = goals.includes("repeat") ? "давтан авалтад тусгай үнэ эсвэл багц" : kind.offer;
  const priceText = price ? fmt(price) : "[үнэ]";
  const reasonNotes = (d.reasons || []).filter(k => REASONS[k]).map(k => ({t: REASONS[k].label, d: REASONS[k].diag + " " + REASONS[k].tip}));

  /* platforms */
  let selected = d.pf.length ? d.pf.slice() : cat.platforms.slice(0, 1);
  const order = cat.platforms.concat(Object.keys(PF).filter(x => cat.platforms.indexOf(x) < 0));
  selected.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  const pfRows = selected.map((k, i) => ({key:k, name:PF[k].n, role:PF[k].r,
    level: i === 0 ? "Үндсэн" : i === 1 ? "Туслах" : "Дахин ашиглах"}));
  const pfNotes = [];
  if (selected.length > 2) pfNotes.push("Эхний 30 хоногт 3–4 платформыг нэг зэрэг сайн хийхэд хэцүү. Үндсэн ба туслах гэсэн 2 платформд төвлөр, бусад дээр нэг бичлэгээ дахин ашигла.");
  if (selected.length === 1) pfNotes.push("Нэг платформ дээр төвлөрөх нь эхлэлд зөв. Бичлэгээ бусад платформд дахин нийтэлж үзэж болно.");
  if (cat.kind === "b2b") pfNotes.push("Байгууллагад зарах үед Facebook групп, шууд мессеж, лавлагаа илүү үр дүнтэй. Гоо зүйн контентоос каталог, тооцоо чухал.");
  if (channels.includes("messenger")) pfNotes.push("Захиалгаа Messenger, DM-ээр авдаг тул автомат мэдэгдэл, бэлэн хариулт, хариуны хурд зарын төсвөөс ч илүү чухал.");
  if (channels.includes("web")) pfNotes.push("Вэбсайтаар захиалга авдаг бол зар ажиллуулахаас өмнө Pixel, худалдан авалтын хэмжилтээ тохируул.");
  const primary = pfRows[0].key;
  const hasShort = selected.indexOf("tiktok") >= 0 || selected.indexOf("instagram") >= 0;
  const videoName = hasShort ? "Reels, TikTok бичлэг (15–30 сек)" : "Facebook Reels, богино бичлэг (15–30 сек)";

  /* focus */
  let focus = reasonNotes.slice(0, 2);
  if (B === 0) focus.push(ZERO_FOCUS);
  goals.forEach(g => { if (GOAL_FOCUS[g] && !focus.some(f => f.t === GOAL_FOCUS[g].t)) focus.push(GOAL_FOCUS[g]); });
  kind.focus.forEach(f => { if (!focus.some(x => x.t === f.t)) focus.push(f); });
  focus = focus.slice(0, 4);

  /* assumptions */
  const assumptions = [];
  assumptions.push(d.audience ? "Зорилтот хэрэглэгч: " + d.audience : "Зорилтот хэрэглэгчийг оруулаагүй тул ерөнхий таамаглал ашиглав. Тодорхой болгосноор hook, зарын аудитори оновчтой болно.");
  assumptions.push(price ? "Нэгж үнэ " + fmt(price) + ", зарын өмнөх ашгийн хувь " + m + "%" + (d.cost ? " (өртөг " + fmt(d.cost) + ")." : d.marginKnown ? "." : " (ашгийг оруулаагүй тул 40% гэж таамаглав).") : "Нэгж үнэ оруулаагүй тул ашиг тэнцэх CPA-г тооцож чадсангүй.");
  assumptions.push("Ангиллын төрөл: " + kind.name + ". Энэ төрөлд тохирсон стратегийг сонгосон.");
  if (d.usp) assumptions.push("Давуу тал: " + d.usp + ". Hook болон санал дээр энийг тодруулж ашигласан.");
  assumptions.push("Нийтлэх цаг нь эхлэлийн таамаглал. 2 долоо хоногийн дараа өөрийн Insights-ийн өгөгдлөөр засна.");

  /* hooks */
  const p = d.product;
  const hooks = [];
  if (d.usp) hooks.push({type:"Давуу тал", text:cap(d.usp) + " — " + p + "-г бусдаас ялгаж байгаа гол шалтгаан.", use:"Профайлын тайлбар; зарын гарчиг; бичлэгийн эхний секунд"});
  hooks.push(
    {type:"Асуудал", text:"Хэрэв " + cat.pain + " бол энийг эцэс хүртэл үзээрэй.", use:"Reels, TikTok-ийн эхний 1–3 секунд; зарын эхний мөр"},
    {type:"Алдаа", text:"Олон хүн " + cat.mistake + " алдаа гаргадаг.", use:"Сургах бичлэг, carousel-ийн нүүр"},
    {type:"Эргэлзээ", text:"«" + cap(cat.objection) + "?» Хамгийн их асуудаг асуултад хариулъя.", use:"Пүрэв гарагийн пост; зарын гарчиг"},
    {type:"Нотолгоо", text:p + " — бодит хэрэглэгч юу гэж хэлсэн бэ?", use:"Нотолгооны пост; warm аудиторийн зар"},
    {type:"Шалгуур", text:p + " сонгохоосоо өмнө энэ 3 зүйлийг шалгаарай.", use:"Carousel, Facebook пост"},
    {type:"Шударга байдал", text:p + " танд тохирохгүй байж болох 3 тохиолдол.", use:"Итгэл бий болгох пост; шинэ брэндэд онцгой сайн"},
    {type:"Ард талын түүх", text:"Ард нь юу байдгийг харуулъя: " + p + " хэрхэн бэлтгэгддэг вэ?", use:"Story, Reels"},
    {type:"Санал", text:"Энэ долоо хоногт: " + offer + ". [Үнэн хугацаа эсвэл тоо] дуусахаас өмнө мэдээлэл аваарай.", use:"Баасан гарагийн пост; hot аудиторийн зар"},
    {type:"Харьцуулалт", text:p + " ба ердийн сонголтын ялгаа яг юунд байна вэ?", use:"Харьцуулалтын бичлэг, YouTube"},
    {type:"Бодит хэрэглээ", text:"Бодит хугацаагаар: " + cat.demo + ".", use:"Reels, TikTok; live-ийн танилцуулга"},
    {type:"Улирал", text:season.label + ": " + p + " хэзээ захиалбал зөв вэ?", use:"Улирлын постууд; зарын гарчиг"}
  );

  /* days */
  const cap_ = d.capacity;
  const lvl = {
    solo:["main","light","main","light","main","light","light"],
    small:["main","light","main","main","main","live","light"],
    team:["main","main","main","main","main","live","main"]
  }[cap_];
  const close = CLOSE, cta = chanCTA, ctaS = chanShort;
  const H = type => (hooks.find(h => h.type === type) || {}).text || "";
  const H_MISTAKE = H("Алдаа"), H_PROOF = H("Нотолгоо"), H_OBJECTION = H("Эргэлзээ"), H_OFFER = H("Санал");
  const trend = cat.kind === "trend";

  const defs = [
    {day:"Даваа", pillar:"Сургах", time:"20:00–22:00", boost:"Cold",
      format:videoName, isVideo:true, hook:H_MISTAKE, scriptLabel:"Бичлэгийн бүтэц",
      script:[
        "Hook (0–3 сек): " + H_MISTAKE,
        "Асуудал (3–8 сек): Үзэгч өөрийгөө таних нөхцөлийг нэг өгүүлбэрээр хэл. Жишээ нь: «" + cap(cat.pain) + "»",
        "Шийдэл (8–20 сек): Бүтээгдэхүүнээ ашиглан бодитоор харуул: " + cat.demo,
        "Нотолгоо (20–25 сек): Нэг нотолгоо үзүүл: " + cat.proof,
        "CTA (25–30 сек): " + ctaS
      ],
      caption:H_MISTAKE + "\n\nҮүнээс сэргийлэх 3 алхам:\n1) [Алхам 1]\n2) [Алхам 2]\n3) [Алхам 3]\n\nЭнэ хэсэгт " + p + " хэрхэн тусалдгийг бичлэгээс үзээрэй.\n" + cta,
      light:null},
    {day:"Мягмар", pillar:"Дотно, түүх", time:"12:00–13:00",
      format:"Пост ба Story: ажлын өрөөний өдөр", hook:"Өнөөдөр манай ажлын өрөөнөөс.",
      script:null,
      caption:"Өнөөдөр манай ажлын өрөөнөөс.\n[Юу хийж байгаагаа 1–2 өгүүлбэрээр хэл]\n\n" + p + " — яагаад эхлүүлсэн бэ? [Өөрийн товч түүх, 2–3 өгүүлбэр]\n" + close,
      light:"Story 2–3 хэсэг: ажлын өрөө эсвэл бэлтгэлийн явц, нэг асуултын sticker."},
    {day:"Лхагва", pillar:"Нотлох", time:"20:00–22:00", boost:"Warm",
      format:(trend && cap_ === "solo") ? videoName : "Carousel эсвэл пост: бодит сэтгэгдэл", isVideo:(trend && cap_ === "solo"), hook:H_PROOF, scriptLabel:"Слайдын бүтэц",
      script:[
        "Слайд 1: " + H_PROOF,
        "Слайд 2–4: Бодит сэтгэгдлийн дэлгэцийн зураг эсвэл хэрэглээний зураг (эзний зөвшөөрөлтэй)",
        "Слайд 5: Нотолгооны нэг тоо эсвэл баталгаа: " + cat.proof,
        "Слайд 6: " + ctaS
      ],
      caption:H_PROOF + "\n\n«[Хэрэглэгчийн бодит сэтгэгдэл]» — [Нэр, зөвшөөрөлтэй]\n\nСэтгэгдлийг өөрчлөөгүй, эзнийх нь зөвшөөрлөөр нийтэллээ. Та бидний бүтээгдэхүүнийг туршсан бол туршлагаа илгээгээрэй.\n" + cta,
      light:null},
    {day:"Пүрэв", pillar:"Сургах", time:"12:00–13:00",
      format:(trend && cap_ !== "solo") ? videoName : "Carousel эсвэл пост: сонгох зөвлөгөө", isVideo:(trend && cap_ !== "solo"), hook:H_OBJECTION, scriptLabel:"Слайдын бүтэц",
      script:[
        "Слайд 1: " + H_OBJECTION,
        "Слайд 2: Эргэлзээ: " + cat.objection,
        "Слайд 3–5: Сонгохын өмнө шалгах 3 шалгуур",
        "Слайд 6: " + ctaS
      ],
      caption:H_OBJECTION + "\n\nСонгохын өмнө шалгах 4 зүйл:\n1) [Шалгуур 1]\n2) [Шалгуур 2]\n3) [Шалгуур 3]\n4) [Шалгуур 4]\n\nНэмэлт асуулт байвал доор бичээрэй, хариулна.\n" + cta,
      light:"Story: санал асуулга («Аль нь танд илүү хэрэгтэй вэ?»). Хариулт нь дараагийн контентын санаа болно."},
    {day:"Баасан", pillar:"Борлуулах", time:"19:00–21:00", boost:"Hot",
      format:"Санал бүхий пост ба Story", hook:H_OFFER, script:null,
      caption:H_OFFER + "\n\nЭнэ долоо хоногийн санал: " + offer + ".\nХэнд тохирох: [1 өгүүлбэр]\nЮу багтсан: [жагсаалт]\nҮнэ: " + priceText + "\nХүргэлт, төлбөр: [хугацаа, QPay эсвэл банк]\nХугацаа эсвэл тоо: [үнэн хугацаа, үлдэгдэл]\n" + cta,
      light:null},
    {day:"Бямба", pillar:"Дотно, түүх", time:"20:00",
      format:"Live: асуулт хариулт (20–30 минут)", hook:"Live: " + p + "-ийн талаарх асуултад хариулна.", isLive:true, scriptLabel:"Live-ийн бүтэц",
      script:[
        "0–3 мин: Тавтай морилно уу. Өнөөдөр юу ярихаа товч хэл.",
        "3–10 мин: Бодитоор харуул: " + cat.demo,
        "10–20 мин: Урьдчилан цуглуулсан асуултууд. Заавал хариулах нэг нь: " + cat.objection,
        "20–25 мин: Долоо хоногийн санал (" + offer + "), төлбөр, хүргэлтийн нөхцөл",
        "25–30 мин: " + ctaS
      ],
      caption:"Бямба гарагийн Live — 20:00.\nЯрих сэдэв: " + cat.demo + ".\nАсуултаа урьдчилан коммент хэсэгт бичээрэй, live дээр хариулна.\n" + close,
      light:"Story: 5 минутын асуулт хариулт (Questions sticker). Хариултаа Story-оор өг."},
    {day:"Ням", pillar:"Нотлох, дүгнэлт", time:"19:00–21:00",
      format:"Пост: 7 хоногийн дүгнэлт", hook:"Энэ 7 хоногт хамгийн их асуусан 3 асуулт. Хариулъя.", script:null,
      caption:"Энэ 7 хоногт хамгийн их асуусан 3 асуулт. Хариулъя.\n1) [Асуулт 1 ба хариулт]\n2) [Асуулт 2 ба хариулт]\n3) [Асуулт 3 ба хариулт]\n\nЗахиалагчиддаа баярлалаа. Та бүтээгдэхүүнээ хэрэглэсэн бол зураг, сэтгэгдлээ илгээвэл (зөвшөөрөлтэйгөөр) манай хуудсанд нийтэлнэ.",
      light:"Story: захиалагчдад талархал, зураг ба сэтгэгдэл хүсэх (UGC)."}
  ];
  const days = defs.map((x, i) => {
    let level = lvl[i];
    if (level === "live" && !x.isLive) level = "main";
    if (x.isLive && level !== "live") level = "light";
    const o = Object.assign({}, x, {level:level, cta:cta});
    if (level === "light") { o.format = "Story"; o.script = null; o.caption = null; o.isVideo = false; o.boost = null; o.hookShown = false; }
    return o;
  });
  const cMain = days.filter(x => x.level === "main").length;
  const cLive = days.filter(x => x.level === "live").length;
  const cLight = days.filter(x => x.level === "light").length;
  const cVideo = days.filter(x => x.isVideo && x.level !== "light").length;
  const counts = {total:cMain + cLive, video:cVideo, live:cLive, story:cLight, post:cMain - cVideo};

  /* budget */
  const be = {m:m, roas:100 / m, price:price};
  if (price) {
    be.gp = price * m / 100;
    be.orders = B ? Math.ceil(B / be.gp) : 0;
  }
  let split = null, rows = [];
  if (B > 0) {
    split = B < 300000 ? {cold:.5, warm:.4, hot:0, test:.1}
          : B < 1000000 ? {cold:.45, warm:.25, hot:.2, test:.1}
          : B < 3000000 ? {cold:.40, warm:.25, hot:.2, test:.15}
          : {cold:.40, warm:.25, hot:.15, test:.2};
    const W = B / 4;
    const aud = {
      cold:targeting(d.aud) + ". Өгөгдөл хангалттай болсны дараа look-alike нэм.",
      warm:"Сүүлийн 30–60 хоногт бичлэг үзсэн (50%-иас дээш), Page эсвэл Instagram-тай харьцсан хүмүүс.",
      hot:"Messenger-ээр асуусан, сайтад зочилсон, сагсанд хийсэн хүмүүс (14 хоног).",
      test:"Ижил үзэгчид, 2 өөр creative. Нэг удаад зөвхөн нэг хувьсагчийг өөрчил."
    };
    rows.push({post:"Даваа: сургах бичлэг", goal:"Бичлэг үзэлт эсвэл хүрэлт", aud:aud.cold, amt:W * split.cold, temp:"Cold"});
    if (split.hot === 0) {
      rows.push({post:"Лхагва: нотолгооны пост", goal:chanObj, aud:aud.warm + " " + aud.hot, amt:W * split.warm / 2, temp:"Warm"});
      rows.push({post:"Баасан: санал бүхий пост", goal:chanObj, aud:aud.warm + " " + aud.hot, amt:W * split.warm / 2, temp:"Warm, Hot"});
    } else {
      rows.push({post:"Лхагва: нотолгооны пост", goal:chanObj, aud:aud.warm, amt:W * split.warm, temp:"Warm"});
      rows.push({post:"Баасан: санал бүхий пост", goal:chanObj, aud:aud.hot, amt:W * split.hot, temp:"Hot"});
    }
    rows.push({post:"Туршилт: хамгийн сайн organic постын 2 хувилбар", goal:"Мессеж эсвэл үзэлт", aud:aud.test, amt:W * split.test, temp:"Test"});
    rows.forEach(r => { r.days = 3; });
  }

  /* weeks */
  const nContent = cap_ === "solo" ? "4–5" : cap_ === "small" ? "8–10" : "12–14";
  const w1 = [
    "Page, профайлын нүүр зураг, «Бидний тухай», холбоо барих, үнэ, төлбөр, хүргэлтийн мэдээллийг нэг дор бэлд.",
    "Мессежийн автомат мэдэгдэл ба 5–6 түгээмэл асуултын бэлэн хариулт бэлд (үнэ, хүргэлт, төлбөр, буцаалт, «" + cap(cat.objection) + "»).",
    "Нэг өдөр зураг, бичлэгээ бөөнөөр авч, эхний " + nContent + " контентыг бэлд.",
    "Захиалга хаанаас ирснийг бүртгэх энгийн хүснэгт үүсгэ." + (channels.includes("web") ? " Вэбсайтад Pixel болон худалдан авалтын хэмжилтээ тохируул." : "")
  ];
  const w2 = ["Дээрх 7 хоногийн бүтцээр контентоо тогтмол нийтэлж эхэл."];
  if (B > 0) w2.push("Туршилтын төсвөөр (" + fmt(B / 4 * split.test) + " орчим) 3 creative ба 2 аудиторийг туршина. Нэг удаад нэг хувьсагчийг л өөрчил.");
  else w2.push("Хөрш, сонирхолтой 3 Facebook групп эсвэл community-д борлуулалт биш, ашигтай контентоор оролцож эхэл.");
  w2.push("Нэг hook-той бичлэгийг 2 өөр эхлэлээр хийж аль нь илүү үзэлт авахыг харьцуул.");
  w2.push("Долоо хоногийн эцэст мессеж, хадгалалт, share авсан 2 постоо тэмдэглэ.");
  const w3 = [
    "Эхний худалдан авагчдаас сэтгэгдэл, зураг хүс (зөвшөөрөлтэйгөөр). 5-аас олон нотолгоо цуглуул.",
    cat.kind === "b2b" ? "1–2 хамтрагч байгууллагын жишээ, дээжийг кейс болгон бэлд." : "1–2 микро инфлюенсертэй туршилтын хамтын ажиллагаа хий. Хөнгөлтийн код эсвэл тусгай линк өгч, ивээн тэтгэсэн гэж тэмдэглүүл.",
    B > 0 ? "Retargeting эхлүүл: бичлэг үзсэн, мессеж бичсэн хүмүүст нотолгооны пост, саналаа үзүүл." : "Мессеж бичээд алга болсон хүнд 24–48 цагийн дотор нэг удаа зөөлөн сануул.",
    "Мессеж бичээд захиалаагүй хүмүүсийн шалтгааныг бич: үнэ, итгэл, хүргэлт. Дараагийн саналдаа тусга."
  ];
  const kw4 = {
    repeat:"Багц эсвэл давтан авалтын санал гарга, өмнөх худалдан авагчдад мессежээр сануул.",
    consider:"Баталгаа, туршиж үзэх нөхцөл, харьцуулалтын контентыг үндсэн саналдаа тодорхой оруул.",
    trend:"Хамгийн сайн үзэлттэй бичлэгийн хэв маягаар дараагийн 4 бичлэгээ хий.",
    gift:"Дараагийн баярын бэлгийн багц, хүргэлтийн эцсийн хугацааг төлөвлө.",
    b2b:"Үнийн санал, дээжийн урсгалыг стандарт болгож, 5–10 боломжит харилцагч руу шууд хандаарай."
  }[cat.kind];
  const w4 = [
    "Үр дүнг дүгнэ: CPA ба ROAS-ыг ашиг тэнцэх түвшинтэй (" + (price ? "CPA " + fmt(be.gp) + "-аас доош" : "ROAS " + be.roas.toFixed(1) + "-аас дээш") + ") харьцуул.",
    B > 0 ? "Ажилласан 1–2 hook, creative-ийн төсвийг 3 хоног тутам ойролцоогоор 20%-иар нэмэгдүүл (жишиг). Хангалттай өгөгдөл цуглаагүй зүйлийг хэдхэн цагт зогсоохгүй." : "Хамгийн сайн ажилласан постоо жижиг boost-оор (3 хоног, өдөрт 5,000–10,000₮ жишээтэй) туршиж эхэл.",
    kw4,
    "Дараа сарын төлөвлөгөө гарга. Улирлын боломж: " + season.label + "."
  ];
  const weeks = [
    {n:1, name:"Суурь", sub:"Бэлтгэл, хэмжилт", items:w1},
    {n:2, name:"Туршилт", sub:"Hook, creative, аудитори", items:w2},
    {n:3, name:"Нотолгоо", sub:"Итгэл, retargeting", items:w3},
    {n:4, name:"Өсгөх", sub:"Дүгнэлт, дараагийн сар", items:w4}
  ];

  /* metrics */
  const mt = [];
  if (goals.includes("sales")) {
    mt.push(["Захиалгын тоо ба эх сурвалж", "7 хоног тутам бүртгэ", "Аль суваг, пост захиалга авчирснаа мэдэхгүй бол өсгөх боломжгүй."]);
    mt.push(["CPA (нэг захиалгын зарын өртөг)", price ? "Ашиг тэнцэх дээд хязгаар " + fmt(be.gp) : "Нэгж үнэ оруулаад тооцоол", "Энэ хязгаараас хэтэрвэл зар алдагдалтай ажиллаж байна."]);
    mt.push(["ROAS", "Ашиг тэнцэх түвшин " + be.roas.toFixed(2), "Түүнээс бага бол зар ашиггүй; ихсэх тусам ашиг үлдэнэ."]);
  }
  if (goals.includes("awareness")) {
    mt.push(["Хүрэлт ба 3 секундын үзэлт", "Долоо хоног бүр өмнөхөөсөө өсөж байгаа эсэх", "Hook, эхний секундийн чанарыг харуулна."]);
    mt.push(["Дагагч болон Page-ийн өсөлт", "Долоо хоног тутам хэмж", "Шинэ хүмүүс сонирхож байгааг харуулна."]);
    mt.push(["Профайл руу зочилсон тоо", "Долоо хоног тутам хэмж", "Хараад сонирхсон хүний тоог харуулна."]);
  }
  if (goals.includes("repeat")) {
    mt.push(["Давтан худалдан авалтын хувь", "Сар бүр өөрийн суурь тоогоо тогтоо", "Урт хугацааны ашгийн хамгийн шууд үзүүлэлт."]);
    mt.push(["Дундаж захиалгын дүн (AOV)", "Багц оруулснаар сар бүр өсөж байгаа эсэх", "Ижил зардлаар илүү орлого өгөх боломжийг харуулна."]);
  }
  if (goals.includes("launch")) {
    mt.push(["Урьдчилсан захиалга, жагсаалтад бүртгүүлсэн тоо", "Танилцуулгаас өмнө болон эхний 2 долоо хоногт хэмж", "Шинэ бүтээгдэхүүнд эрэлт байгааг харуулна."]);
    mt.push(["Эхний 20 захиалга хүртэлх хугацаа", "Өөрийн эхний хугацааг тэмдэглэ", "Эхний сэтгэгдлүүдийг хэр хурдан цуглуулахыг заана."]);
  }
  mt.push(["Мессежийн хариу өгөх хугацаа", "Ажлын цагаар 5 минутаас бага (өөрийн стандарт болго)", "Олон хүн асуугаад захиалаагүй бол эхлээд энийг шалга."]);
  mt.push(["Хөрвүүлэлт: мессеж → захиалга", "2 долоо хоногт суурь тоогоо тогтоо, дараа нь өсгө", "Үнэ, итгэл, хариултын хурд, захиалгын алхмыг үнэлнэ."]);
  if (B > 0) mt.push(["Зарын CTR", "Эхлэлийн жишиг 1%-аас дээш (салбар бүрт өөр)", "Бага бол hook болон зургийг солиод дахин турш."]);

  /* cautions */
  const cautions = [
    "Хуурамч сэтгэгдэл, худал «хязгаарлагдмал» хугацаа, тоо, хуурамч хямдрал бүү ашигла. Богино хугацаанд ажилласан ч итгэлийг сүйтгэдэг.",
    "Инфлюенсертэй хамтарсан контентыг ивээн тэтгэсэн гэж тодорхой тэмдэглэ. Хэрэглэгчийн зураг, сэтгэгдлийг зөвшөөрөлтэйгөөр ашигла.",
    "Байнга хямдралаар борлуулбал бүтээгдэхүүний үнэ цэнэ буурдаг. Хямдрал тодорхой шалтгаантай (улирал, баяр, шинэ бүтээгдэхүүн) байг.",
    "Энэ төлөвлөгөө нь таамаглалд суурилсан. 2 долоо хоногийн бодит өгөгдлөөр засварла, «энэ зар борлуулалтыг заавал өсгөнө» гэж амла хэрэггүй."
  ];
  if (cat.reg) cautions.unshift("Энэ ангилалд эрүүл мэнд, гоо сайхны үр дүнгийн батлагдаагүй амлалт бүү бич (эмчилнэ, гарна гэх мэт). Монгол Улсын сурталчилгааны хууль болон платформын бодлогыг шалгаарай.");

  return {
    id:"MZ-" + String(now.getFullYear()).slice(2) + pad(now.getMonth() + 1) + "-" + require("crypto").randomInt(1000, 10000),
    dateStr:now.getFullYear() + "." + pad(now.getMonth() + 1) + "." + pad(now.getDate()),
    d:d, cat:cat, kind:kind, stage:stage, chan:chan, chanLabel:chanLabel, goalLabel:goalLabel, season:season,
    diagnosis:stage.txt, focus:focus, reasonNotes:reasonNotes, assumptions:assumptions, pfRows:pfRows, pfNotes:pfNotes, primary:primary,
    days:days, counts:counts, hooks:hooks, B:B, split:split, rows:rows, be:be, weeks:weeks, metrics:mt, cautions:cautions
  };
}

module.exports = {build, normalize, validate, fmt, cap, LOCATIONS, GENDERS};
