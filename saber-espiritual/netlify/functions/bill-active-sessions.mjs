import { handleError, json, rest } from "./_lib.mjs";

export default async () => {
  try {
    const result = await rest("rpc/bill_active_sessions", { method: "POST", body: "{}" });
    return json({ ok: true, billed: result || 0 });
  } catch (error) { return handleError(error); }
};

export const config = { schedule: "* * * * *" };
