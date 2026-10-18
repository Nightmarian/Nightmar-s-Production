// ============================================
// NIGHTMAR'S PRODUCTION CHAT - FIREBASE VERSION
// ============================================

// Вставьте свой Database URL отсюда:
// https://console.firebase.google.com → Project Settings

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyC3tJoWcOz3K_moTA-uU4CzDWmQRLeAR1k",
  authDomain: "nightmar-chat.firebaseapp.com",
  databaseURL: "https://nightmar-chat-default-rtdb.firebaseio.com",
  projectId: "nightmar-chat",
  storageBucket: "nightmar-chat.firebasestorage.app",
  messagingSenderId: "586295878462",
  appId: "1:586295878462:web:e5fc8f962260ab1143826f"
};

firebase.initializeApp(FIREBASE_CONFIG);
const database = firebase.database();

// Получение элементов
const messagesContainer = document.getElementById("messages");
const chatForm = document.getElementById("chat-form");
const usernameInput = document.getElementById("username");
const messageInput = document.getElementById("message-input");
const sendButton = document.getElementById("send-button");
const statusEl = document.getElementById("status");

// Хранение
usernameInput.value = localStorage.getItem("nightmar_username") || "";
let lastMessageId = 0;
const displayedIds = new Set();

// ============================================
// СТАТУС СОЕДИНЕНИЯ
// ============================================

database.ref(".info/connected").on("value", (snapshot) => {
  if (snapshot.val() === true) {
    statusEl.textContent = "● LIVE";
    statusEl.style.color = "#b30000";
    console.log("✅ Подключено к Firebase");
  } else {
    statusEl.textContent = "● OFFLINE";
    statusEl.style.color = "#777";
    console.log("❌ Отключено от Firebase");
  }
});

// ============================================
// ОТОБРАЖЕНИЕ СООБЩЕНИЙ
// ============================================

function displayMessage(message) {
  if (displayedIds.has(message.id)) return;

  displayedIds.add(message.id);

  const element = document.createElement("div");
  element.className = "chat-message";
  element.id = `msg-${message.id}`;

  const header = document.createElement("div");
  header.className = "chat-message-header";

  const username = document.createElement("span");
  username.className = "chat-username";
  username.textContent = message.username;

  const time = document.createElement("span");
  const messageTime = new Date(message.timestamp || 0);
  time.textContent = messageTime.toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit"
  });

  header.append(username, time);

  const content = document.createElement("div");
  content.className = "chat-message-content";
  content.textContent = message.text;

  element.append(header, content);
  messagesContainer.appendChild(element);

  // Прокрутка
  requestAnimationFrame(() => {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  });

  // Удалите старые сообщения (кроме последних 150)
  if (messagesContainer.children.length > 150) {
    const toRemove = messagesContainer.children[0];
    displayedIds.delete(parseInt(toRemove.id.split("-")[1]));
    toRemove.remove();
  }
}

// ============================================
// ЗАГРУЗКА ИСТОРИИ
// ============================================

function loadMessages() {
  messagesContainer.innerHTML = '<div class="system-message">Загрузка сообщений...</div>';

  database.ref("messages")
    .orderByChild("timestamp")
    .limitToLast(100)
    .once("value", (snapshot) => {
      messagesContainer.innerHTML = "";
      displayedIds.clear();

      const messages = [];
      snapshot.forEach((childSnapshot) => {
        messages.push({
          id: childSnapshot.key,
          ...childSnapshot.val()
        });
      });

      messages.forEach(displayMessage);
    });
}

// ============================================
// ОТПРАВКА СООБЩЕНИЙ
// ============================================

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const username = usernameInput.value.trim();
  const text = messageInput.value.trim();

  if (!username || !text) return;

  localStorage.setItem("nightmar_username", username);

  // СРАЗУ покажите сообщение (optimistic update)
  const optimisticId = Date.now().toString();
  const optimisticMessage = {
    id: optimisticId,
    username,
    text,
    timestamp: Date.now()
  };

  displayMessage(optimisticMessage);
  messageInput.value = "";
  sendButton.disabled = true;

  // Отправляйте в Firebase
  try {
    await database.ref("messages").push({
      username,
      text,
      timestamp: firebase.database.ServerValue.TIMESTAMP
    });

    console.log("✅ Сообщение отправлено");
  } catch (error) {
    console.error("❌ Ошибка отправки:", error);
    alert("Ошибка отправки сообщения");
    
    // Удалите оптимистичное сообщение
    const elem = document.getElementById(`msg-${optimisticId}`);
    if (elem) elem.remove();
  } finally {
    sendButton.disabled = false;
  }
});

// ============================================
// REALTIME LISTENER
// ============================================

function startListening() {
  database.ref("messages")
    .orderByChild("timestamp")
    .limitToLast(1)
    .on("child_added", (snapshot) => {
      const message = {
        id: snapshot.key,
        ...snapshot.val()
      };

      // Показывайте только новые сообщения
      if (message.timestamp > lastMessageId) {
        lastMessageId = message.timestamp;
        displayMessage(message);
      }
    });
}

// ============================================
// ИНИЦИАЛИЗАЦИЯ
// ============================================

loadMessages();
startListening();

console.log("🚀 Chat started with Firebase");
