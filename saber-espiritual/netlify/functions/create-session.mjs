import { authenticate, handleError, json, onlyPost, readBody, rest } from "./_lib.mjs";

export default async request => {
  try {
    onlyPost(request);
    const { user } = await authenticate(request);
    const { consultantId } = await readBody(request);
    if (!consultantId) throw Object.assign(new Error("Escolha um especialista."), { status: 400 });
    const result = await rest("rpc/create_chat_session", { method: "POST", body: JSON.stringify({ p_consultant_id: consultantId, p_client_id: user.id }) });
    return json({ session: Array.isArray(result) ? result[0] : result });
  } catch (error) { return handleError(error); }
};
