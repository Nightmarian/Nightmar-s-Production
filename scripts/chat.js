// NIGHTMAR'S PRODUCTION CHAT

const SUPABASE_URL = "https://ipyqydrqctziltcuboop.supabase.co";

// ВСТАВЬ СВОЙ PUBLISHABLE KEY
const SUPABASE_KEY = "sb_publishable_0PNw-wO6K1oMyb8XhLhgpA_GoXJivQV";

const client = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

const messagesContainer = document.getElementById("messages");
const chatForm = document.getElementById("chat-form");
const usernameInput = document.getElementById("username");
const messageInput = document.getElementById("message-input");

usernameInput.value = localStorage.getItem("nightmar_username") || "";

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

  time.textContent = new Date(
    message.created_at
  ).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit"
  });

  header.append(username, time);

  const content = document.createElement("div");
  content.className = "chat-message-content";
  content.textContent = message.content;

  element.append(header, content);
  messagesContainer.appendChild(element);

  messagesContainer.scrollTop =
    messagesContainer.scrollHeight;
}

// ЗАГРУЗКА ИСТОРИИ

async function loadMessages() {

  const { data, error } = await client
    .from("messages")
    .select("*")
    .order("created_at", { ascending: true })
    .limit(100);

  if (error) {
    console.error(error);
    return;
  }

  messagesContainer.innerHTML = "";

  data.forEach(displayMessage);
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

client
  .channel("public-chat")
  .on(
    "postgres_changes",
    {
      event: "INSERT",
      schema: "public",
      table: "messages"
    },
    payload => {
      displayMessage(payload.new);
    }
  )
  .subscribe();

// START

loadMessages();
