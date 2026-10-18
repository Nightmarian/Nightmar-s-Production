// NIGHTMAR'S PRODUCTION CHAT

const SUPABASE_URL = "https://ipyqydrqctziltcuboop.supabase.co";
const SUPABASE_KEY = "sb_publishable_0PNw-wO6K1oMyb8XhLhgpA_GoXJivQV";

const client = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

const messagesContainer = document.getElementById("messages");
const chatForm = document.getElementById("chat-form");
const usernameInput = document.getElementById("username");
const messageInput = document.getElementById("message-input");

const messages = new Map();

let realtimeChannel = null;
let reconnectAttempts = 0;
let reconnectTimer = null;
let channelVersion = 0;
let loading = false;

usernameInput.value =
  localStorage.getItem("nightmar_username") || "";

/* --------------------------------------------
   Работа с сообщениями
-------------------------------------------- */

function getMessageKey(message) {
  return String(message.id);
}

function addMessage(message, shouldRender = true) {
  if (!message || message.id === undefined || message.id === null) {
    return;
  }

  const key = getMessageKey(message);

  // Если сообщение уже есть — обновляем его данными с сервера.
  messages.set(key, message);

  // Оставляем максимум 100 последних сообщений.
  const sorted = [...messages.values()].sort(
    (a, b) => new Date(a.created_at) - new Date(b.created_at)
  );

  while (sorted.length > 100) {
    const oldest = sorted.shift();
    messages.delete(getMessageKey(oldest));
  }

  if (shouldRender) {
    renderMessages();
  }
}

function renderMessages() {
  const isNearBottom =
    messagesContainer.scrollHeight -
      messagesContainer.scrollTop -
      messagesContainer.clientHeight <
    100;

  const sortedMessages = [...messages.values()].sort(
    (a, b) => new Date(a.created_at) - new Date(b.created_at)
  );

  const fragment = document.createDocumentFragment();

  for (const message of sortedMessages) {
    const element = document.createElement("div");
    element.className = "chat-message";
    element.dataset.messageId = String(message.id);

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
    element.append(header, content);
    fragment.appendChild(element);
  }

  messagesContainer.replaceChildren(fragment);

  // Не сбрасываем пользователю прокрутку, если он читает старые сообщения.
  if (isNearBottom) {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }
}

/* --------------------------------------------
   Загрузка истории
-------------------------------------------- */

async function loadMessages() {
  if (loading) return;

  loading = true;

  try {
    const { data, error } = await client
      .from("messages")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      throw error;
    }

    // Не очищаем интерфейс и Map.
    // Это важно: сообщение, пришедшее по Realtime во время запроса,
    // не исчезнет.
    for (const message of (data || []).reverse()) {
      addMessage(message, false);
    }

    renderMessages();
  } catch (error) {
    console.error("Ошибка загрузки сообщений:", error);
  } finally {
    loading = false;
  }
}

/* --------------------------------------------
   Отправка
-------------------------------------------- */

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const username = usernameInput.value.trim();
  const content = messageInput.value.trim();

  if (!username || !content) return;

  localStorage.setItem("nightmar_username", username);

  const submitButton = chatForm.querySelector(
    'button[type="submit"], input[type="submit"]'
  );

  if (submitButton) {
    submitButton.disabled = true;
  }

  try {
    const { data, error } = await client
      .from("messages")
      .insert([{ username, content }])
      .select()
      .single();

    if (error) {
      throw error;
    }

    messageInput.value = "";

    // Сразу добавляем сообщение в интерфейс.
    // Когда оно придёт через Realtime, дубля не будет,
    // потому что оно уже есть в Map по id.
    addMessage(data);
  } catch (error) {
    console.error("Ошибка отправки сообщения:", error);
    alert("Не удалось отправить сообщение. Попробуйте ещё раз.");
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
    }
  }
});

/* --------------------------------------------
   Supabase Realtime
-------------------------------------------- */

async function disconnectRealtime() {
  if (!realtimeChannel) return;

  const oldChannel = realtimeChannel;
  realtimeChannel = null;

  try {
    await client.removeChannel(oldChannel);
  } catch (error) {
    console.warn("Не удалось закрыть старый Realtime-канал:", error);
  }
}

async function connectRealtime() {
  clearTimeout(reconnectTimer);
  reconnectTimer = null;

  const currentVersion = ++channelVersion;

  await disconnectRealtime();

  const channel = client
    .channel("nightmar-chat-live")
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "messages"
      },
      (payload) => {
        if (currentVersion !== channelVersion) return;

        if (payload?.new) {
          addMessage(payload.new);
        }
      }
    )
    .subscribe((status, error) => {
      // Игнорируем события старых каналов.
      if (currentVersion !== channelVersion) return;

      console.log("Realtime status:", status, error || "");

      if (status === "SUBSCRIBED") {
        reconnectAttempts = 0;

        // Догружаем сообщения, которые могли прийти
        // до завершения подключения Realtime.
        loadMessages();
        return;
      }

      if (
        status === "CHANNEL_ERROR" ||
        status === "TIMED_OUT" ||
        status === "CLOSED"
      ) {
        scheduleReconnect();
      }
    });

  realtimeChannel = channel;
}

function scheduleReconnect() {
  if (reconnectTimer) return;

  reconnectAttempts++;

  // 3, 6, 12, 24, 48, максимум 60 секунд.
  const delay = Math.min(
    3000 * 2 ** (reconnectAttempts - 1),
    60000
  );

  console.warn(
    `Realtime недоступен. Переподключение через ${delay / 1000} сек.`
  );

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectRealtime();
  }, delay);
}

/* --------------------------------------------
   Восстановление при возврате на вкладку
-------------------------------------------- */

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    loadMessages();

    if (!realtimeChannel) {
      connectRealtime();
    }
  }
});

window.addEventListener("online", () => {
  loadMessages();
  connectRealtime();
});

window.addEventListener("offline", () => {
  console.warn("Интернет-соединение отсутствует");
});

/* --------------------------------------------
   Инициализация
-------------------------------------------- */

loadMessages();
connectRealtime();

console.log("🚀 Chat initialized");
