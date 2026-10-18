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

const displayedMessages = new Set();

usernameInput.value =
  localStorage.getItem("nightmar_username") || "";

// ОТОБРАЖЕНИЕ СООБЩЕНИЙ

function displayMessage(message) {
  const element = document.createElement("div");
  element.className = "chat-message";

  const header = document.createElement("div");
  header.className = "chat-message-header";

  const username = document.createElement("span");
  username.className = "chat-username";
  username.textContent = message.username;

  const time = document.createElement("span");
  time.textContent = new Date(message.created_at).toLocaleTimeString(
    "ru-RU",
    {
      hour: "2-digit",
      minute: "2-digit"
    }
  );

  header.append(username, time);

  const content = document.createElement("div");
  content.className = "chat-message-content";
  content.textContent = message.content;

  element.append(header, content);
  messagesContainer.appendChild(element);

  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function addMessage(message) {
  if (!message?.id || displayedMessages.has(message.id)) {
    return;
  }

  displayedMessages.add(message.id);
  displayMessage(message);
}

// ЗАГРУЗКА ИСТОРИИ

async function loadMessages() {
  const { data, error } = await client
    .from("messages")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("Ошибка загрузки сообщений:", error);
    return;
  }

  messagesContainer.innerHTML = "";
  displayedMessages.clear();

  data.reverse().forEach(addMessage);
}

// ОТПРАВКА

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const username = usernameInput.value.trim();
  const content = messageInput.value.trim();

  if (!username || !content) return;

  localStorage.setItem("nightmar_username", username);

  const { error } = await client
    .from("messages")
    .insert([{ username, content }]);

  if (error) {
    alert("Ошибка отправки сообщения");
    console.error(error);
    return;
  }

  messageInput.value = "";
});

// REALTIME

let realtimeChannel = null;

let realtimeChannel = null;
let reconnectAttempts = 0;
let reconnectTimer = null;

async function connectRealtime() {
  // Не создаём несколько подключений одновременно
  if (realtimeChannel) {
    try {
      await client.removeChannel(realtimeChannel);
    } catch (error) {
      console.warn("Не удалось удалить старый канал:", error);
    }
    realtimeChannel = null;
  }

  realtimeChannel = client
    .channel("nightmar-chat-live")
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "messages"
      },
      (payload) => {
        addMessage(payload.new);
      }
    )
    .subscribe((status, err) => {
      console.log("Realtime status:", status, err || "");

      if (status === "SUBSCRIBED") {
        reconnectAttempts = 0;
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
}

function scheduleReconnect() {
  if (reconnectTimer) return;

  reconnectAttempts++;

  // 3, 6, 12, 24 секунды, максимум 60
  const delay = Math.min(3000 * 2 ** (reconnectAttempts - 1), 60000);

  console.warn(
    Realtime недоступен. Переподключение через ${delay / 1000} сек.
  );

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectRealtime();
  }, delay);
}

loadMessages();
connectRealtime();
