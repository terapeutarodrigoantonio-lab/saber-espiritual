"use strict";

const DEMO_PACKAGES = {
  first: { id: "first", name: "Primeira consulta", credits: 7, price: 19.90 },
  guidance: { id: "guidance", name: "Orientação", credits: 15, price: 49.90 },
  complete: { id: "complete", name: "Leitura completa", credits: 30, price: 89.90 },
  deep: { id: "deep", name: "Consulta profunda", credits: 60, price: 159.90 }
};
const DEMO_CONSULTANTS = [
  { id: "rafael-orion", slug: "rafael-orion", public_name: "Rafael Oríon", specialty: "Baralho Cigano • Orientação espiritual", bio: "Leituras objetivas sobre relacionamentos, decisões, caminhos profissionais e equilíbrio emocional.", status: "online", initials: "RO", theme: "rafael" },
  { id: "livia-sol", slug: "livia-sol", public_name: "Lívia Sol", specialty: "Tarot • Terapias energéticas", bio: "Escuta acolhedora e leitura simbólica para questões afetivas, autoestima, escolhas e novos ciclos.", status: "online", initials: "LS", theme: "livia" }
];

const app = {
  config: null,
  db: null,
  demo: false,
  user: null,
  profile: null,
  wallet: { credits: 0 },
  consultants: DEMO_CONSULTANTS,
  session: null,
  messageChannel: null,
  authSubscription: null,
  heartbeatTimer: null,
  clockTimer: null,
  demoBillingTimer: null,
  readerConsultant: null,
  toastTimer: null
};

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const escapeHTML = value => String(value ?? "").replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));

function toast(message, kind = "default") {
  const element = $("#toast");
  element.textContent = message;
  element.dataset.kind = kind;
  element.classList.add("show");
  clearTimeout(app.toastTimer);
  app.toastTimer = setTimeout(() => element.classList.remove("show"), 3200);
}

async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (app.user?.access_token) headers.Authorization = `Bearer ${app.user.access_token}`;
  const response = await fetch(`/.netlify/functions/${path}`, { ...options, headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Não foi possível concluir esta ação.");
  return payload;
}

async function initialize() {
  $("#year").textContent = new Date().getFullYear();
  bindEvents();
  renderConsultants();
  const params = new URLSearchParams(location.search);
  if (params.get("payment") === "success") toast("Pagamento recebido. Seus créditos serão liberados em instantes.");
  if (params.get("payment") === "pending") toast("Pagamento em análise. Avisaremos quando for aprovado.");
  if (params.get("payment") === "failure") toast("O pagamento não foi concluído. Nenhum crédito foi cobrado.", "error");
  if (params.has("payment")) history.replaceState({}, "", location.pathname + location.hash);

  try {
    app.config = await api("public-config");
    if (!app.config.supabaseUrl || !app.config.supabaseAnonKey || !window.supabase) throw new Error("Configuração pendente");
    app.db = window.supabase.createClient(app.config.supabaseUrl, app.config.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true } });
    const { data } = await app.db.auth.getSession();
    await applyAuthSession(data.session);
    const { data: listener } = app.db.auth.onAuthStateChange((_event, session) => setTimeout(() => applyAuthSession(session), 0));
    app.authSubscription = listener.subscription;
    await loadConsultants();
  } catch {
    enableDemoMode();
  }

  if ("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("sw.js").catch(() => {});
}

function enableDemoMode() {
  app.demo = true;
  $("#demoBanner").hidden = false;
  renderConsultants();
}

