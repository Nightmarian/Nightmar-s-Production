// ============================================
// NIGHTMAR'S PRODUCTION CHAT - FIXED
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

let isOnline = navigator.onLine;
let syncing = false;
let isLoading = false;
let realtimeChannel = null;
let messageQueue = [];
const displayedIds = new Set();
const pendingMap = new Map(); // tempId -> {username, content}

function updateStatus() {
  const status = document.querySelector(".chat-online");
  if (!status) return;
  if (isOnline) {
    status.textContent = "● LIVE";
    status.style.color = "#b30000";
  } else {
    status.textContent = "● OFFLINE";
    status.style.color = "#999";
  }
}
updateStatus();

window.addEventListener("online", () => { isOnline = true; updateStatus(); syncMessages(); connectRealtime(); });
window.addEventListener("offline", () => { isOnline = false; updateStatus(); });

// ============================================
// КЭШ
// ============================================
async function cacheMessage(msg) {
  try {
    const cached = await localforage.getItem("messages") || [];
    // не кэшируем pending дубли
    if (cached.some(m => m.id === msg.id)) return;
    cached.push(msg);
    await localforage.setItem("messages", cached.slice(-200));
  } catch(e) { console.error(e); }
}
async function getCachedMessages() {
  try { return await localforage.getItem("messages") || []; } catch(e){ return []; }
}

// ============================================
// ОТОБРАЖЕНИЕ - БЕЗ МЕРЦАНИЯ
// ============================================
function displayMessage(msg, isPending = false) {
  const idStr = String(msg.id);
  if (displayedIds.has(idStr)) return;

  // ЗАЩИТА ОТ ДУБЛЯ: если это наше pending сообщение, пришедшее с сервера
  if (!isPending) {
    for (const [tempId, pending] of pendingMap.entries()) {
      // если совпал автор+текст и прошло < 10 сек - это одно и то же сообщение
      if (pending.username === msg.username && pending.content === msg.content && (Date.now() - parseInt(tempId.split('_')[1]) < 10000)) {
        const elem = document.getElementById(`msg-${tempId}`);
        if (elem) {
          elem.id = `msg-${idStr}`;
          elem.classList.remove("pending");
          displayedIds.delete(String(tempId));
          displayedIds.add(idStr);
          pendingMap.delete(tempId);
          // удаляем из очереди
          messageQueue = messageQueue.filter(m => String(m.id) !== String(tempId));
          return;
        }
      }
    }
  }

  displayedIds.add(idStr);
  if (isPending) pendingMap.set(idStr, { username: msg.username, content: msg.content });

  const element = document.createElement("div");
  element.className = "chat-message" + (isPending ? " pending" : "");
  element.id = `msg-${idStr}`;

  const header = document.createElement("div");
  header.className = "chat-message-header";
  const username = document.createElement("span");
  username.className = "chat-username";
  username.textContent = msg.username;
  const time = document.createElement("span");
  time.textContent = new Date(msg.created_at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  header.append(username, time);

  const content = document.createElement("div");
  content.className = "chat-message-content";
  content.textContent = msg.content;

  element.append(header, content);
  messagesContainer.appendChild(element);

  if (messagesContainer.children.length > 100) {
    const old = messagesContainer.children[0];
    displayedIds.delete(old.id.replace('msg-',''));
    old.remove();
  }
  // плавный скролл только если юзер внизу
  const isNearBottom = messagesContainer.scrollHeight - messagesContainer.scrollTop - messagesContainer.clientHeight < 150;
  if (isNearBottom) {
    requestAnimationFrame(() => {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    });
  }
}

// ============================================
// ОТПРАВКА
// ============================================
chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const username = usernameInput.value.trim();
  const content = messageInput.value.trim();
  if (!username || !content) return;

  localStorage.setItem("nightmar_username", username);

  const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
  const msg = { id: tempId, username, content, created_at: new Date().toISOString() };

  displayMessage(msg, true);
  messageInput.value = "";
  
  messageQueue.push(msg);
  await cacheMessage({...msg, pending: true});

  if (isOnline) {
    sendToSupabase(msg);
  } else {
    sendButton.disabled = false;
  }
});

async function sendToSupabase(msg) {
  sendButton.disabled = true;
  try {
    const { data, error } = await client.from("messages").insert([{ username: msg.username, content: msg.content }]).select().single();
    if (error) throw error;
    if (data) {
      // realtime сам подхватит, но на случай если realtime лагает - обновим вручную
      displayMessage(data, false);
      await cacheMessage(data);
    }
  } catch (error) {
    console.error("Send error:", error);
    // останется pending, отправится при syncMessages
  } finally {
    sendButton.disabled = false;
  }
}

async function syncMessages() {
  if (syncing || messageQueue.length === 0 || !isOnline) return;
  syncing = true;
  const queueCopy = [...messageQueue];
  for (const msg of queueCopy) {
    await sendToSupabase(msg);
    await new Promise(r => setTimeout(r, 300));
  }
  syncing = false;
}

// ============================================
// ЗАГРУЗКА - ИСПРАВЛЕНА
// ============================================
async function loadMessages() {
  if (isLoading) return;
  isLoading = true;
  try {
    // 1. Если пусто - покажи кэш один раз
    if (displayedIds.size === 0) {
      const cached = await getCachedMessages();
      cached.slice(-100).forEach(m => displayMessage(m, !!m.pending));
    }
    if (!isOnline) return;

    // 2. Грузим последние 100 сообщений, а не первые 100
    const { data, error } = await client
      .from("messages")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) throw error;
    if (!data) return;

    // 3. МЕРЖИМ, а не стираем все! Нет мерцания
    const sorted = data.reverse();
    // обновляем кэш целиком
    await localforage.setItem("messages", sorted.slice(-200));

    sorted.forEach(msg => displayMessage(msg, false));

  } catch (error) {
    console.error("Load error:", error);
  } finally {
    isLoading = false;
  }
}

// ============================================
// REALTIME - БЕЗ УТЕЧЕК
// ============================================
async function connectRealtime() {
  if (!isOnline) return;
  // закрываем старый канал перед созданием нового
  if (realtimeChannel) {
    await client.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }

  realtimeChannel = client
    .channel("nightmar-chat-live-v2") // сменил имя чтобы сбросить старые подключения
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
      displayMessage(payload.new, false);
      cacheMessage(payload.new);
    })
    .subscribe((status) => {
      console.log("Realtime:", status);
      if (status === "SUBSCRIBED") {
        loadMessages();
      }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        console.warn("Realtime упал, реконнект через 5с");
        setTimeout(connectRealtime, 5000);
      }
    });
}

document.addEventListener("visibilitychange", () => {
  if (!document.hidden && isOnline) {
    loadMessages();
    // не пересоздаем канал если он уже SUBSCRIBED
    if (!realtimeChannel) connectRealtime();
  }
});

// INIT
loadMessages();
connectRealtime();
