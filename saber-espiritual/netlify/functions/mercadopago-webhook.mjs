import crypto from "node:crypto";
import { handleError, json, rest, selectOne } from "./_lib.mjs";

function validSignature(request, dataId) {
  const secret = process.env.MERCADO_PAGO_WEBHOOK_SECRET;
  if (!secret) return false;
  const signature = request.headers.get("x-signature") || "";
  const requestId = request.headers.get("x-request-id") || "";
  const parts = Object.fromEntries(signature.split(",").map(part => part.trim().split("=")));
  if (!parts.ts || !parts.v1 || !requestId || !dataId) return false;
  const manifest = `id:${String(dataId).toLowerCase()};request-id:${requestId};ts:${parts.ts};`;
  const expected = crypto.createHmac("sha256", secret).update(manifest).digest("hex");
  const received = Buffer.from(parts.v1, "utf8");
  const calculated = Buffer.from(expected, "utf8");
  return received.length === calculated.length && crypto.timingSafeEqual(received, calculated);
}

export default async request => {
  try {
    if (request.method !== "POST") return json({ ok: true });
    const url = new URL(request.url);
    const body = await request.json().catch(() => ({}));
    const type = body.type || url.searchParams.get("type") || url.searchParams.get("topic");
    const dataId = body.data?.id || url.searchParams.get("data.id") || url.searchParams.get("id");
    if (!dataId || !["payment", "payments"].includes(type)) return json({ ok: true });
    if (!validSignature(request, dataId)) return json({ error: "Assinatura inválida." }, 401);

    const paymentResponse = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(dataId)}`, { headers: { Authorization: `Bearer ${process.env.MERCADO_PAGO_ACCESS_TOKEN}` } });
    const payment = await paymentResponse.json();
    if (!paymentResponse.ok) throw Object.assign(new Error("Não foi possível confirmar o pagamento."), { status: 502 });
    const internalId = payment.external_reference || payment.metadata?.internal_payment_id;
    if (!internalId) return json({ ok: true });
    const stored = await selectOne(`payments?id=eq.${encodeURIComponent(internalId)}&select=*`);
    if (!stored) return json({ ok: true });

    const approved = payment.status === "approved";
    const amountCents = Math.round(Number(payment.transaction_amount || 0) * 100);
    if (approved && amountCents !== stored.amount_cents) throw Object.assign(new Error("Valor do pagamento não corresponde ao pedido."), { status: 409 });
    if (approved) {
      await rest("rpc/confirm_payment", { method: "POST", body: JSON.stringify({ p_internal_payment_id: stored.id, p_provider_payment_id: String(payment.id), p_user_id: stored.user_id, p_amount_cents: amountCents, p_credits: stored.credits }) });
    } else {
      await rest(`payments?id=eq.${stored.id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ provider_payment_id: String(payment.id), status: payment.status || "pending", updated_at: new Date().toISOString() }) });
    }
    return json({ ok: true });
  } catch (error) { return handleError(error); }
};
