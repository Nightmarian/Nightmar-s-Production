const SUPABASE_URL = "https://ipyqydrqctziltcuboop.supabase.co";
const SUPABASE_KEY = "sb_publishable_0PNw-wO6K1oMyb8XhLhgpA_GoXJivQV";

const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const messagesContainer = document.getElementById("messages");
const chatForm = document.getElementById("chat-form");
const usernameInput = document.getElementById("username");
const messageInput = document.getElementById("message-input");
const sendButton = document.getElementById("send-button");
const statusElement = document.querySelector(".chat-online");

const QUEUE_KEY = "nightmar:queue:v2";
const HISTORY_KEY = "nightmar:history:v2";
const HISTORY_LIMIT = 100;

usernameInput.value = localStorage.getItem("nightmar_username") || "";
sendButton.disabled = true;

let queue = [];
const history = new Map();

let sending = false;
let loading = false;
let channel = null;
let reconnectTimer = null;
let retryTimer = null;

let queueSave = Promise.resolve();
let historySave = Promise.resolve();

function updateStatus() {
  if (!statusElement) return;

  statusElement.textContent = navigator.onLine ? "● LIVE" : "● OFFLINE";
  statusElement.style.color = navigator.onLine ? "#b30000" : "#999";
}

function messageKey(message) {
  return message.client_id || `db:${message.id}`;
}

function sortByTime(a, b) {
  return new Date(a.created_at) - new Date(b.created_at);
}

function trimHistory() {
  const sorted = [...history.values()].sort(sortByTime);
  const excess = sorted.length - HISTORY_LIMIT;

  for (let i = 0; i < excess; i++) {
    history.delete(messageKey(sorted[i]));
  }
}

function renderMessages() {
  const nearBottom =
    messagesContainer.scrollHeight -
      messagesContainer.scrollTop -
      messagesContainer.clientHeight < 80;

  const visible = new Map(history);

  // Сообщение из очереди не должно исчезать, пока оно не подтверждено сервером.
  for (const message of queue) {
    if (!visible.has(messageKey(message))) {
      visible.set(messageKey(message), { ...message, pending: true });
    }
  }

  const fragment = document.createDocumentFragment();

  for (const message of [...visible.values()].sort(sortByTime)) {
    const element = document.createElement("div");
    element.className =
      "chat-message" + (message.pending ? " pending" : "");

    const header = document.createElement("div");
    header.className = "chat-message-header";

    const username = document.createElement("span");
    username.className = "chat-username";
    username.textContent = message.username;

    const time = document.createElement("span");
    time.textContent = new Date(message.created_at).toLocaleTimeString("ru-RU", {
      hour: "2-digit",
      minute: "2-digit"
    });

    const content = document.createElement("div");
    content.className = "chat-message-content";
    content.textContent = message.content;

    header.append(username, time);
    element.append(header, content);
    fragment.appendChild(element);
  }

  messagesContainer.replaceChildren(fragment);

  if (nearBottom) {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }
}

function saveQueue() {
  const snapshot = [...queue];

  // Последовательные записи не дадут старому состоянию перезаписать новое.
  queueSave = queueSave
    .catch(() => {})
    .then(() => localforage.setItem(QUEUE_KEY, snapshot));

  return queueSave;
}

function saveHistory() {
  const snapshot = [...history.values()];

  historySave = historySave
    .catch(() => {})
    .then(() => localforage.setItem(HISTORY_KEY, snapshot));

  historySave.catch(error => console.error("Ошибка кэша истории:", error));
}

function addServerMessages(messages) {
  for (const message of messages) {
    history.set(messageKey(message), message);
  }

  trimHistory();
  renderMessages();
  saveHistory();
}

async function loadRecentMessages() {
  if (!navigator.onLine || loading) return;

  loading = true;

  try {
    const { data, error } = await client
      .from("messages")
      .select("id, client_id, username, content, created_at")
      .order("created_at", { ascending: false })
      .limit(HISTORY_LIMIT);

    if (error) throw error;

    // Объединяем с текущим состоянием, а не очищаем список.
    addServerMessages(data || []);
  } catch (error) {
    console.error("Ошибка загрузки сообщений:", error);
  } finally {
    loading = false;
  }
}

