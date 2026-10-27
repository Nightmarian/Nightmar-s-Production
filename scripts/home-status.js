(() => {
  "use strict";

  // ======================================
  // NIGHTMAR HOME STATUS
  // STABLE CONNECTION
  // ======================================

  const connection =
    window.NP_STORAGE_CONNECTION;

  const elements = {
    serverDot:
      document.getElementById("home-server-dot"),

    serverStatus:
      document.getElementById("home-server-status"),

    filesDot:
      document.getElementById("home-files-dot"),

    filesCount:
      document.getElementById("home-files-count")
  };

  let filesChecking = false;
  let lastFilesAPI = "";


  function updateStatus(state) {
    const status = state.status;

    elements.serverDot.className =
      "dot " + status;

    const statusNames = {
  online: "В СЕТИ",
  busy: "ЗАНЯТ",
  offline: "НЕ В СЕТИ",
  connecting: "ПОДКЛЮЧЕНИЕ"
};

elements.serverStatus.textContent =
  statusNames[status] || "НЕИЗВЕСТНО";

    if (
      (status === "online" || status === "busy") &&
      state.apiUrl
    ) {
      loadFileCount(state.apiUrl);
    } else if (status === "offline") {
      elements.filesDot.className =
        "dot offline";

      elements.filesCount.textContent = "—";

      lastFilesAPI = "";
    }
  }


  async function loadFileCount(apiUrl) {
    if (
      filesChecking ||
      !apiUrl ||
      apiUrl === lastFilesAPI
    ) {
      return;
    }

    filesChecking = true;

    try {
      const controller = new AbortController();

      const timer = setTimeout(
        () => controller.abort(),
        10000
      );

      let response;

      try {
        response = await fetch(
          apiUrl + "/api/files",
          {
            cache: "no-store",
            signal: controller.signal
          }
        );
      } finally {
        clearTimeout(timer);
      }

      if (!response.ok) {
        throw new Error(
          `HTTP ${response.status}`
        );
      }

      const data = await response.json();

      elements.filesDot.className =
        "dot online";

      elements.filesCount.textContent =
        String(data.count || 0);

      lastFilesAPI = apiUrl;

    } catch (error) {
      console.warn(
        "[HOME] File count unavailable:",
        error
      );
    } finally {
      filesChecking = false;
    }
  }


  // Восстанавливаем последнее состояние сразу.
  connection.subscribe(updateStatus);

  // Проверяем актуальное подключение.
  connection.check();

  setInterval(
    () => connection.check(),
    15000
  );

  window.addEventListener(
    "online",
    () => connection.check()
  );

  document.addEventListener(
    "visibilitychange",
    () => {
      if (!document.hidden) {
        connection.check();
      }
    }
  );

})();