function bindEvents() {
  $("#accountButton").addEventListener("click", () => app.user ? showAccount() : $("#authDialog").showModal());
  $("#walletButton").addEventListener("click", showAccount);
  $("#logoutButton").addEventListener("click", logout);
  $("#addCreditsButton").addEventListener("click", () => setTimeout(() => $("#creditos").scrollIntoView({ behavior: "smooth" }), 20));
  $("#authDialog").addEventListener("click", event => { if (event.target === $("#authDialog")) $("#authDialog").close(); });
  $$('[data-close-dialog]').forEach(button => button.addEventListener("click", () => button.closest("dialog").close()));
  $$('[data-auth-tab]').forEach(button => button.addEventListener("click", () => switchAuthTab(button.dataset.authTab)));
  $("#loginForm").addEventListener("submit", login);
  $("#signupForm").addEventListener("submit", signup);
  $("#forgotPassword").addEventListener("click", resetPassword);
  $("#specialistGrid").addEventListener("click", event => {
    const button = event.target.closest(".start-chat");
    if (button) requestConsultation(button.dataset.consultantId);
  });
  $("#packageGrid").addEventListener("click", event => {
    const button = event.target.closest(".buy-package");
    if (button) buyPackage(button.dataset.packageId);
  });
  $("#closeChat").addEventListener("click", closeChat);
  $("#backdrop").addEventListener("click", closeChat);
  $("#messageForm").addEventListener("submit", sendMessage);
  $("#messageInput").addEventListener("input", autoGrowMessage);
  $("#endSessionButton").addEventListener("click", endSession);
  $("#chatAddCredits").addEventListener("click", () => { closeChat(); $("#creditos").scrollIntoView({ behavior: "smooth" }); });
  $("#consultantForm").addEventListener("submit", createConsultant);
  $$('[data-reader-status]').forEach(button => button.addEventListener("click", () => setReaderStatus(button.dataset.readerStatus, button)));
}

function switchAuthTab(tab) {
  $$('[data-auth-tab]').forEach(button => button.classList.toggle("active", button.dataset.authTab === tab));
  $("#loginForm").hidden = tab !== "login";
  $("#signupForm").hidden = tab !== "signup";
}

async function login(event) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const button = event.currentTarget.querySelector("button[type=submit]");
  setLoading(button, true);
  try {
    if (app.demo) {
      app.user = { id: "demo-user", email: data.get("email"), access_token: "demo" };
      app.profile = { id: "demo-user", display_name: "Cliente demonstração", role: "client" };
      app.wallet = { credits: 30 };
      updateAuthUI();
    } else {
      const { data: result, error } = await app.db.auth.signInWithPassword({ email: data.get("email"), password: data.get("password") });
      if (error) throw error;
      await applyAuthSession(result.session);
    }
    $("#authDialog").close();
    toast("Acesso realizado com sucesso.");
  } catch (error) { toast(friendlyAuthError(error), "error"); }
  finally { setLoading(button, false); }
}

async function signup(event) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const button = event.currentTarget.querySelector("button[type=submit]");
  setLoading(button, true);
  try {
    if (app.demo) {
      app.user = { id: "demo-user", email: data.get("email"), access_token: "demo" };
      app.profile = { id: "demo-user", display_name: data.get("name"), role: "client" };
      app.wallet = { credits: 7 };
      updateAuthUI();
    } else {
      const { data: result, error } = await app.db.auth.signUp({ email: data.get("email"), password: data.get("password"), options: { data: { name: data.get("name") } } });
      if (error) throw error;
      if (result.session) await applyAuthSession(result.session);
      else toast("Confirme o cadastro pelo link enviado ao seu e-mail.");
    }
    $("#authDialog").close();
  } catch (error) { toast(friendlyAuthError(error), "error"); }
  finally { setLoading(button, false); }
}

