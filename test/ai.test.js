"use strict";
/* AI давхаргыг жинхэнэ түлхүүргүйгээр шалгана: OpenAI-тэй ижил API-тай хуурамч
 * серверийг Ollama гэж тохируулж ажиллуулна. */
const test = require("node:test");
const assert = require("node:assert");
const http = require("http");

const engine = require("../server/engine/build");

function mockServer(reply) {
  return new Promise(resolve => {
    const srv = http.createServer((req, res) => {
      let b = ""; req.on("data", c => b += c);
      req.on("end", () => {
        srv.lastBody = JSON.parse(b);
        res.writeHead(200, {"Content-Type": "application/json"});
        res.end(JSON.stringify({choices: [{message: {content: typeof reply === "string" ? reply : JSON.stringify(reply)}}]}));
      });
    });
    srv.listen(0, () => resolve(srv));
  });
}

const answers = {product: "Гар саван", cat: "beauty", price: 18000, cost: 8000, ages: ["25-34", "35-44"], gender: "female",
  locations: ["ub"], pf: ["facebook"], channels: ["messenger"], goals: ["sales"], budget: 500000, capacity: "solo"};

test("normalize: нас, хүйс, байршлыг нэгтгэж, өртгөөс ашгийг тооцно", () => {
  const d = engine.normalize(answers);
  assert.strictEqual(d.audience, "25–44 настай эмэгтэйчүүд; Улаанбаатар");
  assert.strictEqual(d.margin, 56);
  assert.strictEqual(engine.normalize({ages: ["13-17", "45-54", "55+"]}).audience, "13–17, 45+ настай эрэгтэй, эмэгтэй хүмүүс");
  assert.deepStrictEqual(engine.normalize({ages: ["bad"], cat: "x"}).aud.ages, []);
});

test("enhance: AI-ийн хариуг нэгтгэж, буруу талбарт загварын утгаа үлдээнэ", async () => {
  const plan = engine.build(engine.normalize(answers));
  const fallbackCaption = plan.days[0].caption;
  const days = plan.days.map(x => x.level === "light" ? {day: x.day, light: "Өнөөдрийн Story санаа энд байна."}
    : {day: x.day, hook: "AI hook " + x.day, caption: x.day === "Даваа" ? "богино" : "AI-аар бичсэн бэлэн текст " + x.day + " — хангалттай урт байх ёстой тул нэмж бичив.", script: null});
  const srv = await mockServer("```json\n" + JSON.stringify({
    diagnosis: "AI оношилгоо: таны бизнест итгэл дутагдаж байгаа нь борлуулалтыг хязгаарлаж байна.",
    focus: [{t: "Нэг", d: "Эхний чухал алхмын тайлбар энд."}, {t: "Хоёр", d: "Хоёр дахь чухал алхмын тайлбар."}],
    hooks: Array.from({length: 10}, (_, i) => ({type: "Асуудал", text: "AI hook өгүүлбэр " + i, use: "Reels"})),
    days
  }) + "\n```");
  process.env.AI_PROVIDERS = "ollama";
  process.env.OLLAMA_URL = "http://localhost:" + srv.address().port;
  try {
    const {enhance} = require("../server/ai/enhance");
    const r = await enhance(plan);
    assert.strictEqual(r.provider, "ollama");
    assert.match(plan.diagnosis, /^AI оношилгоо/);
    assert.strictEqual(plan.hooks.length, 10);
    assert.strictEqual(plan.days[0].caption, fallbackCaption, "хэт богино caption-ийг хүлээж авахгүй");
    assert.match(plan.days[2].caption, /^AI-аар бичсэн/);
    assert.ok(srv.lastBody.messages[1].content.includes("Гар саван"));
  } finally { srv.close(); }
});

test("чанарын шалгалт: гадаад үсэг, англи текст, хориотой амлалт, script шошго", () => {
  const {merge} = require("../server/ai/enhance");
  const plan = engine.build(engine.normalize(answers));   /* гоо сайхан = зохицуулалттай ангилал */
  const orig = plan.days.map(x => x.caption);
  const long = " — энэ өгүүлбэр шалгалтад хангалттай урт байхаар нэмж бичсэн монгол текст юм.";
  const ai = {days: [
    {day: "Даваа", hook: "Хятад үсэгтэй hook", caption: "Арьсыг刺激 хийхгүй" + long, script: ["Эхлэл хэсэгт юу хэлэх", "Асуудлыг тайлбарлах", "Шийдлийг харуулах", "Нотолгоо үзүүлэх", "Hook (0–3 сек): Захиалах заавар хэлэх"]},
    {day: "Мягмар", light: "This is an English story idea for the day"},
    {day: "Лхагва", hook: "Сайн hook байна", caption: "Энэ саван арьсыг 100% эмчилнэ" + long},
    {day: "Баасан", hook: "Сайн hook байна", caption: "Зөв монгол текст" + long}
  ]};
  merge(plan, ai);
  assert.strictEqual(plan.days[0].caption, orig[0], "хятад үсэгтэй текстийг хүлээж авахгүй");
  assert.notStrictEqual(plan.days[1].light, "This is an English story idea for the day");
  assert.strictEqual(plan.days[2].caption, orig[2], "гоо сайхны ангилалд «эмчилнэ» гэж амлахгүй");
  assert.match(plan.days[4].caption, /^Зөв монгол текст/);

  const p2 = engine.build(engine.normalize(answers));
  merge(p2, {days: [{day: "Даваа", hook: "Сайн hook байна", caption: "Зөв монгол текст" + long,
    script: ["1. Hook (0–3 сек): Эхлэл хэсэгт юу хэлэх", "Асуудлыг тайлбарлах", "Шийдлийг харуулах", "Нотолгоо үзүүлэх", "Захиалах заавар хэлэх"]}]});
  assert.strictEqual(p2.days[0].script[0], "Hook (0–3 сек): Эхлэл хэсэгт юу хэлэх", "давхардсан шошго, дугаарыг хасна");
  assert.strictEqual(p2.days[0].script[4], "CTA (25–30 сек): Захиалах заавар хэлэх", "шошгыг код өөрөө нэмнэ");
});
