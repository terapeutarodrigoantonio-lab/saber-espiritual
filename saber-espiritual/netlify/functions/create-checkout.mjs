import crypto from "node:crypto";
import { authenticate, handleError, json, onlyPost, readBody, rest, selectOne } from "./_lib.mjs";

export default async request => {
  try {
    onlyPost(request);
    if (!process.env.MERCADO_PAGO_ACCESS_TOKEN) throw new Error("Pagamento ainda não configurado.");
    const { user } = await authenticate(request);
    const { packageId } = await readBody(request);
    if (!/^[a-z0-9-]{2,40}$/.test(String(packageId))) throw Object.assign(new Error("Pacote inválido."), { status: 400 });
    const pack = await selectOne(`credit_packages?slug=eq.${encodeURIComponent(packageId)}&active=eq.true&select=id,slug,name,credits,price_cents,first_purchase_only`);
    if (!pack) throw Object.assign(new Error("Pacote não encontrado."), { status: 404 });

    if (pack.first_purchase_only) {
      const prior = await selectOne(`payments?user_id=eq.${user.id}&package_id=eq.${pack.id}&status=eq.approved&select=id`);
      if (prior) throw Object.assign(new Error("A promoção de primeira consulta já foi utilizada."), { status: 409 });
    }

    const internalId = crypto.randomUUID();
    await rest("payments", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ id: internalId, user_id: user.id, package_id: pack.id, amount_cents: pack.price_cents, credits: pack.credits, status: "pending" }) });

    const siteUrl = (process.env.SITE_URL || new URL(request.url).origin).replace(/\/$/, "");
    const response = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.MERCADO_PAGO_ACCESS_TOKEN}`, "Content-Type": "application/json", "X-Idempotency-Key": internalId },
      body: JSON.stringify({
        items: [{ id: pack.slug, title: `${pack.name} — ${pack.credits} minutos`, quantity: 1, currency_id: "BRL", unit_price: pack.price_cents / 100 }],
        payer: { email: user.email },
        external_reference: internalId,
        metadata: { internal_payment_id: internalId, user_id: user.id, package_id: pack.id, credits: pack.credits },
        back_urls: { success: `${siteUrl}/?payment=success`, pending: `${siteUrl}/?payment=pending`, failure: `${siteUrl}/?payment=failure` },
        auto_return: "approved",
        notification_url: `${siteUrl}/.netlify/functions/mercadopago-webhook`,
        statement_descriptor: "SABER ESPIRIT"
      })
    });
    const preference = await response.json();
    if (!response.ok || !preference.init_point) throw Object.assign(new Error(preference.message || "Falha ao iniciar o pagamento."), { status: 502 });
    await rest(`payments?id=eq.${internalId}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ provider_preference_id: preference.id }) });
    const checkoutUrl = process.env.MP_USE_SANDBOX === "true" ? preference.sandbox_init_point : preference.init_point;
    return json({ checkoutUrl });
  } catch (error) { return handleError(error); }
};
