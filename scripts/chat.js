const SUPABASE_URL = "https://ipyqydrqctziltcuboop.supabase.co";
const SUPABASE_KEY = "sb_publishable_0PNw-wO6K1oMyb8XhLhgpA_GoXJivQV";

const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const messagesContainer = document.getElementById("messages");
const chatForm = document.getElementById("chat-form");
const usernameInput = document.getElementById("username");
const messageInput = document.getElementById("message-input");
const sendButton = document.getElementById("send-button");

usernameInput.value = localStorage.getItem("nightmar_username") || "";

let lastMessageId = 0;
let isLoading = false;
let realtimeConnected = false;

// ============================================
// ОПТИМИЗАЦИЯ 1: Локальный кэш в IndexedDB
// ============================================

const openIndexedDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("NightmarChat", 1);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("messages")) {
        db.createObjectStore("messages", { keyPath: "id" });
      }
    };
  });
};

const cacheMessage = async (message) => {
  try {
    const db = await openIndexedDB();
    const tx = db.transaction("messages", "readwrite");
    tx.objectStore("messages").put(message);
  } catch (e) {
    console.error("Cache error:", e);
  }
};

const getCachedMessages = async () => {
  try {
    const db = await openIndexedDB();
    const tx = db.transaction("messages", "readonly");
    return new Promise((resolve) => {
      const request = tx.objectStore("messages").getAll();
      request.onsuccess = () => resolve(request.result.sort((a, b) => a.id - b.id));
    });
  } catch (e) {
    console.error("Cache read error:", e);
    return [];
  }
};

// ============================================
// ОПТИМИЗАЦИЯ 2: Отправка сообщений быстрее
// ============================================

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const username = usernameInput.value.trim();
  const content = messageInput.value.trim();

  if (!username || !content) return;

  localStorage.setItem("nightmar_username", username);

  // СРАЗУ покажите сообщение (optimistic update)
  const optimisticMessage = {
    id: Date.now(),
    username,
    content,
    created_at: new Date().toISOString(),
    pending: true
  };

  displayMessage(optimisticMessage);
  messageInput.value = "";
  sendButton.disabled = true;

  // Отправляйте в фоне
  setTimeout(async () => {
    const { error, data } = await client
      .from("messages")
      .insert([{ username, content }])
      .select();

    if (error) {
      console.error("Ошибка отправки:", error);
      alert("Ошибка отправки сообщения");
      
      // Удалите оптимистичное сообщение
      const elem = document.getElementById(`msg-${optimisticMessage.id}`);
      if (elem) elem.remove();
    } else if (data && data[0]) {
      // Замените оптимистичное сообщение на реальное
      const oldElem = document.getElementById(`msg-${optimisticMessage.id}`);
      if (oldElem) oldElem.remove();
      
      displayMessage(data[0]);
      await cacheMessage(data[0]);
    }
    
    sendButton.disabled = false;
  }, 0);
});

// ============================================
// ОПТИМИЗАЦИЯ 3: Умное отображение
// ============================================

const displayedIds = new Set();

function displayMessage(message) {
  if (displayedIds.has(message.id)) return;

  displayedIds.add(message.id);
  lastMessageId = Math.max(lastMessageId, message.id || 0);

  const element = document.createElement("div");
  element.className = "chat-message" + (message.pending ? " pending" : "");
  element.id = `msg-${message.id}`;

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

  header.append(username, time);

  const content = document.createElement("div");
  content.className = "chat-message-content";
  content.textContent = message.content;

  element.append(header, content);
  messagesContainer.appendChild(element);

  // Прокрутка АСИНХРОННО
  requestAnimationFrame(() => {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  });

  // Удалите старые сообщения
  if (messagesContainer.children.length > 150) {
    const toRemove = messagesContainer.children[0];
    displayedIds.delete(parseInt(toRemove.id.split("-")[1]));
    toRemove.remove();
  }
}

// ============================================
// ОПТИМИЗАЦИЯ 4: Lazy loading + кэш
// ============================================

async function loadMessages() {
  if (isLoading) return;
  isLoading = true;

  try {
    // Сначала покажите кэшированные сообщения
    const cached = await getCachedMessages();
    
    messagesContainer.innerHTML = "";
    displayedIds.clear();
    lastMessageId = 0;

    cached.forEach(displayMessage);

    // Потом загрузите свежие
    const { data, error } = await client
      .from("messages")
      .select("*")
      .order("created_at", { ascending: true })
      .limit(100);

    if (error) {
      console.error("Ошибка загрузки:", error);
      isLoading = false;
      return;
    }

    // Очистите старый кэш и добавьте новый
    await new Promise(async (resolve) => {
      const db = await openIndexedDB();
      const tx = db.transaction("messages", "readwrite");
      tx.objectStore("messages").clear();
      
      data.forEach(msg => {
        tx.objectStore("messages").put(msg);
      });
      
      tx.oncomplete = resolve;
    });

    messagesContainer.innerHTML = "";
    displayedIds.clear();
    lastMessageId = 0;

    data.forEach(displayMessage);

  } catch (e) {
    console.error("Load error:", e);
  } finally {
    isLoading = false;
  }
}

// ============================================
// ОПТИМИЗАЦИЯ 5: Realtime с отступлением
// ============================================

let realtimeChannel = null;

function connectRealtime() {
  if (realtimeChannel) return;

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
        if (payload.new && payload.new.id > lastMessageId) {
          displayMessage(payload.new);
          cacheMessage(payload.new);
        }
      }
    )
    .subscribe(async (status) => {
      console.log("Realtime status:", status);

      if (status === "SUBSCRIBED") {
        realtimeConnected = true;
        await loadMessages();
      }

      if (status === "CHANNEL_ERROR") {
        realtimeConnected = false;
        console.warn("Realtime потеряно, переподключаемся через 3 сек...");
        
        realtimeChannel = null;
        setTimeout(connectRealtime, 3000);
      }
    });
}

// ============================================
// ОПТИМИЗАЦИЯ 6: Восстановление при потере фокуса
// ============================================

document.addEventListener("visibilitychange", () => {
  if (!document.hidden && !realtimeConnected) {
    console.log("Восстановление соединения...");
    connectRealtime();
  }
});

// Проверка соединения каждые 30 сек
setInterval(() => {
  if (!realtimeConnected && !document.hidden) {
    console.log("Переподключение...");
    connectRealtime();
  }
}, 30000);

// ============================================
// ИНИЦИАЛИЗАЦИЯ
// ============================================

loadMessages();
connectRealtime();
