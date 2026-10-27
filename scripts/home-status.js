(() => {
  "use strict";

  // ======================================
  // NIGHTMAR'S PRODUCTION
  // HOME SYSTEM STATUS
  // ======================================

  const config = window.NP_STORAGE_CONFIG || {};

  const SUPABASE_URL = (
    config.supabaseUrl || ""
  ).replace(/\/+$/, "");

  const SUPABASE_KEY =
    config.supabaseKey || "";

  const CHECK_INTERVAL = 15000;

  const TIMEOUT = 5000;

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

  let checking = false;


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
  // FETCH WITH TIMEOUT
  // ======================================

  async function fetchJSON(url, options = {}) {
    const controller = new AbortController();

    const timeout = setTimeout(
      () => controller.abort(),
      TIMEOUT
    );

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        cache: "no-store"
      });

      if (!response.ok) {
        throw new Error(
          `HTTP ${response.status}`
        );
      }

      return await response.json();

    } finally {
      clearTimeout(timeout);
    }
  }


  // ======================================
  // DISPLAY
  // ======================================

  function setServerStatus(status) {
    elements.serverDot.className =
      "dot " + status;

    if (status === "online") {
      elements.serverStatus.textContent =
        "ONLINE";

    } else if (status === "busy") {
      elements.serverStatus.textContent =
        "BUSY";

    } else {
      elements.serverStatus.textContent =
        "OFFLINE";
    }
  }


  function setFilesCount(count) {
    if (typeof count === "number") {
      elements.filesDot.className =
        "dot online";

      elements.filesCount.textContent =
        String(count);

    } else {
      elements.filesDot.className =
        "dot offline";

      elements.filesCount.textContent =
        "—";
    }
  }


  // ======================================
  // CHECK SYSTEM
  // ======================================

  async function checkSystem() {
    if (checking) {
      return;
    }

    checking = true;

    try {
      if (!SUPABASE_URL || !SUPABASE_KEY) {
        throw new Error(
          "Supabase not configured"
        );
      }

      const endpointURL =
        SUPABASE_URL +
        "/rest/v1/storage_endpoint" +
        "?id=eq.1&select=api_url";

      const rows = await fetchJSON(
        endpointURL,
        {
          headers: {
            apikey: SUPABASE_KEY
          }
        }
      );

      if (!Array.isArray(rows) || !rows.length) {
        throw new Error("Endpoint unavailable");
      }

      const API = validateEndpoint(
        rows[0].api_url
      );

      if (!API) {
        setServerStatus("offline");
        setFilesCount(null);
        return;
      }

      const status = await fetchJSON(
        API + "/api/status"
      );

      if (status.status !== "online") {
        throw new Error("Server unavailable");
      }

      const active = Number(
        status.active_jobs || 0
      );

      const queued = Number(
        status.queued_jobs || 0
      );

      if (active > 0 || queued > 0) {
        setServerStatus("busy");
      } else {
        setServerStatus("online");
      }

      try {
        const files = await fetchJSON(
          API + "/api/files"
        );

        setFilesCount(
          Number(files.count || 0)
        );

      } catch {
        setFilesCount(null);
      }

    } catch (error) {
      setServerStatus("offline");
      setFilesCount(null);

      console.warn(
        "[HOME] Storage status unavailable:",
        error
      );

    } finally {
      checking = false;
    }
  }


  // ======================================
  // INITIALIZATION
  // ======================================

  checkSystem();

  setInterval(
    checkSystem,
    CHECK_INTERVAL
  );

  window.addEventListener(
    "online",
    checkSystem
  );

  document.addEventListener(
    "visibilitychange",
    () => {
      if (!document.hidden) {
        checkSystem();
      }
    }
  );

})();