async function resetPassword() {
  const email = $("#loginForm [name=email]").value.trim();
  if (!email) return toast("Digite seu e-mail primeiro.");
  if (app.demo) return toast("No sistema real, o link de recuperação será enviado por e-mail.");
  const { error } = await app.db.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/` });
  if (error) toast(friendlyAuthError(error), "error"); else toast("Link de recuperação enviado.");
}

async function applyAuthSession(session) {
  app.user = session ? { ...session.user, access_token: session.access_token } : null;
  if (!app.user) {
    app.profile = null;
    app.wallet = { credits: 0 };
    updateAuthUI();
    return;
  }
  const [{ data: profile }, { data: wallet }] = await Promise.all([
    app.db.from("profiles").select("id,display_name,role").eq("id", app.user.id).maybeSingle(),
    app.db.from("wallets").select("credits").eq("user_id", app.user.id).maybeSingle()
  ]);
  app.profile = profile || { id: app.user.id, display_name: app.user.user_metadata?.name || "Cliente", role: "client" };
  app.wallet = wallet || { credits: 0 };
  updateAuthUI();
  await loadTransactions();
  if (["reader", "admin"].includes(app.profile.role)) await loadReaderQueue();
  if (app.profile.role === "admin") await loadAdminConsultants();
}

function updateAuthUI() {
  $("#accountButton").textContent = app.user ? "Minha conta" : "Entrar";
  $("#walletButton").hidden = !app.user;
  $("#walletHeader").textContent = app.wallet.credits || 0;
  $("#walletBalance").textContent = app.wallet.credits || 0;
  $("#accountEmail").textContent = app.user?.email || "";
  $("#adminPanel").hidden = app.profile?.role !== "admin";
  $("#readerControls").hidden = !["reader", "admin"].includes(app.profile?.role);
}

async function logout() {
  cleanupChat();
  if (!app.demo && app.db) await app.db.auth.signOut();
  app.user = null; app.profile = null; app.wallet = { credits: 0 };
  $("#minha-conta").hidden = true;
  updateAuthUI();
  toast("Você saiu da sua conta.");
}

function showAccount() {
  $("#minha-conta").hidden = false;
  updateAuthUI();
  $("#minha-conta").scrollIntoView({ behavior: "smooth" });
}

async function loadConsultants() {
  const { data, error } = await app.db.from("consultants").select("id,slug,public_name,specialty,bio,status,minute_rate_credits").eq("active", true).order("created_at");
  if (!error && data?.length) {
    app.consultants = data.map((item, index) => ({ ...item, initials: getInitials(item.public_name), theme: index % 2 ? "livia" : "rafael" }));
    renderConsultants();
  }
}

function renderConsultants() {
  $("#specialistGrid").innerHTML = app.consultants.map(consultant => `<article class="specialist-card">
    <div class="specialist-top"><div class="avatar avatar-${consultant.theme}" aria-hidden="true">${escapeHTML(consultant.initials)}</div><span class="status ${escapeHTML(consultant.status)}"><i></i> ${statusLabel(consultant.status)}</span></div>
    <div class="specialist-body"><p class="specialty">${escapeHTML(consultant.specialty)}</p><h3>${escapeHTML(consultant.public_name)}</h3><p>${escapeHTML(consultant.bio)}</p><div class="rating"><span>★★★★★</span> <b>5,0</b> <small>perfil verificado</small></div></div>
    <footer><div><strong>${consultant.minute_rate_credits || 1} crédito</strong><small>por minuto</small></div><button class="button button-primary start-chat" type="button" data-consultant-id="${escapeHTML(consultant.id)}" ${consultant.status !== "online" ? "disabled" : ""}>${consultant.status === "online" ? "Conversar" : statusLabel(consultant.status)}</button></footer>
  </article>`).join("");
}

function statusLabel(status) { return ({ online: "Online", busy: "Em consulta", offline: "Offline" })[status] || "Offline"; }
function getInitials(name) { return String(name).split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase(); }

async function buyPackage(packageId) {
  if (!app.user) { $("#authDialog").showModal(); return toast("Entre para comprar seus minutos."); }
  const button = document.querySelector(`[data-package-id="${CSS.escape(packageId)}"]`);
  setLoading(button, true);
  try {
    if (app.demo) {
      const pack = DEMO_PACKAGES[packageId];
      app.wallet.credits += pack.credits;
      updateAuthUI();
      toast(`${pack.credits} minutos adicionados no modo de demonstração.`);
      return;
    }
    const result = await api("create-checkout", { method: "POST", body: JSON.stringify({ packageId }) });
    location.href = result.checkoutUrl;
  } catch (error) { toast(error.message, "error"); }
  finally { setLoading(button, false); }
}

async function requestConsultation(consultantId) {
  if (!app.user) { $("#authDialog").showModal(); return toast("Entre para iniciar uma consulta."); }
  if ((app.wallet.credits || 0) < 1) { $("#creditos").scrollIntoView({ behavior: "smooth" }); return toast("Adicione créditos antes de iniciar."); }
  const consultant = app.consultants.find(item => String(item.id) === String(consultantId));
  if (!consultant || consultant.status !== "online") return toast("Este especialista não está disponível agora.");
  try {
    if (app.demo) {
      app.session = { id: `demo-${Date.now()}`, status: "active", consultant_id: consultantId, consultant_name: consultant.public_name, started_at: new Date().toISOString() };
      openChat();
      appendSystemMessage("Consulta demonstrativa iniciada. O cronômetro está ativo.");
      appendMessage({ sender_id: "consultant", body: `Olá! Eu sou ${consultant.public_name}. Pode me contar o que deseja compreender hoje?`, created_at: new Date().toISOString() });
      startDemoBilling();
      return;
    }
    const result = await api("create-session", { method: "POST", body: JSON.stringify({ consultantId }) });
    app.session = { ...result.session, consultant_name: consultant.public_name };
    openChat();
    await loadMessages();
    subscribeToChat();
    startHeartbeat();
  } catch (error) { toast(error.message, "error"); }
}

function openChat() {
  if (!app.session) return;
  $("#chatConsultantName").textContent = app.session.consultant_name || "Consulta online";
  $("#chatStatus").textContent = app.session.status === "active" ? "Consulta em andamento" : "Aguardando o especialista aceitar";
  $("#chatCredits").textContent = app.wallet.credits || 0;
  $("#messageList").innerHTML = "";
  $("#chatDrawer").classList.add("open");
  $("#chatDrawer").setAttribute("aria-hidden", "false");
  $("#backdrop").hidden = false;
  document.body.classList.add("locked");
  startClock();
  renderActiveSession();
}

function closeChat() {
  $("#chatDrawer").classList.remove("open");
  $("#chatDrawer").setAttribute("aria-hidden", "true");
  $("#backdrop").hidden = true;
  document.body.classList.remove("locked");
}

async function loadMessages() {
  if (!app.session || app.demo) return;
  const { data } = await app.db.from("messages").select("id,sender_id,body,created_at").eq("session_id", app.session.id).order("created_at");
  $("#messageList").innerHTML = "";
  (data || []).forEach(appendMessage);
}

function subscribeToChat() {
  if (app.demo || !app.session) return;
  if (app.messageChannel) app.db.removeChannel(app.messageChannel);
  app.messageChannel = app.db.channel(`session-${app.session.id}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `session_id=eq.${app.session.id}` }, payload => appendMessage(payload.new))
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "chat_sessions", filter: `id=eq.${app.session.id}` }, payload => updateSession(payload.new))
    .subscribe();
}

