"use strict";
/* Үнэгүй AI үйлчилгээнүүд. Бүгд OpenAI-тэй ижил /chat/completions API-тай тул нэг
 * клиентээр дуудна. AI_PROVIDERS-ийн дарааллаар, үйлчилгээ бүрийн дотор
 * *_MODEL-д таслалаар бичсэн загваруудыг дарааллаар оролдоно. Үнэгүй загварууд
 * ачаалал ихтэй үед 503/429 өгдөг тул нэг загвараас хамаарахгүй байх нь чухал. */

const list = (v, def) => (v || def).split(",").map(s => s.trim()).filter(Boolean);

const PROVIDERS = {
  gemini: {
    url: () => "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    key: () => process.env.GEMINI_API_KEY,
    /* flash-lite нь хурдан (~10 сек), монгол хэл сайн; flash нь ачаалал ихтэй үед 503 өгдөг. */
    models: () => list(process.env.GEMINI_MODEL, "gemini-flash-lite-latest,gemini-3.5-flash,gemini-flash-latest"),
    /* Бодох токеноо max_tokens-оос зарцуулж JSON тасрахаас сэргийлнэ. */
    extra: {reasoning_effort: "low"}
  },
  groq: {
    url: () => "https://api.groq.com/openai/v1/chat/completions",
    key: () => process.env.GROQ_API_KEY,
    models: () => list(process.env.GROQ_MODEL, "llama-3.3-70b-versatile")
  },
  openrouter: {
    url: () => "https://openrouter.ai/api/v1/chat/completions",
    key: () => process.env.OPENROUTER_API_KEY,
    models: () => list(process.env.OPENROUTER_MODEL, "meta-llama/llama-3.3-70b-instruct:free")
  },
  ollama: {
    /* Өөрийн компьютер дээр ажиллах тул түлхүүр хэрэггүй; OLLAMA_URL тохируулбал идэвхжинэ. */
    url: () => (process.env.OLLAMA_URL || "").replace(/\/$/, "") + "/v1/chat/completions",
    key: () => process.env.OLLAMA_URL ? "ollama" : "",
    models: () => list(process.env.OLLAMA_MODEL, "qwen2.5:7b")
  }
};

function enabledProviders() {
  return list(process.env.AI_PROVIDERS, "gemini,groq,openrouter,ollama").filter(n => PROVIDERS[n] && PROVIDERS[n].key());
}

/* Загвар заримдаа ```json ... ``` эсвэл тайлбартай буцаадаг тул эхний {...}-г гаргаж авна. */
function parseJson(text) {
  const t = String(text || "").replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  try { return JSON.parse(t); } catch (e) { /* доорх аргаар оролдоно */ }
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a < 0 || b <= a) throw new Error("JSON биш хариу");
  const body = t.slice(a, b + 1);
  try { return JSON.parse(body); } catch (e) { return JSON.parse(repairJson(body)); }
}

/* Загварууд заримдаа // тайлбар, илүү таслал (…,}) нэмдэг. Мөр (string) доторхыг хөндөхгүйгээр хасна. */
function repairJson(s) {
  let out = "", inStr = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      out += c;
      if (c === "\\") { out += s[++i] || ""; continue; }
      if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; out += c; continue; }
    if (c === "/" && s[i + 1] === "/") { while (i < s.length && s[i] !== "\n") i++; continue; }
    out += c;
  }
  return out.replace(/,(\s*[}\]])/g, "$1");
}

async function callOne(name, model, messages, opts) {
  const p = PROVIDERS[name];
  const body = Object.assign({
    model, messages,
    temperature: opts.temperature, max_tokens: opts.maxTokens,
    response_format: {type: "json_object"}
  }, p.extra);
  const send = b => fetch(p.url(), {
    method: "POST",
    headers: {"Content-Type": "application/json", "Authorization": "Bearer " + p.key()},
    body: JSON.stringify(b),
    signal: AbortSignal.timeout(opts.timeoutMs)
  });
  let res = await send(body);
  /* Зарим загвар response_format/reasoning_effort-ийг дэмждэггүй: түүнгүйгээр нэг удаа дахин оролдоно. */
  if (res.status === 400) {
    delete body.response_format; for (const k in p.extra) delete body[k];
    res = await send(body);
  }
  if (!res.ok) throw new Error(name + "/" + model + " " + res.status + ": " + (await res.text()).slice(0, 160).replace(/\s+/g, " "));
  const json = await res.json();
  const choice = json.choices && json.choices[0];
  if (choice && choice.finish_reason === "length") throw new Error(name + "/" + model + ": хариу тасарсан (max_tokens)");
  try { return parseJson(choice && choice.message && choice.message.content); }
  catch (e) { throw new Error(name + "/" + model + ": буруу JSON (" + e.message + ")"); }
}

/* opts.accept(data) нь хариуг шалгаж, тохирохгүй бол алдаа шиднэ: тэгвэл дараагийн загвар руу шилжинэ. */
async function chatJson(messages, opts) {
  const o = Object.assign({temperature: 0.9, maxTokens: 8000, totalMs: Number(process.env.AI_TIMEOUT_MS) || 90000, accept: d => d}, opts);
  /* Бүх загварт нийт нэг хугацаа: хэрэглэгч хязгааргүй хүлээхгүй. */
  const deadline = Date.now() + o.totalMs;
  const errors = [];
  const pairs = [];
  for (const name of enabledProviders()) for (const model of PROVIDERS[name].models()) pairs.push([name, model]);
  /* 503 ачаалал ихэвчлэн хэдхэн секунд үргэлжилдэг тул бүгд бүтэлгүйтвэл хугацаа үлдсэн бол нэг удаа дахин тойрно. */
  for (let round = 0; round < 2 && pairs.length; round++) {
    if (round) await new Promise(r => setTimeout(r, 2000));
    for (const [name, model] of pairs) {
      const left = deadline - Date.now();
      if (left < 5000) { errors.push("нийт хугацаа дууссан"); round = 2; break; }
      const t = Date.now();
      try {
        const data = await callOne(name, model, messages, Object.assign({}, o, {timeoutMs: left}));
        try { return {provider: name, model, ms: Date.now() - t, result: o.accept(data)}; }
        catch (e) { throw new Error(name + "/" + model + ": " + e.message); }
      } catch (e) {
        const msg = e.name === "TimeoutError" ? name + "/" + model + ": хугацаа хэтэрсэн" : e.message;
        errors.push(msg); console.warn("[ai] " + msg);
      }
    }
  }
  const err = new Error(errors.length ? errors.join(" | ") : "AI үйлчилгээ тохируулаагүй");
  err.code = errors.length ? "AI_FAILED" : "AI_DISABLED";
  throw err;
}

module.exports = {chatJson, enabledProviders, parseJson};
