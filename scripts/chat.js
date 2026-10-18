// ============================================
// NIGHTMAR'S PRODUCTION CHAT - OPTIMIZED
// ============================================

const SUPABASE_URL = "https://ipyqydrqctziltcuboop.supabase.co";
const SUPABASE_KEY = "sb_publishable_0PNw-wO6K1oMyb8XhLhgpA_GoXJivQV";

const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const messagesContainer = document.getElementById("messages");
const chatForm = document.getElementById("chat-form");
const usernameInput = document.getElementById("username");
const messageInput = document.getElementById("message-input");
const sendButton = document.getElementById("send-button");

usernameInput.value = localStorage.getItem("nightmar_username") || "";

// ============================================
// РЕЖИМ ОФФЛАЙН + КЭШИРОВАНИЕ
// ============================================

let messageQueue = [];
let isOnline = navigator.onLine;
let syncing = false;

// Слушаем потерю интернета
window.addEventListener("online", syncMessages);
window.addEventListener("offline", () => {
  isOnline = false;
  updateStatus();
});

window.addEventListener("online", () => {
  isOnline = true;
  updateStatus();
  syncMessages();
});

function updateStatus() {
  const status = document.querySelector(".chat-online");
  if (isOnline) {
    status.textContent = "● LIVE";
    status.style.color = "#b30000";
  } else {
    status.textContent = "● OFFLINE";
    status.style.color = "#999";
  }
}

updateStatus();

// ============================================
// LOCALFORAGE для кэша (быстрее чем IndexedDB)
// ============================================

async function cacheMessage(msg) {
  try {
    const cached = await localforage.getItem("messages") || [];
    cached.push(msg);
    // Храните только последние 200 сообщений
    const trimmed = cached.slice(-200);
    await localforage.setItem("messages", trimmed);
  } catch (e) {
    console.error("Cache error:", e);
  }
}

async function getCachedMessages() {
  try {
    return await localforage.getItem("messages") || [];
  } catch (e) {
    return [];
  }
}

async function clearCache() {
  try {
    await localforage.removeItem("messages");
  } catch (e) {
    console.error("Clear cache error:", e);
  }
}

// ============================================
// ОТПРАВКА С ОЧЕРЕДЬЮ
// ============================================

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const username = usernameInput.value.trim();
  const content = messageInput.value.trim();

  if (!username || !content) return;

  localStorage.setItem("nightmar_username", username);

  const msg = {
    id: Date.now(),
    username,
    content,
    created_at: new Date().toISOString(),
    pending: true
  };

  // СРАЗУ покажите
  displayMessage(msg);
  messageInput.value = "";
  sendButton.disabled = true;

  // Добавьте в очередь
  messageQueue.push(msg);

  if (isOnline) {
    // Отправляйте асинхронно
    setTimeout(() => sendToSupabase(msg), 100);
  } else {
    // Сохраните локально
    await cacheMessage(msg);
  }
});

async function sendToSupabase(msg) {
  try {
    const { error, data } = await client
      .from("messages")
      .insert([{
        username: msg.username,
        content: msg.content
      }])
      .select();

    if (error) throw error;

    // Обновите ID сообщения
    const elem = document.getElementById(`msg-${msg.id}`);
    if (elem && data && data[0]) {
      elem.id = `msg-${data[0].id}`;
      elem.classList.remove("pending");
    }

    messageQueue = messageQueue.filter(m => m.id !== msg.id);
    await cacheMessage(msg);

  } catch (error) {
    console.error("Send error:", error);
  } finally {
    sendButton.disabled = false;
  }
}

async function syncMessages() {
  if (syncing || messageQueue.length === 0) return;
  
  syncing = true;

  for (const msg of messageQueue) {
    await sendToSupabase(msg);
    await new Promise(r => setTimeout(r, 500)); // Небольшая задержка
  }

  syncing = false;
}

// ============================================
// ОТОБРАЖЕНИЕ СООБЩЕНИЙ
// ============================================

const displayedIds = new Set();

function displayMessage(msg) {
  if (displayedIds.has(msg.id)) return;

  displayedIds.add(msg.id);

  const element = document.createElement("div");
  element.className = "chat-message" + (msg.pending ? " pending" : "");
  element.id = `msg-${msg.id}`;

  const header = document.createElement("div");
  header.className = "chat-message-header";

  const username = document.createElement("span");
  username.className = "chat-username";
  username.textContent = msg.username;

  const time = document.createElement("span");
  time.textContent = new Date(msg.created_at).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit"
  });

  header.append(username, time);

  const content = document.createElement("div");
  content.className = "chat-message-content";
  content.textContent = msg.content;

  element.append(header, content);
  messagesContainer.appendChild(element);

  // Асинхронная прокрутка
  requestAnimationFrame(() => {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  });

  // Удаляйте старые (больше 100)
  if (messagesContainer.children.length > 100) {
    const old = messagesContainer.children[0];
    displayedIds.delete(parseInt(old.id.split("-")[1]));
    old.remove();
  }
}

// ============================================
// ЗАГРУЗКА СООБЩЕНИЙ
// ============================================

async function loadMessages() {
  // Сначала покажите кэш
  const cached = await getCachedMessages();
  
  messagesContainer.innerHTML = "";
  displayedIds.clear();

  cached.forEach(displayMessage);

  if (!isOnline) {
    console.log("Оффлайн режим - кэш загружен");
    return;
  }

  // Потом загрузите свежие
  try {
    const { data, error } = await client
      .from("messages")
      .select("*")
      .order("created_at", { ascending: true })
      .limit(100);

    if (error) throw error;

    // Обновите кэш
    await clearCache();
    for (const msg of data) {
      await cacheMessage(msg);
    }

    // Очистите UI и перезагрузите
    messagesContainer.innerHTML = "";
    displayedIds.clear();

    data.forEach(displayMessage);

  } catch (error) {
    console.error("Load error:", error);
  }
}

// ============================================
// REALTIME (если доступно)
// ============================================

let realtimeTimeout = null;

function connectRealtime() {
  if (!isOnline) return;

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
        displayMessage(payload.new);
        cacheMessage(payload.new);
      }
    )
    .subscribe((status) => {
      console.log("Realtime:", status);

      if (status === "SUBSCRIBED") {
        loadMessages();
      }

      if (status === "CHANNEL_ERROR" || status === "CLOSED") {
        console.warn("Realtime потеряно");
        
        // Пересоедините через 5 сек
        clearTimeout(realtimeTimeout);
        realtimeTimeout = setTimeout(connectRealtime, 5000);
      }
    });

  return channel;
}

// ============================================
// ВОССТАНОВЛЕНИЕ ПРИ ПОТЕРЕ ФОКУСА
// ============================================

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    console.log("Восстановление соединения...");
    loadMessages();
    if (isOnline) {
      connectRealtime();
    }
  }
});

// ============================================
// ИНИЦИАЛИЗАЦИЯ
// ============================================

loadMessages();
connectRealtime();

console.log("🚀 Chat initialized with offline support");
