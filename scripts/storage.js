(() => {
  "use strict";

  // ==========================================
  // NIGHTMAR STORAGE FRONTEND ALPHA 3.5
  //
  // SMART CACHE
  // INDEPENDENT DOWNLOADS
  // PUBLIC FILE SEARCH
  // STABLE CONNECTION
  // ==========================================

  const config = window.NP_STORAGE_CONFIG || {};
  const connection = window.NP_STORAGE_CONNECTION;

  const JOB_INTERVAL = config.jobInterval || 3000;
  const FILES_INTERVAL = config.filesInterval || 10000;
  const STATUS_INTERVAL = config.statusInterval || 15000;
  const REQUEST_TIMEOUT = config.requestTimeout || 10000;

  const STORAGE_KEY = "np_storage_active_job_v1";

  if (!connection) {
    console.error(
      "[STORAGE] Stable Connection не загружен."
    );
    return;
  }

  // ==========================================
  // ELEMENTS
  // ==========================================

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

  if (!elements.files || !elements.task) {
    console.error(
      "[STORAGE] Не найдены элементы интерфейса."
    );
    return;
  }

  // ==========================================
  // STATE
  // ==========================================

  let API = "";
  let serverOnline = false;

  let currentJob = null;

  let filesChecking = false;
  let jobChecking = false;
  let restoreStarting = false;

  let connectionErrors = 0;

  let searchQuery = "";

  const fileCards = new Map();

  // ==========================================
  // SEARCH
  // ==========================================

  function createSearch() {
    const wrapper = document.createElement("div");

    wrapper.className = "storage-search-wrapper";

    wrapper.style.cssText = [
      "margin:20px 0",
      "display:flex",
      "flex-direction:column",
      "gap:10px"
    ].join(";");

    const label = document.createElement("label");

    label.textContent = "ПОИСК ПО ХРАНИЛИЩУ";

    label.style.cssText = [
      "color:#c32626",
      "font-size:13px",
      "letter-spacing:2px",
      "font-weight:bold"
    ].join(";");

    const input = document.createElement("input");

    input.type = "search";
    input.placeholder =
      "Название, описание, ID или тип файла...";

    input.autocomplete = "off";

    input.setAttribute(
      "aria-label",
      "Поиск файлов Nightmar Storage"
    );

    input.style.cssText = [
      "width:100%",
      "box-sizing:border-box",
      "padding:15px",
      "background:#151515",
      "color:#eeeeee",
      "border:1px solid #751b1b",
      "outline:none",
      "font:inherit",
      "border-radius:4px"
    ].join(";");

    input.addEventListener("focus", () => {
      input.style.borderColor = "#c32626";
    });

    input.addEventListener("blur", () => {
      input.style.borderColor = "#751b1b";
    });

    const result = document.createElement("div");

    result.style.cssText = [
      "color:#999999",
      "font-size:12px"
    ].join(";");

    input.addEventListener("input", () => {
      searchQuery = input.value.trim().toLocaleLowerCase();

      applySearch();
    });

    wrapper.append(label, input, result);

    elements.files.parentNode.insertBefore(
      wrapper,
      elements.files
    );

    return result;
  }

  const searchResult = createSearch();

  function applySearch() {
    let visible = 0;

    for (const card of fileCards.values()) {
      const matches =
        !searchQuery ||
        card.searchText.includes(searchQuery);

      card.root.hidden = !matches;

      if (matches) {
        visible++;
      }
    }

    const total = fileCards.size;

    if (searchQuery) {
      searchResult.textContent =
        `НАЙДЕНО: ${visible} ИЗ ${total}`;
    } else {
      searchResult.textContent =
        `ФАЙЛОВ В КАТАЛОГЕ: ${total}`;
    }
  }

  // ==========================================
  // SESSION
  // ==========================================

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

  function clearSavedJob() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.warn("[STORAGE] Clear failed:", error);
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

  // ==========================================
  // DISPLAY
  // ==========================================

  function setStatus(state, message) {
    elements.status.className =
      "storage-status " + state;

    const names = {
      online: "В СЕТИ",
      busy: "ЗАНЯТ",
      offline: "НЕ В СЕТИ",
      connecting: "ПОДКЛЮЧЕНИЕ"
    };

    elements.statusText.textContent =
      names[state] || "НЕИЗВЕСТНО";

    elements.message.textContent =
      message || "";
  }

  function setOffline(message) {
    serverOnline = false;

    setStatus(
      "offline",
      message ||
        "Сервер недоступен. Восстановление временно отключено."
    );

    elements.active.textContent =
      "АКТИВНЫХ ЗАДАЧ: —";

    elements.queue.textContent =
      "В ОЧЕРЕДИ: —";

    updateButtons();
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

  // ==========================================
  // API
  // ==========================================

  async function apiRequest(path, options = {}) {
    if (!API) {
      throw new Error("Сервер не подключён");
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

  // ==========================================
  // FILE CARDS
  // ==========================================

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

    button.type = "button";

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
      button,

      cacheStatusValue: "available",
      expiresAt: 0,
      searchText: "",
      fileId: ""
    };
  }

  function updateFileCard(file, card) {
    card.fileId = file.id;

    card.name.textContent = file.name;

    card.meta.textContent =
      `${file.type || ""} / ${file.size || ""}`;

    card.description.textContent =
      file.description || "";

    card.searchText = [
      file.id,
      file.name,
      file.description,
      file.type
    ]
      .map(value => String(value || ""))
      .join(" ")
      .toLocaleLowerCase();

    const cache = file.cache || {
      status: "available"
    };

    card.cacheStatusValue = cache.status;

    card.expiresAt = Number(cache.expires_at || 0);

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

    updateCardButton(card);
  }

  // ==========================================
  // INDEPENDENT BUTTONS
  // ==========================================

  function updateCardButton(card) {
    if (!serverOnline) {
      card.button.disabled = true;
      return;
    }

    // Готовый файл не зависит от currentJob.
    if (card.cacheStatusValue === "completed") {
      card.button.disabled = false;
      return;
    }

    // К другой общей задаче можно подключиться.
    if (
      card.cacheStatusValue === "processing" ||
      card.cacheStatusValue === "queued"
    ) {
      card.button.disabled = false;
      return;
    }

    // Новые восстановления можно отправлять
    // в очередь, даже когда одно уже выполняется.
    card.button.disabled = restoreStarting;
  }

  function updateButtons() {
    for (const card of fileCards.values()) {
      updateCardButton(card);
    }
  }

  // ==========================================
  // DIRECT DOWNLOAD
  // ==========================================

  function downloadFile(jobId) {
    if (!serverOnline || !API || !jobId) {
      return;
    }

    const link = document.createElement("a");

    link.href =
      API + "/api/download/" +
      encodeURIComponent(jobId);

    link.style.display = "none";

    document.body.appendChild(link);

    link.click();

    link.remove();
  }

  // ==========================================
  // CATALOG
  // ==========================================

  async function loadFiles() {
    if (filesChecking || !API || !serverOnline) {
      return;
    }

    filesChecking = true;

    const requestedAPI = API;

    try {
      const data = await apiRequest("/api/files");

      if (requestedAPI !== API) {
        return;
      }

      elements.count.textContent =
        `ФАЙЛОВ: ${Number(data.count || 0)}`;

      const received = new Set();

      for (const file of data.files || []) {
        if (!file || !file.id) {
          continue;
        }

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

      applySearch();
      updateButtons();

    } catch (error) {
      console.warn(
        "[STORAGE] Ошибка загрузки каталога:",
        error
      );
    } finally {
      filesChecking = false;
    }
  }

  // ==========================================
  // TASK DISPLAY
  // ==========================================

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

    const names = {
      queued: "В ОЧЕРЕДИ",
      processing: "ВОССТАНОВЛЕНИЕ",
      connecting: "ПОДКЛЮЧЕНИЕ",
      reconnecting: "ПЕРЕПОДКЛЮЧЕНИЕ",
      completed: "ЗАВЕРШЕНО",
      failed: "ОШИБКА",
      cancelled: "ОТМЕНЕНО",
      error: "ОШИБКА"
    };

    elements.taskState.textContent =
      names[status] || "ОБРАБОТКА";

    elements.progressBar.style.width =
      `${percent}%`;

    elements.progressPercent.textContent =
      `${percent}%`;

    elements.progressText.textContent =
      message || "Обработка...";
  }

  // ==========================================
  // START RESTORE
  // ==========================================

  async function startRestore(file) {
    if (!serverOnline || restoreStarting) {
      return;
    }

    if (currentJob) {
      const confirmed = window.confirm(
        "Вы уже наблюдаете за другой задачей.\n\n" +
        "Отправить новый запрос и переключиться на него?\n\n" +
        "Предыдущая задача продолжит выполняться на сервере."
      );

      if (!confirmed) {
        return;
      }
    }

    restoreStarting = true;
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
    } finally {
      restoreStarting = false;
      updateButtons();
    }
  }

  // ==========================================
  // CONNECT EXISTING JOB
  // ==========================================

  async function connectToJob(file, jobId) {
    if (!serverOnline || !jobId) {
      return;
    }

    if (currentJob && currentJob.id === jobId) {
      showTask(file.name);
      return;
    }

    if (currentJob) {
      const confirmed = window.confirm(
        "Переключиться на другую задачу?\n\n" +
        "Предыдущая задача продолжит работу на сервере."
      );

      if (!confirmed) {
        return;
      }
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

    await pollJob();
  }

  // ==========================================
  // JOB POLLING
  // ==========================================

  async function pollJob() {
    if (
      !currentJob ||
      !currentJob.id ||
      jobChecking ||
      !API ||
      !serverOnline
    ) {
      return;
    }

    jobChecking = true;

    const jobId = currentJob.id;
    const jobAPI = API;

    try {
      const data = await apiRequest(
        `/api/job/${encodeURIComponent(jobId)}`
      );

      if (
        !currentJob ||
        currentJob.id !== jobId ||
        API !== jobAPI
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

      if (data.status === "cancelled") {
        showTaskError(
          data.message || "Восстановление отменено"
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
        "ПЕРЕПОДКЛЮЧЕНИЕ";

      elements.progressText.textContent =
        "Соединение потеряно. Повторное подключение...";

      if (connectionErrors >= 3) {
        connection.check();
      }

    } finally {
      jobChecking = false;
    }
  }

  // ==========================================
  // TASK COMPLETED
  // ==========================================

  function finishJob() {
    clearSavedJob();

    currentJob = null;

    hideTask();

    updateButtons();

    loadFiles();
  }

  // ==========================================
  // TASK ERROR
  // ==========================================

  function showTaskError(message) {
    updateProgress(
      "error",
      0,
      message
    );

    clearSavedJob();

    currentJob = null;

    updateButtons();

    loadFiles();
  }

  // ==========================================
  // RESTORE SESSION
  // ==========================================

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

    await pollJob();
  }

  // ==========================================
  // CONNECTION
  // ==========================================

  async function handleConnection(state) {
    const newAPI = state.apiUrl || "";

    if (newAPI !== API) {
      API = newAPI;

      fileCards.clear();
      elements.files.replaceChildren();

      applySearch();

      const savedJob = loadSavedJob();

      if (savedJob && savedJob.apiUrl !== API) {
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

      const active = Number(state.activeJobs || 0);
      const queued = Number(state.queuedJobs || 0);

      setStatus(
        active > 0 || queued > 0 ? "busy" : "online",
        active > 0 || queued > 0
          ? "Сервер выполняет восстановление. Готовые файлы доступны для скачивания."
          : "Сервер доступен. Можно восстанавливать файлы."
      );

      elements.active.textContent =
        `АКТИВНЫХ ЗАДАЧ: ${active}`;

      elements.queue.textContent =
        `В ОЧЕРЕДИ: ${queued}`;

      elements.lastCheck.textContent =
        "ПОСЛЕДНЯЯ ПРОВЕРКА: " +
        new Date().toLocaleTimeString("ru-RU");

      updateButtons();

      await loadFiles();
      await restoreSession();

    } else if (state.status === "offline") {
      setOffline();

    } else {
      if (!serverOnline) {
        setStatus(
          "connecting",
          "Подключение к Nightmar Storage..."
        );
      }
    }
  }

  connection.subscribe(handleConnection);

  // ==========================================
  // INITIALIZATION
  // ==========================================

  async function initialize() {
    hideTask();

    setStatus(
      "connecting",
      "Подключение к Nightmar Storage..."
    );

    const savedState = connection.getState();

    if (
      savedState &&
      savedState.apiUrl &&
      (
        savedState.status === "online" ||
        savedState.status === "busy"
      )
    ) {
      await handleConnection(savedState);
    }

    await connection.check();
  }

  initialize();

  // ==========================================
  // TIMERS
  // ==========================================

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

  // ==========================================
  // EVENTS
  // ==========================================

  window.addEventListener("online", () => {
    connection.check();
    pollJob();
  });

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