function scheduleSendRetry() {
  clearTimeout(retryTimer);
  retryTimer = setTimeout(flushQueue, 5000);
}

async function insertMessage(message) {
  const payload = {
    client_id: message.client_id,
    username: message.username,
    content: message.content
  };

  const { data, error } = await client
    .from("messages")
    .insert(payload)
    .select("id, client_id, username, content, created_at")
    .single();

  if (!error) return data;

  if (error.code !== "23505") throw error;

  // Ответ мог потеряться после успешной вставки. Благодаря уникальному
  // client_id находим уже записанное сообщение вместо повторной отправки.
  const existing = await client
    .from("messages")
    .select("id, client_id, username, content, created_at")
    .eq("client_id", message.client_id)
    .single();

  if (existing.error) throw existing.error;
  return existing.data;
}

async function flushQueue() {
  if (sending || !navigator.onLine || queue.length === 0) return;

  sending = true;
  clearTimeout(retryTimer);

  try {
    await queueSave;

    while (navigator.onLine && queue.length > 0) {
      const message = queue[0];
      const saved = await insertMessage(message);

      addServerMessages([saved]);

      queue.shift();
      await saveQueue();
      renderMessages();
    }
  } catch (error) {
    console.error("Ошибка отправки; повторим позже:", error);
    scheduleSendRetry();
  } finally {
    sending = false;
  }
}

function disconnectRealtime() {
  clearTimeout(reconnectTimer);

  if (channel) {
    const oldChannel = channel;
    channel = null;
    client.removeChannel(oldChannel);
  }
}

function scheduleReconnect() {
  if (reconnectTimer || !navigator.onLine) return;

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectRealtime();
  }, 5000);
}

function connectRealtime() {
  if (!navigator.onLine || channel) return;

  const newChannel = client
    .channel("nightmar-chat-live")
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "messages"
      },
      payload => {
        addServerMessages([payload.new]);
      }
    );

  channel = newChannel;

  newChannel.subscribe(status => {
    if (channel !== newChannel) return;

    if (status === "SUBSCRIBED") {
      // Догружаем то, что могло прийти до подписки.
      loadRecentMessages();
      flushQueue();
    }

    if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status)) {
      disconnectRealtime();
      scheduleReconnect();
    }
  });
}

chatForm.addEventListener("submit", async event => {
  event.preventDefault();

  const username = usernameInput.value.trim();
  const content = messageInput.value.trim();
  if (!username || !content) return;

  localStorage.setItem("nightmar_username", username);

  const message = {
    client_id: crypto.randomUUID(),
    username,
    content,
    created_at: new Date().toISOString()
  };

  queue.push(message);
  messageInput.value = "";
  renderMessages();

  try {
    await saveQueue();
  } catch (error) {
    console.error("Не удалось сохранить очередь локально:", error);
    // При работающей сети всё равно попробуем отправить сообщение.
  }

  flushQueue();
});

window.addEventListener("online", () => {
  updateStatus();
  connectRealtime();
  loadRecentMessages();
  flushQueue();
});

window.addEventListener("offline", () => {
  updateStatus();
  disconnectRealtime();
});

document.addEventListener("visibilitychange", () => {
  if (!document.hidden && navigator.onLine) {
    connectRealtime();
    loadRecentMessages();
    flushQueue();
  }
});

// Подстраховка: сообщения обновятся, даже если событие Realtime пропущено.
setInterval(() => {
  if (navigator.onLine && !document.hidden) {
    loadRecentMessages();
    flushQueue();
  }
}, 15000);

async function initialize() {
  try {
    const [savedHistory, savedQueue] = await Promise.all([
      localforage.getItem(HISTORY_KEY),
      localforage.getItem(QUEUE_KEY)
    ]);

    for (const message of savedHistory || []) {
      history.set(messageKey(message), message);
    }

    queue = savedQueue || [];
    trimHistory();
    renderMessages();
  } catch (error) {
    console.error("Ошибка чтения локального кэша:", error);
  } finally {
    sendButton.disabled = false;
  }

  updateStatus();
  loadRecentMessages();
  connectRealtime();
  flushQueue();
}

initialize();
