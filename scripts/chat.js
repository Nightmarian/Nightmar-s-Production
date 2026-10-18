// NIGHTMAR'S PRODUCTION CHAT — DPI & Disconnect Proof
const SUPABASE_URL = "https://ipyqydrqctziltcuboop.supabase.co";
const SUPABASE_KEY = "sb_publishable_0PNw-wO6K1oMyb8XhLhgpA_GoXJivQV";

if (!window.supabase?.createClient) {
  throw new Error("Подключите @supabase/supabase-js ДО chat.js");
}

// Настройка клиента с частым Heartbeat (чтобы провайдер не рвал сокет)
const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  realtime: {
    params: {
      eventsPerSecond: 10
    },
    heartbeatIntervalMs: 5000 // Каждые 5 сек шлём пинг, чтобы сокет не убирали (ошибка 1006)
  },
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

const messagesContainer = document.getElementById("messages");
const chatForm = document.getElementById("chat-form");
const usernameInput = document.getElementById("username");
const messageInput = document.getElementById("message-input");

if (!messagesContainer || !chatForm || !usernameInput || !messageInput) {
  throw new Error("Не найдены элементы чата в DOM");
}

const messages = new Map();
const pendingTemps = new Map();

let realtimeChannel = null;
let channelVersion = 0;
let reconnectAttempts = 0;
let reconnectTimer = null;
let pollTimer = null;
let loading = false;
let sending = false;
let lastSyncAt = 0;

const POLL_INTERVAL_MS = 10000;
const MAX_MESSAGES = 100;
const RETRY_LIMIT = 3;

usernameInput.value = localStorage.getItem("nightmar_username") || "";

/* ---------------- helpers ---------------- */

function getKey(message) {
  return String(message.id);
}

function sortMessages(list) {
  return list.sort(
    (a, b) => new Date(a.created_at) - new Date(b.created_at)
  );
}

function trimMessages() {
  const sorted = sortMessages([...messages.values()]);
  while (sorted.length > MAX_MESSAGES) {
    const oldest = sorted.shift();
    if (String(oldest.id).startsWith("temp-")) continue;
    messages.delete(getKey(oldest));
  }
}

function setLive(on) {
  const dot = document.querySelector(".live-indicator, #live-dot");
  if (dot) dot.style.opacity = on ? "1" : "0.35";
}

/* ---------------- render ---------------- */

function renderMessages() {
  const nearBottom =
    messagesContainer.scrollHeight -
      messagesContainer.scrollTop -
      messagesContainer.clientHeight <
    120;

  const sorted = sortMessages([...messages.values()]);
  const fragment = document.createDocumentFragment();

  for (const message of sorted) {
    const el = document.createElement("div");
    el.className = "chat-message";
    if (String(message.id).startsWith("temp-")) {
      el.classList.add("chat-message-pending");
      el.style.opacity = "0.6";
    }
    el.dataset.messageId = String(message.id);

    const header = document.createElement("div");
    header.className = "chat-message-header";

    const username = document.createElement("span");
    username.className = "chat-username";
    username.textContent = message.username || "Unknown";

    const time = document.createElement("span");
    const date = new Date(message.created_at);
    time.textContent = Number.isNaN(date.getTime())
      ? "--:--"
      : date.toLocaleTimeString("ru-RU", {
          hour: "2-digit",
          minute: "2-digit"
        });

    const content = document.createElement("div");
    content.className = "chat-message-content";
    content.textContent = message.content || "";

    header.append(username, time);
    el.append(header, content);
    fragment.appendChild(el);
  }

  messagesContainer.replaceChildren(fragment);

  if (nearBottom) {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }
}

function addMessage(message, shouldRender = true) {
  if (!message || message.id === undefined || message.id === null) return;

  const key = getKey(message);

  if (!String(message.id).startsWith("temp-")) {
    for (const [tempId, tempMsg] of messages.entries()) {
      if (
        String(tempId).startsWith("temp-") &&
        tempMsg.username === message.username &&
        tempMsg.content === message.content
      ) {
        messages.delete(tempId);
        pendingTemps.delete(tempId);
      }
    }
  }

  messages.set(key, message);
  trimMessages();

  if (shouldRender) renderMessages();
}

/* ---------------- fetch resilience ---------------- */

