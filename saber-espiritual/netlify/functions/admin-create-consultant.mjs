import { env, handleError, json, onlyPost, readBody, requireAdmin, rest } from "./_lib.mjs";

export default async request => {
  let createdUserId = null;
  try {
    onlyPost(request);
    await requireAdmin(request);
    const body = await readBody(request);
    if (!body.public_name || !body.email || !body.password || !body.specialty || !body.bio) throw Object.assign(new Error("Preencha todos os dados do atendente."), { status: 400 });
    if (String(body.password).length < 8) throw Object.assign(new Error("A senha provisória deve ter 8 caracteres ou mais."), { status: 400 });
    const { supabaseUrl, serviceKey } = env();
    const authResponse = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
      method: "POST",
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ email: body.email, password: body.password, email_confirm: true, user_metadata: { name: body.public_name } })
    });
    const authUser = await authResponse.json();
    if (!authResponse.ok) throw Object.assign(new Error(authUser.msg || authUser.message || "Não foi possível criar o acesso."), { status: 400 });
    createdUserId = authUser.id;
    await rest(`profiles?id=eq.${createdUserId}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ display_name: body.public_name, role: "reader" }) });
    await rest("consultants", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ profile_id: createdUserId, public_name: body.public_name, slug: slugify(body.public_name), specialty: body.specialty, bio: body.bio, status: "offline", minute_rate_credits: 1, commission_percent: 60, active: true }) });
    return json({ ok: true }, 201);
  } catch (error) {
    if (createdUserId) {
      try {
        const { supabaseUrl, serviceKey } = env();
        await fetch(`${supabaseUrl}/auth/v1/admin/users/${createdUserId}`, { method: "DELETE", headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } });
      } catch { /* limpeza de melhor esforço */ }
    }
    return handleError(error);
  }
};

function slugify(value) {
  return String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}
