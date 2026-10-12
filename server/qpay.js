"use strict";
/* QPay v2 merchant API. Нууц мэдээлэл (username/password/invoice_code) зөвхөн
 * сервер дээр .env-д хадгалагдана, браузер руу хэзээ ч очихгүй. */

const base = () => (process.env.QPAY_BASE_URL || "https://merchant.qpay.mn").replace(/\/$/, "");
const configured = () => !!(process.env.QPAY_USERNAME && process.env.QPAY_PASSWORD && process.env.QPAY_INVOICE_CODE);

let token = null, tokenExp = 0;

async function auth() {
  if (token && Date.now() < tokenExp) return token;
  const basic = Buffer.from(process.env.QPAY_USERNAME + ":" + process.env.QPAY_PASSWORD).toString("base64");
  const res = await fetch(base() + "/v2/auth/token", {
    method: "POST", headers: {"Authorization": "Basic " + basic}, signal: AbortSignal.timeout(15000)
  });
  if (!res.ok) throw new Error("QPay auth " + res.status);
  const j = await res.json();
  token = j.access_token;
  /* expires_in нь секундээр ирдэг; 1 минутын өмнө шинэчилнэ. */
  tokenExp = Date.now() + Math.max(60, (Number(j.expires_in) || 3600) - 60) * 1000;
  return token;
}

async function call(path, body) {
  const res = await fetch(base() + path, {
    method: "POST",
    headers: {"Authorization": "Bearer " + await auth(), "Content-Type": "application/json"},
    body: JSON.stringify(body), signal: AbortSignal.timeout(15000)
  });
  if (res.status === 401) { token = null; }
  if (!res.ok) throw new Error("QPay " + path + " " + res.status + ": " + (await res.text()).slice(0, 200));
  return res.json();
}

function createInvoice({planKey, amount, description, callbackUrl}) {
  return call("/v2/invoice", {
    invoice_code: process.env.QPAY_INVOICE_CODE,
    sender_invoice_no: planKey,
    invoice_receiver_code: "terminal",
    invoice_description: description,
    amount, callback_url: callbackUrl
  });
}

/* Төлбөр орсон эсэхийг QPay-ээс өөрөөс нь шалгана (callback-д шууд итгэхгүй). */
async function isPaid(invoiceId, amount) {
  const r = await call("/v2/payment/check", {
    object_type: "INVOICE", object_id: invoiceId, offset: {page_number: 1, page_limit: 100}
  });
  const paid = (r.rows || []).filter(x => x.payment_status === "PAID")
    .reduce((sum, x) => sum + Number(x.payment_amount || 0), 0);
  return paid >= amount || Number(r.paid_amount || 0) >= amount;
}

module.exports = {configured, createInvoice, isPaid};
