import { authenticate, handleError, json, onlyPost, readBody, rest } from "./_lib.mjs";

export default async request => {
  try {
    onlyPost(request);
    const { user } = await authenticate(request);
    const { sessionId } = await readBody(request);
    const result = await rest("rpc/end_chat_session", { method: "POST", body: JSON.stringify({ p_session_id: sessionId, p_user_id: user.id }) });
    return json({ session: result });
  } catch (error) { return handleError(error); }
};