async function sendMessage(event) {
  event.preventDefault();
  if (!app.session) return;
  const input = $("#messageInput");
  const body = input.value.trim();
  if (!body) return;
  input.value = ""; autoGrowMessage({ target: input });
  if (app.demo) { appendMessage({ sender_id: app.user.id, body, created_at: new Date().toISOString() }); return; }
  const { error } = await app.db.from("messages").insert({ session_id: app.session.id, sender_id: app.user.id, body });
  if (error) toast("Não foi possível enviar a mensagem.", "error");
}

function appendMessage(message) {
  const mine = message.sender_id === app.user?.id;
  const element = document.createElement("article");
  element.className = `message${mine ? " mine" : ""}`;
  const p = document.createElement("p"); p.textContent = message.body;
  const time = document.createElement("time"); time.textContent = new Date(message.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  element.append(p, time);
  $("#messageList").append(element);
  $("#messageList").scrollTop = $("#messageList").scrollHeight;
}

function appendSystemMessage(text) {
  const element = document.createElement("div"); element.className = "system-message"; element.textContent = text;
  $("#messageList").append(element);
}

function startClock() {
  clearInterval(app.clockTimer);
  const update = () => {
    if (!app.session?.started_at) return $("#chatTimer").textContent = "00:00";
    const elapsed = Math.max(0, Math.floor((Date.now() - new Date(app.session.started_at).getTime()) / 1000));
    $("#chatTimer").textContent = `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`;
  };
  update(); app.clockTimer = setInterval(update, 1000);
}

function startDemoBilling() {
  clearInterval(app.demoBillingTimer);
  app.demoBillingTimer = setInterval(() => {
    if (!app.session || app.session.status !== "active") return;
    app.wallet.credits = Math.max(0, app.wallet.credits - 1);
    updateAuthUI(); $("#chatCredits").textContent = app.wallet.credits;
    if (app.wallet.credits <= 0) { clearInterval(app.demoBillingTimer); app.session.status = "paused"; appendSystemMessage("Seus minutos terminaram. Adicione créditos para continuar."); }
  }, 60000);
}

function startHeartbeat() {
  clearInterval(app.heartbeatTimer);
  const pulse = async () => {
    if (!app.session || app.demo) return;
    try {
      const result = await api("session-heartbeat", { method: "POST", body: JSON.stringify({ sessionId: app.session.id }) });
      if (result.wallet) { app.wallet = result.wallet; updateAuthUI(); $("#chatCredits").textContent = app.wallet.credits; }
      if (result.session) updateSession(result.session);
    } catch { /* próxima atualização tentará novamente */ }
  };
  pulse(); app.heartbeatTimer = setInterval(pulse, 20000);
}

function updateSession(session) {
  app.session = { ...app.session, ...session };
  $("#chatStatus").textContent = session.status === "active" ? "Consulta em andamento" : session.status === "waiting" ? "Aguardando o especialista aceitar" : "Consulta pausada";
  if (session.started_at) startClock();
  if (["ended", "cancelled"].includes(session.status)) { cleanupChat(false); appendSystemMessage("Consulta encerrada."); }
  renderActiveSession();
}

async function endSession() {
  if (!app.session || !confirm("Deseja encerrar esta consulta?")) return;
  try {
    if (!app.demo) await api("end-session", { method: "POST", body: JSON.stringify({ sessionId: app.session.id }) });
    app.session.status = "ended";
    cleanupChat(false);
    appendSystemMessage("Consulta encerrada.");
    toast("Consulta encerrada.");
  } catch (error) { toast(error.message, "error"); }
}

function cleanupChat(clear = true) {
  clearInterval(app.clockTimer); clearInterval(app.heartbeatTimer); clearInterval(app.demoBillingTimer);
  if (app.messageChannel && app.db) app.db.removeChannel(app.messageChannel);
  app.messageChannel = null;
  if (clear) app.session = null;
  renderActiveSession();
}

function renderActiveSession() {
  const box = $("#activeSessionSummary");
  if (!app.session || ["ended", "cancelled"].includes(app.session.status)) { box.className = "empty-mini"; box.textContent = "Nenhuma consulta ativa."; return; }
  box.className = "";
  box.innerHTML = `<p><strong>${escapeHTML(app.session.consultant_name || "Consulta")}</strong><br><small>${escapeHTML(app.session.status)}</small></p><button class="button button-ghost" id="reopenChat" type="button">Abrir conversa</button>`;
  $("#reopenChat").addEventListener("click", openChat);
}

async function loadTransactions() {
  if (app.demo || !app.user) return;
  const { data } = await app.db.from("wallet_transactions").select("id,type,credits,amount_cents,created_at").eq("user_id", app.user.id).order("created_at", { ascending: false }).limit(6);
  const list = $("#transactionList");
  if (!data?.length) { list.className = "empty-mini"; list.textContent = "Nenhuma movimentação."; return; }
  list.className = "";
  list.innerHTML = data.map(item => `<div class="transaction"><span>${escapeHTML(transactionLabel(item.type))}<small>${new Date(item.created_at).toLocaleDateString("pt-BR")}</small></span><b>${item.credits > 0 ? "+" : ""}${item.credits} min</b></div>`).join("");
}

function transactionLabel(type) { return ({ purchase: "Compra de créditos", usage: "Minuto de consulta", refund: "Estorno", bonus: "Bônus" })[type] || "Movimentação"; }

async function loadReaderQueue() {
  if (app.demo || !app.user) return;
  const { data: consultant } = await app.db.from("consultants").select("id,public_name,status").eq("profile_id", app.user.id).maybeSingle();
  if (!consultant) return;
  app.readerConsultant = consultant;
  renderReaderStatus();
  const { data: sessions } = await app.db.from("chat_sessions").select("id,status,started_at,created_at,client_id").eq("consultant_id", consultant.id).in("status", ["waiting", "active", "paused"]).order("created_at");
  const box = $("#activeSessionSummary");
  if (!sessions?.length) { box.textContent = "Nenhum cliente aguardando."; return; }
  box.innerHTML = sessions.map(session => `<div class="transaction"><span>${session.status === "waiting" ? "Cliente aguardando" : "Consulta em andamento"}</span><button class="button button-ghost reader-session" data-session-id="${session.id}" data-action="${session.status === "waiting" ? "accept" : "open"}" type="button">${session.status === "waiting" ? "Aceitar" : "Abrir"}</button></div>`).join("");
  $$(".reader-session").forEach(button => button.addEventListener("click", () => handleReaderSession(button.dataset.sessionId, button.dataset.action, consultant.public_name)));
}

function renderReaderStatus() {
  if (!app.readerConsultant) return;
  const labels = { online: "Você está online e pode receber solicitações.", busy: "Você está em uma consulta.", offline: "Você está offline." };
  $("#readerStatusText").textContent = labels[app.readerConsultant.status] || labels.offline;
  $$('[data-reader-status]').forEach(button => {
    button.disabled = app.readerConsultant.status === "busy" || button.dataset.readerStatus === app.readerConsultant.status;
  });
}

async function setReaderStatus(status, button) {
  if (app.demo) return toast("Conecte o banco online para alterar a disponibilidade.");
  setLoading(button, true);
  try {
    const result = await api("set-reader-status", { method: "POST", body: JSON.stringify({ status }) });
    app.readerConsultant = result.consultant;
    renderReaderStatus();
    await loadConsultants();
    toast(status === "online" ? "Você está disponível para atender." : "Você ficou offline.");
  } catch (error) { toast(error.message, "error"); }
  finally { setLoading(button, false); renderReaderStatus(); }
}

async function handleReaderSession(sessionId, action, publicName) {
  try {
    let result;
    if (action === "accept") result = await api("accept-session", { method: "POST", body: JSON.stringify({ sessionId }) });
    else {
      const { data } = await app.db.from("chat_sessions").select("*").eq("id", sessionId).single(); result = { session: data };
    }
    app.session = { ...result.session, consultant_name: publicName };
    openChat(); await loadMessages(); subscribeToChat(); startHeartbeat();
  } catch (error) { toast(error.message, "error"); }
}

async function createConsultant(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget));
  const button = event.currentTarget.querySelector("button[type=submit]");
  setLoading(button, true);
  try {
    if (app.demo) return toast("Conecte o banco online para criar atendentes reais.");
    await api("admin-create-consultant", { method: "POST", body: JSON.stringify(data) });
    event.currentTarget.reset();
    toast("Atendente criado com sucesso.");
    await loadAdminConsultants(); await loadConsultants();
  } catch (error) { toast(error.message, "error"); }
  finally { setLoading(button, false); }
}