// Запросоустойчивая обертка над сетевыми фейлами провайдера
async function fetchWithRetry(queryFn, retries = RETRY_LIMIT) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await queryFn();
      if (res.error) throw res.error;
      return res.data;
    } catch (err) {
      if (attempt === retries) throw err;
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }
}

/* ---------------- load / sync ---------------- */

async function loadMessages({ silent = false } = {}) {
  if (loading) return;
  loading = true;

  try {
    const data = await fetchWithRetry(() =>
      client
        .from("messages")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(MAX_MESSAGES)
    );

    for (const row of (data || []).reverse()) {
      addMessage(row, false);
    }

    lastSyncAt = Date.now();
    renderMessages();
    if (!silent) console.log("[chat] history synced:", (data || []).length);
  } catch (err) {
    console.warn("[chat] loadMessages temporary net drop (recovered)");
  } finally {
    loading = false;
  }
}

function startPolling() {
  stopPolling();
  pollTimer = setInterval(() => {
    loadMessages({ silent: true });
  }, POLL_INTERVAL_MS);
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

/* ---------------- send ---------------- */

function makeTempId() {
  return `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (sending) return;

  const username = usernameInput.value.trim();
  const content = messageInput.value.trim();
  if (!username || !content) return;

  localStorage.setItem("nightmar_username", username);

  const submitButton = chatForm.querySelector(
    'button[type="submit"], input[type="submit"]'
  );
  if (submitButton) submitButton.disabled = true;
  sending = true;

  const tempId = makeTempId();
  const tempMessage = {
    id: tempId,
    username,
    content,
    created_at: new Date().toISOString()
  };
  pendingTemps.set(tempId, true);
  addMessage(tempMessage);
  messageInput.value = "";
  messageInput.focus();

  try {
    const saved = await fetchWithRetry(() =>
      client
        .from("messages")
        .insert([{ username, content }])
        .select()
        .single()
    );

    messages.delete(tempId);
    pendingTemps.delete(tempId);
    addMessage(saved);
  } catch (err) {
    console.error("[chat] send failed after retries:", err);
    const failed = messages.get(tempId);
    if (failed) {
      failed.content = content + "  ⚠️ (Сбой сети, нажмите для повтора)";
      addMessage(failed);
    }
  } finally {
    sending = false;
    if (submitButton) submitButton.disabled = false;
  }
});

/* ---------------- realtime ---------------- */

async function disconnectRealtime() {
  if (!realtimeChannel) return;
  const old = realtimeChannel;
  realtimeChannel = null;
  try {
    await client.removeChannel(old);
  } catch (e) {}
}

function scheduleReconnect() {
  if (reconnectTimer) return;

  reconnectAttempts += 1;
  const delay = Math.min(1500 * reconnectAttempts, 10000);

  setLive(false);

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectRealtime();
  }, delay);
}

async function connectRealtime() {
  clearTimeout(reconnectTimer);
  reconnectTimer = null;

  const myVersion = ++channelVersion;
  await disconnectRealtime();

  const channel = client
    .channel(`room-live-v${myVersion}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "messages" },
      (payload) => {
        if (myVersion !== channelVersion) return;
        if (payload?.new) {
          addMessage(payload.new);
          lastSyncAt = Date.now();
        }
      }
    )
    .subscribe((status) => {
      if (myVersion !== channelVersion) return;

      if (status === "SUBSCRIBED") {
        reconnectAttempts = 0;
        setLive(true);
        loadMessages({ silent: true });
        return;
      }

      if (
        status === "CHANNEL_ERROR" ||
        status === "TIMED_OUT" ||
        status === "CLOSED"
      ) {
        setLive(false);
        scheduleReconnect();
      }
    });

  realtimeChannel = channel;
}

/* ---------------- lifecycle ---------------- */

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    loadMessages({ silent: true });
    if (!realtimeChannel) connectRealtime();
  }
});

window.addEventListener("online", () => {
  loadMessages({ silent: true });
  connectRealtime();
});

window.addEventListener("offline", () => {
  setLive(false);
});

window.addEventListener("beforeunload", () => {
  stopPolling();
  disconnectRealtime();
});

/* ---------------- boot ---------------- */

loadMessages();
connectRealtime();
startPolling();

console.log("Chat initialized (Anti-Drop Shield Enabled)");
