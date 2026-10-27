(() => {
  "use strict";

  // ======================================
  // NIGHTMAR STORAGE
  // FRONTEND ALPHA 3.3
  // SMART CACHE + CLEAN INTERFACE
  // ======================================

  const config = window.NP_STORAGE_CONFIG || {};

const connection =
  window.NP_STORAGE_CONNECTION;
  

  const SUPABASE_URL = (
    config.supabaseUrl || ""
  ).replace(/\/+$/, "");

  const SUPABASE_KEY = config.supabaseKey || "";

  const ENDPOINT_TABLE =
    config.endpointTable || "storage_endpoint";

  const STATUS_INTERVAL =
    config.statusInterval || 15000;

  const ENDPOINT_INTERVAL =
    config.endpointInterval || 15000;

  const REQUEST_TIMEOUT =
    config.requestTimeout || 5000;

  const JOB_INTERVAL =
    config.jobInterval || 3000;

  const FILES_INTERVAL = 5000;

  const STORAGE_KEY =
    "np_storage_active_job_v1";


  // ======================================
  // ELEMENTS
  // ======================================

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


  // ======================================
  // STATE
  // ======================================

  let API = "";
  let serverOnline = false;

  let currentJob = null;

  let endpointChecking = false;
  let statusChecking = false;
  let jobChecking = false;
  let filesChecking = false;

  let connectionErrors = 0;

  const fileCards = new Map();


  // ======================================
  // ENDPOINT VALIDATION
  // ======================================

  function validateEndpoint(value) {
    if (!value || typeof value !== "string") {
      return "";
    }

    try {
      const url = new URL(value);

      if (
        url.protocol !== "https:" ||
        !url.hostname.endsWith(".trycloudflare.com") ||
        url.pathname !== "/" ||
        url.search ||
        url.hash ||
        url.username ||
        url.password
      ) {
        return "";
      }

      return url.origin;
    } catch {
      return "";
    }
  }


  // ======================================
  // SUPABASE
  // ======================================

  async function fetchEndpoint() {
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      throw new Error("SUPABASE_NOT_CONFIGURED");
    }

    const url =
      SUPABASE_URL +
      "/rest/v1/" +
      ENDPOINT_TABLE +
      "?id=eq.1&select=api_url,updated_at";

    const controller = new AbortController();

    const timeout = setTimeout(
      () => controller.abort(),
      REQUEST_TIMEOUT
    );

    try {
      const response = await fetch(url, {
        headers: {
          apikey: SUPABASE_KEY
        },
        signal: controller.signal,
        cache: "no-store"
      });

      if (!response.ok) {
        throw new Error(
          `SUPABASE_HTTP_${response.status}`
        );
      }

      const rows = await response.json();

      if (!Array.isArray(rows) || rows.length === 0) {
        return "";
      }

      return validateEndpoint(rows[0].api_url);
    } finally {
      clearTimeout(timeout);
    }
  }


  // ======================================
  // LOCAL STORAGE
  // ======================================

  function saveJob(job) {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          ...job,
          apiUrl: API
        })
      );
    } catch (error) {
      console.warn("[STORAGE] Save failed:", error);
    }
  }

  function loadSavedJob() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);

      if (!raw) {
        return null;
      }

      const job = JSON.parse(raw);

      if (
        !job ||
        typeof job.id !== "string" ||
        !/^[a-f0-9]{32}$/.test(job.id) ||
        typeof job.apiUrl !== "string"
      ) {
        clearSavedJob();
        return null;
      }

      return job;
    } catch {
      clearSavedJob();
      return null;
    }
  }

  function clearSavedJob() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.warn("[STORAGE] Clear failed:", error);
    }
  }


  // ======================================
  // DISPLAY
  // ======================================

  function setStatus(state, message) {
    elements.status.className =
      "storage-status " + state;

    elements.statusText.textContent =
      state.toUpperCase();

    elements.message.textContent = message;
  }

  function setOffline(message) {
    serverOnline = false;

    setStatus(
      "offline",
      message ||
      "Сервер недоступен. Возможно, ноутбук выключен."
    );

    elements.active.textContent =
      "ACTIVE TASKS: —";

    elements.queue.textContent =
      "QUEUE: —";

    updateButtons();
  }

  function updateButtons() {
    for (const card of fileCards.values()) {
      card.button.disabled =
        !serverOnline || Boolean(currentJob);
    }
  }

  function formatRemaining(seconds) {
    const total = Math.max(
      0,
      Math.floor(Number(seconds) || 0)
    );

    const minutes = Math.floor(total / 60);
    const remainingSeconds = total % 60;

    return (
      `${minutes} мин ` +
      `${String(remainingSeconds).padStart(2, "0")} сек`
    );
  }


  // ======================================
  // API REQUEST
  // ======================================

  async function apiRequest(path, options = {}) {
    if (!API) {
      throw new Error("API_NOT_CONFIGURED");
    }

    const requestAPI = API;
    const controller = new AbortController();

    const timeout = setTimeout(
      () => controller.abort(),
      REQUEST_TIMEOUT
    );

    try {
      const response = await fetch(
        requestAPI + path,
        {
          ...options,
          signal: controller.signal,
          cache: "no-store"
        }
      );

      let data;

      try {
        data = await response.json();
      } catch {
        throw new Error(
          "Некорректный ответ сервера"
        );
      }

      if (!response.ok) {
        const error = new Error(
          data.error || `HTTP ${response.status}`
        );

        error.status = response.status;
        throw error;
      }

      return data;
    } finally {
      clearTimeout(timeout);
    }
  }


  // ======================================
  // ENDPOINT REFRESH
  // ======================================

  async function refreshEndpoint() {
    if (endpointChecking) {
      return;
    }

    endpointChecking = true;

    try {
      const newAPI = await fetchEndpoint();

      if (newAPI === API) {
        return;
      }

      API = newAPI;
      serverOnline = false;
      connectionErrors = 0;

      fileCards.clear();
      elements.files.replaceChildren();

      setOffline(
        API
          ? "Подключаемся к серверу..."
          : "Сервер выключен. Хранилище временно недоступно."
      );

      const savedJob = loadSavedJob();

      if (savedJob && savedJob.apiUrl !== API) {
        clearSavedJob();
        currentJob = null;
        elements.task.hidden = true;
      }

      if (!API) {
        return;
      }

      await checkStatus();
      await restoreSession();

    } catch (error) {
      console.warn(
        "[STORAGE] Supabase unavailable:",
        error
      );

      if (!API) {
        setOffline(
          "Не удалось получить адрес сервера из Supabase."
        );
      }
    } finally {
      endpointChecking = false;
    }
  }


  // ======================================
  // SERVER STATUS
  // ======================================

  async function checkStatus() {
    if (statusChecking || !API) {
      return;
    }

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

      if (active > 0 || queued > 0) {
        setStatus(
          "busy",
          "Сервер работает. Выполняется восстановление файла."
        );
      } else {
        setStatus(
          "online",
          "Сервер доступен. Можно восстанавливать файлы."
        );
      }

      connectionErrors = 0;

      await loadFiles();

    } catch (error) {
      setOffline();
    } finally {
      elements.lastCheck.textContent =
        "LAST CHECK: " +
        new Date().toLocaleTimeString("ru-RU");

      statusChecking = false;
    }
  }


  // ======================================
  // SMART CACHE CATALOG
  // ======================================

  async function loadFiles() {
    if (filesChecking || !API || !serverOnline) {
      return;
    }

    filesChecking = true;

    try {
      const data = await apiRequest("/api/files");

      elements.count.textContent =
        `FILES: ${data.count || 0}`;

      const received = new Set();

      for (const file of data.files || []) {
        received.add(file.id);

        let card = fileCards.get(file.id);

        if (!card) {
          card = createFileCard();
          fileCards.set(file.id, card);
          elements.files.appendChild(card.root);
        }

        updateFileCard(file, card);
      }

      for (const [id, card] of fileCards) {
        if (!received.has(id)) {
          card.root.remove();
          fileCards.delete(id);
        }
      }

      updateButtons();

    } catch (error) {
      console.warn(
        "[STORAGE] Catalog unavailable:",
        error
      );
    } finally {
      filesChecking = false;
    }
  }


  function createFileCard() {
    const root = document.createElement("div");
    root.className = "storage-file";

    const info = document.createElement("div");
    info.className = "storage-file-info";

    const name = document.createElement("div");
    name.className = "storage-file-name";

    const meta = document.createElement("div");
    meta.className = "storage-file-meta";

    const description = document.createElement("div");
    description.className =
      "storage-file-description";

    const cacheStatus = document.createElement("div");
    cacheStatus.className = "storage-cache-status";

    const cacheMessage = document.createElement("div");
    cacheMessage.className = "storage-cache-message";

    const button = document.createElement("button");
    button.className = "storage-button";

    info.append(
      name,
      meta,
      description,
      cacheStatus,
      cacheMessage
    );

    root.append(info, button);

    return {
      root,
      name,
      meta,
      description,
      cacheStatus,
      cacheMessage,
      button
    };
  }


  function updateFileCard(file, card) {
    card.name.textContent = file.name;

    card.meta.textContent =
      `${file.type} / ${file.size}`;

    card.description.textContent =
      file.description || "";

    const cache = file.cache || {
      status: "available"
    };

    card.button.onclick = null;

    if (cache.status === "completed") {
      card.cacheStatus.className =
        "storage-cache-status completed";

      card.cacheStatus.textContent =
        "● ВОССТАНОВЛЕН";

      card.cacheMessage.textContent =
        "Файл готов. Быстрое скачивание доступно ещё " +
        formatRemaining(cache.expires_in);

      card.button.textContent =
        "↓ СКАЧАТЬ БЕЗ ОЖИДАНИЯ";

      card.button.onclick = () => {
        downloadFile(cache.job_id);
      };

    } else if (cache.status === "processing") {
      card.cacheStatus.className =
        "storage-cache-status processing";

      card.cacheStatus.textContent =
        "● ВОССТАНАВЛИВАЕТСЯ";

      card.cacheMessage.textContent =
        cache.message || "Обработка файла...";

      card.button.textContent =
        "ПОДКЛЮЧИТЬСЯ К ЗАДАЧЕ";

      card.button.onclick = () => {
        connectToJob(file, cache.job_id);
      };

    } else if (cache.status === "queued") {
      card.cacheStatus.className =
        "storage-cache-status queued";

      card.cacheStatus.textContent =
        "● В ОЧЕРЕДИ";

      card.cacheMessage.textContent =
        "Ожидание свободного декодера.";

      card.button.textContent =
        "ПОДКЛЮЧИТЬСЯ К ОЧЕРЕДИ";

      card.button.onclick = () => {
        connectToJob(file, cache.job_id);
      };

    } else {
      card.cacheStatus.className =
        "storage-cache-status available";

      card.cacheStatus.textContent =
        "○ НЕ ВОССТАНОВЛЕН";

      card.cacheMessage.textContent =
        "Для скачивания потребуется восстановление файла.";

      card.button.textContent =
        "ВОССТАНОВИТЬ И СКАЧАТЬ";

      card.button.onclick = () => {
        startRestore(file);
      };
    }
  }


  // ======================================
  // DIRECT DOWNLOAD
  // ======================================

  function downloadFile(jobId) {
    if (
      !serverOnline ||
      !API ||
      !jobId
    ) {
      return;
    }

    // Используем обычную загрузку браузера.
    // Файл скачивается напрямую с API.

    const link = document.createElement("a");

    link.href =
      API + "/api/download/" +
      encodeURIComponent(jobId);

    link.style.display = "none";

    document.body.appendChild(link);

    link.click();

    link.remove();
  }


  // ======================================
  // CONNECT TO EXISTING JOB
  // ======================================

  async function connectToJob(file, jobId) {
    if (!serverOnline || currentJob || !jobId) {
      return;
    }

    currentJob = {
      id: jobId,
      filename: file.name,
      apiUrl: API
    };

    saveJob(currentJob);

    showTask(file.name);

    updateProgress(
      "connecting",
      0,
      "Подключаемся к существующей задаче..."
    );

    updateButtons();

    await pollJob();
  }


  // ======================================
  // TASK DISPLAY
  // ======================================

  function showTask(filename) {
    elements.task.hidden = false;

    elements.taskFilename.textContent =
      filename || "Восстановление файла";

    elements.taskActions.replaceChildren();
  }


  function hideTask() {
    elements.task.hidden = true;
    elements.taskActions.replaceChildren();
  }


  function updateProgress(status, progress, message) {
    const percent = Math.max(
      0,
      Math.min(100, Number(progress) || 0)
    );

    elements.taskState.textContent =
      String(status).toUpperCase();

    elements.progressBar.style.width =
      `${percent}%`;

    elements.progressPercent.textContent =
      `${percent}%`;

    elements.progressText.textContent =
      message || "Обработка...";
  }


  // ======================================
  // START RESTORE
  // ======================================

  async function startRestore(file) {
    if (!serverOnline || currentJob) {
      return;
    }

    currentJob = {
      pending: true,
      filename: file.name
    };

    updateButtons();

    showTask(file.name);

    updateProgress(
      "connecting",
      0,
      "Отправка запроса на восстановление..."
    );

    try {
      const data = await apiRequest(
        `/api/restore/${encodeURIComponent(file.id)}`,
        {
          method: "POST"
        }
      );

      if (!data.job_id) {
        throw new Error(
          "Сервер не вернул идентификатор задачи"
        );
      }

      currentJob = {
        id: data.job_id,
        filename: file.name,
        apiUrl: API
      };

      saveJob(currentJob);

      await pollJob();

    } catch (error) {
      showTaskError(error.message);
    }
  }


  // ======================================
  // JOB POLLING
  // ======================================

  async function pollJob() {
    if (
      !currentJob ||
      !currentJob.id ||
      jobChecking ||
      !API
    ) {
      return;
    }

    jobChecking = true;

    const jobId = currentJob.id;

    try {
      const data = await apiRequest(
        `/api/job/${encodeURIComponent(jobId)}`
      );

      if (
        !currentJob ||
        currentJob.id !== jobId
      ) {
        return;
      }

      connectionErrors = 0;

      if (data.status === "completed") {
        finishJob();
        return;
      }

      if (data.status === "failed") {
        showTaskError(
          data.message || "Ошибка восстановления"
        );
        return;
      }

      updateProgress(
        data.status,
        data.progress,
        data.message
      );

    } catch (error) {
      if (error.status === 404) {
        showTaskError(
          "Задача больше не существует на сервере."
        );
        return;
      }

      connectionErrors++;

      elements.taskState.textContent =
        "RECONNECTING";

      elements.progressText.textContent =
        "Соединение потеряно. Повторное подключение...";

      if (connectionErrors >= 2) {
        setOffline();
      }

    } finally {
      jobChecking = false;
    }
  }


  // ======================================
  // JOB COMPLETED
  // ======================================

  function finishJob() {
    clearSavedJob();

    currentJob = null;

    hideTask();

    updateButtons();

    loadFiles();

    checkStatus();
  }


  // ======================================
  // ERRORS
  // ======================================

  function showTaskError(message) {
    updateProgress(
      "error",
      0,
      message
    );

    clearSavedJob();

    currentJob = null;

    updateButtons();
  }


  // ======================================
  // RESTORE SESSION
  // ======================================

  async function restoreSession() {
    if (currentJob) {
      return;
    }

    const savedJob = loadSavedJob();

    if (!savedJob) {
      return;
    }

    if (savedJob.apiUrl !== API) {
      clearSavedJob();
      return;
    }

    currentJob = savedJob;

    showTask(savedJob.filename);

    updateProgress(
      "reconnecting",
      0,
      "Восстанавливаем соединение с задачей..."
    );

    updateButtons();

    await pollJob();
  }

  connection.subscribe(async state => {
  const newAPI = state.apiUrl || "";

  if (newAPI !== API) {
    API = newAPI;

    fileCards.clear();
    elements.files.replaceChildren();

    const savedJob = loadSavedJob();

    if (
      savedJob &&
      savedJob.apiUrl !== API
    ) {
      clearSavedJob();
      currentJob = null;
      hideTask();
    }
  }

  if (
    state.status === "online" ||
    state.status === "busy"
  ) {
    serverOnline = true;

    setStatus(
      state.status,
      state.status === "busy"
        ? "Сервер занят восстановлением файла."
        : "Сервер доступен."
    );

    elements.active.textContent =
      `ACTIVE TASKS: ${state.activeJobs}`;

    elements.queue.textContent =
      `QUEUE: ${state.queuedJobs}`;

    updateButtons();

    await loadFiles();
    await restoreSession();

  } else if (state.status === "offline") {
    setOffline();
  }
});

  // ======================================
  // INITIALIZATION
  // ======================================

 async function initialize() {
  hideTask();

  const savedState = connection.getState();

  if (
    savedState.apiUrl &&
    (
      savedState.status === "online" ||
      savedState.status === "busy"
    )
  ) {
    API = savedState.apiUrl;
    serverOnline = true;

    setStatus(
      savedState.status,
      "Восстановлено последнее подключение. Проверяем доступность..."
    );

    await loadFiles();
    await restoreSession();
  } else {
    setStatus(
      "connecting",
      "Подключение к Nightmar Storage..."
    );
  }

  await connection.check();
}

  initialize();


  // ======================================
  // TIMERS
  // ======================================

 setInterval(
  () => connection.check(),
  STATUS_INTERVAL
);

  setInterval(
    pollJob,
    JOB_INTERVAL
  );

  setInterval(
    loadFiles,
    FILES_INTERVAL
  );


  // ======================================
  // EVENTS
  // ======================================

  window.addEventListener(
    "online",
    () => {
      
      connection.check();
      pollJob();
    }
  );

  document.addEventListener(
    "visibilitychange",
    () => {
      if (!document.hidden) {

        connection.check();
        pollJob();
        loadFiles();
      }
    }
  );

})();