async function loadAdminConsultants() {
  if (app.profile?.role !== "admin") return;
  const { data } = await app.db.from("consultants").select("id,public_name,specialty,status,active,commission_percent").order("created_at");
  $("#adminConsultants").innerHTML = (data || []).map(item => `<div class="transaction"><span><strong>${escapeHTML(item.public_name)}</strong><small>${escapeHTML(item.specialty)} · comissão ${item.commission_percent}%</small></span><b>${statusLabel(item.status)}</b></div>`).join("");
}

function autoGrowMessage(event) {
  const input = event.target; input.style.height = "auto"; input.style.height = `${Math.min(input.scrollHeight, 120)}px`;
}
function setLoading(button, loading) { if (!button) return; if (!button.dataset.label) button.dataset.label = button.textContent; button.disabled = loading; button.textContent = loading ? "Aguarde..." : button.dataset.label; }
function friendlyAuthError(error) {
  const message = String(error?.message || error);
  if (/invalid login/i.test(message)) return "E-mail ou senha incorretos.";
  if (/already registered/i.test(message)) return "Este e-mail já possui cadastro.";
  if (/password/i.test(message)) return "A senha deve ter pelo menos 8 caracteres.";
  return "Não foi possível concluir. Confira os dados e tente novamente.";
}

initialize();
