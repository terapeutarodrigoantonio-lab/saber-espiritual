import { authenticate, handleError, json, onlyPost, readBody, rest } from "./_lib.mjs";

export default async request => {
  try {
    onlyPost(request);
    const { user } = await authenticate(request);
    const { status } = await readBody(request);
    if (!["online", "offline"].includes(status)) throw Object.assign(new Error("Status inválido."), { status: 400 });
    const result = await rest(`consultants?profile_id=eq.${user.id}&status=neq.busy`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ status, updated_at: new Date().toISOString() }) });
    if (!result?.length) throw Object.assign(new Error("Não é possível alterar a disponibilidade durante uma consulta."), { status: 409 });
    return json({ consultant: result[0] });
  } catch (error) { return handleError(error); }
};
