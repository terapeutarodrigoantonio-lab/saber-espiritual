const required = name => {
  const value = process.env[name];
  if (!value) throw new Error(`Configuração ausente: ${name}`);
  return value;
};

export const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), {
  status,
  headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers }
});

export const readBody = async request => {
  try { return await request.json(); } catch { throw Object.assign(new Error("Corpo da requisição inválido."), { status: 400 }); }
};

export const env = () => ({
  supabaseUrl: required("SUPABASE_URL").replace(/\/$/, ""),
  anonKey: required("SUPABASE_ANON_KEY"),
  serviceKey: required("SUPABASE_SERVICE_ROLE_KEY")
});

export async function authenticate(request) {
  const { supabaseUrl, anonKey } = env();
  const authorization = request.headers.get("authorization") || "";
  if (!authorization.startsWith("Bearer ")) throw Object.assign(new Error("Entre novamente para continuar."), { status: 401 });
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: { apikey: anonKey, authorization } });
  if (!response.ok) throw Object.assign(new Error("Sessão inválida ou expirada."), { status: 401 });
  const user = await response.json();
  return { user, token: authorization.slice(7) };
}

export async function rest(path, options = {}) {
  const { supabaseUrl, serviceKey } = env();
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const error = new Error(data?.message || data?.hint || "Falha ao acessar os dados.");
    error.status = response.status;
    throw error;
  }
  return data;
}

export const selectOne = async path => {
  const rows = await rest(path);
  return Array.isArray(rows) ? rows[0] || null : rows;
};

export async function requireAdmin(request) {
  const auth = await authenticate(request);
  const profile = await selectOne(`profiles?id=eq.${encodeURIComponent(auth.user.id)}&select=id,role`);
  if (profile?.role !== "admin") throw Object.assign(new Error("Acesso restrito à administração."), { status: 403 });
  return auth;
}

export function handleError(error) {
  console.error(error);
  const status = Number(error?.status) || 500;
  const message = status >= 500 ? "Não foi possível concluir agora. Tente novamente." : error.message;
  return json({ error: message }, status);
}

export const onlyPost = request => {
  if (request.method !== "POST") throw Object.assign(new Error("Método não permitido."), { status: 405 });
};
