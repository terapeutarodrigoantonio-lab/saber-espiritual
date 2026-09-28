import { authenticate, handleError, json, onlyPost, readBody, rest } from "./_lib.mjs";

export default async request => {
  try {
    onlyPost(request);
    const { user } = await authenticate(request);
    const { sessionId } = await readBody(request);
    const result = await rest("rpc/heartbeat_session", { method: "POST", body: JSON.stringify({ p_session_id: sessionId, p_user_id: user.id }) });
    return json(result || {});
  } catch (error) { return handleError(error); }
};
