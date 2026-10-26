(() => {
  "use strict";

  // ======================================
  // NIGHTMAR STORAGE
  // FRONTEND ALPHA 3.2
  // SMART CACHE
  // ======================================

  const config = window.NP_STORAGE_CONFIG || {};

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

  let statusChecking = false;
  let endpointChecking = false;
  let jobChecking = false;
  let filesChecking = false;

  let connectionErrors = 0;
  let sessionRestored = false;

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
    document.querySelectorAll(
      ".storage-button"
    ).forEach(button => {
      button.disabled =
        !serverOnline || Boolean(currentJob);
    });
  }

  function formatRemaining(seconds) {
    const total = Math.max(
      0,
      Math.floor(Number(seconds) || 0)
    );

    const minutes = Math.floor(total / 60);
    const remainingSeconds = total % 60;

    return `${minutes} мин ${String(
      remainingSeconds
    ).padStart(2, "0")} сек`;
  }


  // ======================================
  // API
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
  // ENDPOINT
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

      if (!API) {
        return;
      }

      const savedJob = loadSavedJob();

      if (
        savedJob &&
        savedJob.apiUrl !== API
      ) {
        clearSavedJob();
        currentJob = null;
        elements.task.hidden = true;
      }

      await checkStatus();

      if (!sessionRestored) {
        sessionRestored = true;
        await restoreSession();
      }
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
      const data = await apiRequest(
        "/api/status"
      );

      if (data.status !== "online") {
        throw new Error("SERVER_UNAVAILABLE");
      }

      serverOnline = true;

      const active = Number(
        data.active_jobs || 0
      );

      const queued = Number(
        data.queued_jobs || 0
      );

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
      const data = await apiRequest(
        "/api/files"
      );

      elements.count.textContent =
        `FILES: ${data.count || 0}`;

      const received = new Set();

      for (const file of data.files || []) {
        received.add(file.id);

        let cardData = fileCards.get(file.id);

        if (!cardData) {
          cardData = createFileCard(file);

          fileCards.set(file.id, cardData);

          elements.files.appendChild(
            cardData.card
          );
        }

        updateFileCard(file, cardData);
      }

      for (const [id, cardData] of fileCards) {
        if (!received.has(id)) {
          cardData.card.remove();
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


  function createFileCard(file) {
    const card = document.createElement("div");
    card.className = "storage-file";

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
    cacheStatus.className =
      "storage-cache-status";

    const cacheMessage = document.createElement("div");
    cacheMessage.className =
      "storage-cache-message";

    const button = document.createElement("button");
    button.className = "storage-button";

    info.append(
      name,
      meta,
      description,
      cacheStatus,
      cacheMessage
    );

    card.append(info, button);

    return {
      card,
      name,
      meta,
      description,
      cacheStatus,
      cacheMessage,
      button
    };
  }


  function updateFileCard(file, elementsCard) {
    elementsCard.name.textContent = file.name;

    elementsCard.meta.textContent =
      `${file.type} / ${file.size}`;

    elementsCard.description.textContent =
      file.description || "";

    const cache = file.cache || {
      status: "available"
    };

    const status = cache.status;

    const button = elementsCard.button;

    button.onclick = null;

    if (status === "completed") {
      elementsCard.cacheStatus.className =
        "storage-cache-status completed";

      elementsCard.cacheStatus.textContent =
        "● ВОССТАНОВЛЕН";

      elementsCard.cacheMessage.textContent =
        "Файл готов. Быстрое скачивание доступно ещё " +
        formatRemaining(cache.expires_in);

      button.textContent =
        "↓ СКАЧАТЬ БЕЗ ОЖИДАНИЯ";

      button.onclick = () =>
        connectToJob(file, cache.job_id);

    } else if (status === "processing") {
      elementsCard.cacheStatus.className =
        "storage-cache-status processing";

      elementsCard.cacheStatus.textContent =
        "● ВОССТАНАВЛИВАЕТСЯ";

      elementsCard.cacheMessage.textContent =
        cache.message || "Обработка файла...";

      button.textContent =
        "ПОДКЛЮЧИТЬСЯ К ЗАДАЧЕ";

      button.onclick = () =>
        connectToJob(file, cache.job_id);

    } else if (status === "queued") {
      elementsCard.cacheStatus.className =
        "storage-cache-status queued";

      elementsCard.cacheStatus.textContent =
        "● В ОЧЕРЕДИ";

      elementsCard.cacheMessage.textContent =
        "Ожидание свободного декодера.";

      button.textContent =
        "ПОДКЛЮЧИТЬСЯ К ОЧЕРЕДИ";

      button.onclick = () =>
        connectToJob(file, cache.job_id);

    } else {
      elementsCard.cacheStatus.className =
        "storage-cache-status available";

      elementsCard.cacheStatus.textContent =
        "○ НЕ ВОССТАНОВЛЕН";

      elementsCard.cacheMessage.textContent =
        "Для скачивания потребуется восстановление файла.";

      button.textContent =
        "ВОССТАНОВИТЬ И СКАЧАТЬ";

      button.onclick = () =>
        startRestore(file);
    }
  }


  // ======================================
  // CONNECT TO SHARED JOB
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


  function updateProgress(status, progress, message) {
    const percent = Math.max(
      0,
      Math.min(
        100,
        Number(progress) || 0
      )
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
      showTaskError(
        error.message,
        true
      );
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

      connectionErrors = 0;

      if (
        !currentJob ||
        currentJob.id !== jobId
      ) {
        return;
      }

      updateProgress(
        data.status,
        data.progress,
        data.message
      );

      if (data.status === "completed") {
        showDownload(data);
      }

      if (data.status === "failed") {
        showTaskError(
          data.message ||
          "Ошибка восстановления",
          false
        );
      }
    } catch (error) {
      if (error.status === 404) {
        showTaskError(
          "Задача больше не существует на сервере.",
          false
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
  // DOWNLOAD
  // ======================================

  function showDownload(data) {
    if (!currentJob) {
      return;
    }

    currentJob.completed = true;
    saveJob(currentJob);

    updateProgress(
      "completed",
      100,
      "Файл успешно восстановлен"
    );

    const link = document.createElement("a");

    link.className =
      "storage-download";

    link.textContent =
      "↓ СКАЧАТЬ ФАЙЛ";

    link.href =
      API + data.download_url;

    elements.taskActions.replaceChildren(link);

    updateButtons();
  }


  // ======================================
  // ERRORS
  // ======================================

  function showTaskError(message, uncertain = false) {
    updateProgress(
      "error",
      0,
      message
    );

    if (!uncertain) {
      clearSavedJob();
    }

    currentJob = null;

    updateButtons();
  }


  // ======================================
  // RESTORE SESSION
  // ======================================

  async function restoreSession() {
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


  // ======================================
  // INITIALIZATION
  // ======================================

  async function initialize() {
    setOffline(
      "Поиск сервера Nightmar Storage..."
    );

    await refreshEndpoint();
  }

  initialize();


  // ======================================
  // TIMERS
  // ======================================

  setInterval(
    refreshEndpoint,
    ENDPOINT_INTERVAL
  );

  setInterval(
    checkStatus,
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
      refreshEndpoint();
      checkStatus();
      pollJob();
    }
  );

  document.addEventListener(
    "visibilitychange",
    () => {
      if (!document.hidden) {
        refreshEndpoint();
        checkStatus();
        pollJob();
        loadFiles();
      }
    }
  );

})();
