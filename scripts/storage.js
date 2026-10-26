(() => {
  "use strict";

  // ======================================
  // NIGHTMAR STORAGE
  // FRONTEND ALPHA 3.0
  // SUPABASE DYNAMIC ENDPOINT
  // ======================================

  const config = window.NP_STORAGE_CONFIG || {};

  const SUPABASE_URL = (
    config.supabaseUrl || ""
  ).replace(/\/+$/, "");

  const SUPABASE_KEY =
    config.supabaseKey || "";

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

  const STORAGE_KEY =
    "np_storage_active_job_v1";


  // ======================================
  // ELEMENTS
  // ======================================

  const elements = {

    status:
      document.getElementById("storage-status"),

    statusText:
      document.getElementById("storage-status-text"),

    message:
      document.getElementById("storage-server-message"),

    active:
      document.getElementById("storage-active"),

    queue:
      document.getElementById("storage-queue"),

    lastCheck:
      document.getElementById("storage-last-check"),

    files:
      document.getElementById("storage-files"),

    count:
      document.getElementById("storage-count"),

    task:
      document.getElementById("storage-task"),

    taskState:
      document.getElementById("storage-task-state"),

    taskFilename:
      document.getElementById("storage-task-filename"),

    progressBar:
      document.getElementById("storage-progress-bar"),

    progressText:
      document.getElementById("storage-progress-text"),

    progressPercent:
      document.getElementById("storage-progress-percent"),

    taskActions:
      document.getElementById("storage-task-actions")

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

  let filesLoaded = false;

  let connectionErrors = 0;

  let sessionRestored = false;


  // ======================================
  // ENDPOINT VALIDATION
  // ======================================

  function validateEndpoint(value) {

    if (
      !value ||
      typeof value !== "string"
    ) {
      return "";
    }

    try {

      const url = new URL(value);

      if (
        url.protocol !== "https:" ||
        !url.hostname.endsWith(
          ".trycloudflare.com"
        ) ||
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
  // SUPABASE ENDPOINT
  // ======================================

  async function fetchEndpoint() {

    if (
      !SUPABASE_URL ||
      !SUPABASE_KEY
    ) {

      throw new Error(
        "SUPABASE_NOT_CONFIGURED"
      );

    }

    const url =
      SUPABASE_URL +
      "/rest/v1/" +
      ENDPOINT_TABLE +
      "?id=eq.1&select=api_url,updated_at";

    const controller =
      new AbortController();

    const timeout = setTimeout(
      () => controller.abort(),
      REQUEST_TIMEOUT
    );

    try {

      const response = await fetch(
        url,
        {
          headers: {
            apikey: SUPABASE_KEY
          },

          signal: controller.signal,

          cache: "no-store"
        }
      );

      if (!response.ok) {

        throw new Error(
          `SUPABASE_HTTP_${response.status}`
        );

      }

      const rows =
        await response.json();

      if (
        !Array.isArray(rows) ||
        rows.length === 0
      ) {

        return "";

      }

      return validateEndpoint(
        rows[0].api_url
      );

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

      console.warn(
        "[STORAGE] Save failed:",
        error
      );

    }

  }


  function loadSavedJob() {

    try {

      const raw =
        localStorage.getItem(
          STORAGE_KEY
        );

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

      localStorage.removeItem(
        STORAGE_KEY
      );

    } catch (error) {

      console.warn(
        "[STORAGE] Clear failed:",
        error
      );

    }

  }


  // ======================================
  // STATUS DISPLAY
  // ======================================

  function setStatus(state, message) {

    elements.status.className =
      "storage-status " + state;

    elements.statusText.textContent =
      state.toUpperCase();

    elements.message.textContent =
      message;

  }


  function updateButtons() {

    document.querySelectorAll(
      ".storage-button"
    ).forEach(button => {

      button.disabled =
        !serverOnline ||
        Boolean(currentJob);

    });

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


  // ======================================
  // API REQUEST
  // ======================================

  async function apiRequest(
    path,
    options = {}
  ) {

    if (!API) {

      throw new Error(
        "API_NOT_CONFIGURED"
      );

    }

    const requestAPI = API;

    const controller =
      new AbortController();

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
          data.error ||
          `HTTP ${response.status}`
        );

        error.status =
          response.status;

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

      const newAPI =
        await fetchEndpoint();

      if (newAPI === API) {

        return;

      }

      console.log(
        "[STORAGE] Endpoint changed:",
        newAPI || "OFFLINE"
      );

      API = newAPI;

      serverOnline = false;

      filesLoaded = false;

      connectionErrors = 0;

      setOffline(
        API
          ? "Подключаемся к серверу..."
          : "Сервер выключен. Nightmar Storage временно недоступен."
      );

      if (!API) {

        return;

      }

      // Старый сервер после перезапуска
      // не хранит прежние задания.

      if (
        currentJob &&
        currentJob.apiUrl &&
        currentJob.apiUrl !== API
      ) {

        currentJob = null;

        clearSavedJob();

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

      // При временном сбое Supabase
      // не удаляем рабочий адрес API.
      // Текущую задачу тоже сохраняем.

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

    if (
      statusChecking ||
      !API
    ) {

      return;

    }

    statusChecking = true;

    try {

      const data = await apiRequest(
        "/api/status"
      );

      if (data.status !== "online") {

        throw new Error(
          "SERVER_UNAVAILABLE"
        );

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

      if (
        active > 0 ||
        queued > 0
      ) {

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

      if (!filesLoaded) {

        await loadFiles();

        filesLoaded = true;

      }

    } catch (error) {

      setOffline();

      filesLoaded = false;

    } finally {

      elements.lastCheck.textContent =
        "LAST CHECK: " +
        new Date().toLocaleTimeString(
          "ru-RU"
        );

      statusChecking = false;

    }

  }


  // ======================================
  // FILE CATALOG
  // ======================================

  async function loadFiles() {

    const data = await apiRequest(
      "/api/files"
    );

    elements.files.replaceChildren();

    elements.count.textContent =
      `FILES: ${data.count || 0}`;

    if (
      !Array.isArray(data.files) ||
      data.files.length === 0
    ) {

      const empty =
        document.createElement("div");

      empty.className =
        "storage-placeholder";

      empty.textContent =
        "В каталоге пока нет файлов.";

      elements.files.appendChild(
        empty
      );

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

    const card =
      document.createElement("div");

    card.className =
      "storage-file";

    const info =
      document.createElement("div");

    info.className =
      "storage-file-info";

    const name =
      document.createElement("div");

    name.className =
      "storage-file-name";

    name.textContent =
      file.name;

    const meta =
      document.createElement("div");

    meta.className =
      "storage-file-meta";

    meta.textContent =
      `${file.type} / ${file.size}`;

    const description =
      document.createElement("div");

    description.className =
      "storage-file-description";

    description.textContent =
      file.description || "";

    const button =
      document.createElement("button");

    button.className =
      "storage-button";

    button.textContent =
      "ВОССТАНОВИТЬ И СКАЧАТЬ";

    button.addEventListener(
      "click",
      () => startRestore(file)
    );

    info.append(
      name,
      meta,
      description
    );

    card.append(
      info,
      button
    );

    return card;

  }


  // ======================================
  // TASK DISPLAY
  // ======================================

  function showTask(filename) {

    elements.task.hidden = false;

    elements.taskFilename.textContent =
      filename ||
      "Восстановление файла";

    elements.taskActions.replaceChildren();

  }


  function updateProgress(
    status,
    progress,
    message
  ) {

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

    if (
      !serverOnline ||
      currentJob ||
      !API
    ) {
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
        `/api/restore/${encodeURIComponent(
          file.id
        )}`,
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

    const jobId =
      currentJob.id;

    try {

      const data = await apiRequest(
        `/api/job/${encodeURIComponent(
          jobId
        )}`
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

      if (
        data.status === "completed"
      ) {

        showDownload(data);

        return;

      }

      if (
        data.status === "failed"
      ) {

        showTaskError(
          data.message ||
          "Ошибка восстановления",
          false
        );

        return;

      }

    } catch (error) {

      if (
        error.status === 404
      ) {

        showTaskError(
          "Задача больше не существует на сервере. Возможно, сервер был перезапущен.",
          false
        );

        return;

      }

      connectionErrors++;

      elements.taskState.textContent =
        "RECONNECTING";

      elements.progressText.textContent =
        "Соединение потеряно. Повторное подключение...";

      if (
        connectionErrors >= 2
      ) {

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

    const link =
      document.createElement("a");

    link.className =
      "storage-download";

    link.textContent =
      "↓ СКАЧАТЬ ФАЙЛ";

    link.href =
      API + data.download_url;

    elements.taskActions.replaceChildren(
      link
    );

    updateButtons();

  }


  // ======================================
  // ERROR HANDLING
  // ======================================

  function showTaskError(
    message,
    uncertain = false
  ) {

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

    const savedJob =
      loadSavedJob();

    if (!savedJob) {
      return;
    }

    if (
      savedJob.apiUrl !== API
    ) {

      clearSavedJob();

      return;

    }

    currentJob =
      savedJob;

    showTask(
      savedJob.filename
    );

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


  // ======================================
  // BROWSER EVENTS
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

      }

    }
  );

})();
