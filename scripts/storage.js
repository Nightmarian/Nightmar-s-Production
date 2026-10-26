(() => {
  "use strict";

  const config = window.NP_STORAGE_CONFIG || {};

  const API = (config.apiUrl || "").replace(/\/+$/, "");

  const STATUS_INTERVAL = config.statusInterval || 15000;
  const REQUEST_TIMEOUT = config.requestTimeout || 5000;
  const JOB_INTERVAL = config.jobInterval || 3000;

  const elements = {
    status: document.getElementById("storage-status"),
    statusText: document.getElementById("storage-status-text"),
    message: document.getElementById("storage-server-message"),
    active: document.getElementById("storage-active"),
    queue: document.getElementById("storage-queue"),
    lastCheck: document.getElementById("storage-last-check"),
    files: document.getElementById("storage-files"),
    count: document.getElementById("storage-count"),
    task: document.getElementById("storage-task"),
    taskState: document.getElementById("storage-task-state"),
    taskFilename: document.getElementById("storage-task-filename"),
    progressBar: document.getElementById("storage-progress-bar"),
    progressText: document.getElementById("storage-progress-text"),
    progressPercent: document.getElementById("storage-progress-percent"),
    taskActions: document.getElementById("storage-task-actions")
  };

  let serverOnline = false;
  let currentJob = null;
  let jobTimer = null;
  let statusChecking = false;

  // ======================================
  // HTTP
  // ======================================

  async function apiRequest(path, options = {}) {
    if (!API) {
      throw new Error("API_NOT_CONFIGURED");
    }

    const controller = new AbortController();

    const timeout = setTimeout(
      () => controller.abort(),
      REQUEST_TIMEOUT
    );

    try {
      const response = await fetch(API + path, {
        ...options,
        signal: controller.signal,
        cache: "no-store"
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || `HTTP ${response.status}`
        );
      }

      return data;
    } finally {
      clearTimeout(timeout);
    }
  }

  // ======================================
  // STATUS
  // ======================================

  function setStatus(state, message) {
    elements.status.className = "storage-status " + state;
    elements.statusText.textContent = state.toUpperCase();
    elements.message.textContent = message;
  }

  function updateButtons() {
    document.querySelectorAll(".storage-button").forEach(button => {
      button.disabled = !serverOnline || Boolean(currentJob);
    });
  }

  function setOffline() {
    serverOnline = false;

    setStatus(
      "offline",
      API
        ? "Сервер недоступен. Возможно, он выключен или соединение прервано. Попробуйте позже."
        : "Публичное подключение ещё не настроено. Хранилище временно недоступно."
    );

    elements.active.textContent = "ACTIVE TASKS: —";
    elements.queue.textContent = "QUEUE: —";

    updateButtons();
  }

  async function checkStatus() {
    if (statusChecking) return;

    statusChecking = true;

    try {
      const data = await apiRequest("/api/status");

      if (data.status !== "online") {
        throw new Error("SERVER_UNAVAILABLE");
      }

      serverOnline = true;

      const active = Number(data.active_jobs || 0);
      const queued = Number(data.queued_jobs || 0);

      elements.active.textContent =
        `ACTIVE TASKS: ${active}`;

      elements.queue.textContent =
        `QUEUE: ${queued}`;

      if (active > 0) {
        setStatus(
          "busy",
          "Сервер работает. Сейчас выполняется восстановление файла."
        );
      } else {
        setStatus(
          "online",
          "Сервер доступен. Можно запросить восстановление файла."
        );
      }

      await loadFiles();

    } catch (error) {
      setOffline();
    } finally {
      elements.lastCheck.textContent =
        "LAST CHECK: " + new Date().toLocaleTimeString("ru-RU");

      statusChecking = false;
    }
  }

  // ======================================
  // FILE CATALOG
  // ======================================

  async function loadFiles() {
    const data = await apiRequest("/api/files");

    elements.files.replaceChildren();

    elements.count.textContent =
      `FILES: ${data.count || 0}`;

    if (!data.files || data.files.length === 0) {
      const empty = document.createElement("div");

      empty.className = "storage-placeholder";
      empty.textContent = "В каталоге пока нет файлов.";

      elements.files.appendChild(empty);
      return;
    }

    for (const file of data.files) {
      elements.files.appendChild(
        createFileCard(file)
      );
    }

    updateButtons();
  }

  function createFileCard(file) {
    const card = document.createElement("div");
    card.className = "storage-file";

    const info = document.createElement("div");
    info.className = "storage-file-info";

    const name = document.createElement("div");
    name.className = "storage-file-name";
    name.textContent = file.name;

    const meta = document.createElement("div");
    meta.className = "storage-file-meta";
    meta.textContent = `${file.type} / ${file.size}`;

    const description = document.createElement("div");
    description.className = "storage-file-description";
    description.textContent = file.description || "";

    const button = document.createElement("button");
    button.className = "storage-button";
    button.textContent = "ВОССТАНОВИТЬ И СКАЧАТЬ";

    button.addEventListener("click", () => {
      startRestore(file);
    });

    info.append(name, meta, description);
    card.append(info, button);

    return card;
  }

  // ======================================
  // RESTORE
  // ======================================

  async function startRestore(file) {
    if (!serverOnline || currentJob) return;

    currentJob = { pending: true };
    updateButtons();

    elements.task.hidden = false;
    elements.taskFilename.textContent = file.name;
    elements.taskState.textContent = "CONNECTING";
    elements.progressBar.style.width = "0%";
    elements.progressText.textContent = "Отправка запроса...";
    elements.progressPercent.textContent = "0%";
    elements.taskActions.replaceChildren();

    try {
      const data = await apiRequest(
        `/api/restore/${encodeURIComponent(file.id)}`,
        { method: "POST" }
      );

      currentJob = {
        id: data.job_id,
        filename: file.name
      };

      await pollJob();

      jobTimer = setInterval(
        pollJob,
        JOB_INTERVAL
      );

    } catch (error) {
      showTaskError(error.message);
    }
  }

  async function pollJob() {
    if (!currentJob || !currentJob.id) return;

    try {
      const data = await apiRequest(
        `/api/job/${encodeURIComponent(currentJob.id)}`
      );

      elements.taskState.textContent =
        data.status.toUpperCase();

      const percent = Math.max(
        0,
        Math.min(100, Number(data.progress) || 0)
      );

      elements.progressBar.style.width = `${percent}%`;
      elements.progressPercent.textContent = `${percent}%`;
      elements.progressText.textContent =
        data.message || "Обработка...";

      if (data.status === "completed") {
        stopPolling();

        const link = document.createElement("a");
        link.className = "storage-download";
        link.textContent = "↓ СКАЧАТЬ ФАЙЛ";
        link.href = API + data.download_url;

        elements.taskActions.replaceChildren(link);

        currentJob = null;
        updateButtons();
      }

      if (data.status === "failed") {
        showTaskError(data.message || "Ошибка восстановления");
      }

    } catch (error) {
      showTaskError(error.message);
    }
  }

  function stopPolling() {
    if (jobTimer) {
      clearInterval(jobTimer);
      jobTimer = null;
    }
  }

  function showTaskError(message) {
    stopPolling();

    elements.taskState.textContent = "ERROR";
    elements.progressText.textContent = message;

    currentJob = null;
    updateButtons();
  }

  // ======================================
  // START
  // ======================================

  if (!API) {
    elements.files.innerHTML =
      '<div class="storage-placeholder">Каталог недоступен: сервер не подключён.</div>';
  }

  checkStatus();

  setInterval(
    checkStatus,
    STATUS_INTERVAL
  );
})();
