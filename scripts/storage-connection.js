// ======================================
// NIGHTMAR STORAGE
// ALPHA 3.5 — DUAL ENDPOINT SUPPORT
// ======================================

(() => {
  "use strict";

  const config = window.NP_STORAGE_CONFIG || {};

  const SUPABASE_URL = (
    config.supabaseUrl || ""
  ).replace(/\/+$/, "");

  const SUPABASE_KEY = config.supabaseKey || "";

  const ENDPOINT_TABLE =
    config.endpointTable || "storage_endpoint";

  const TIMEOUT =
    config.requestTimeout || 10000;

  const CACHE_TTL =
    config.statusCacheTTL || 60000;

  const MAX_ERRORS =
    config.maxConnectionErrors || 3;

  const CACHE_KEY =
    "np_storage_connection_v1";

  // Разрешённые постоянные домены
  const TRUSTED_DOMAINS = [
    "nightmarstorage.online"
  ];

  let checking = false;
  let errors = 0;

  let state = {
    apiUrl: "",
    status: "connecting",
    checkedAt: 0,
    activeJobs: 0,
    queuedJobs: 0
  };

  const listeners = new Set();


  // ======================================
  // VALIDATION — DUAL MODE
  // ======================================

  function validateEndpoint(value) {
    if (!value || typeof value !== "string") {
      return "";
    }

    try {
      const url = new URL(value);

      const hostname = url.hostname.toLowerCase();

      const isLegacyTunnel =
        hostname.endsWith(".trycloudflare.com");

      const isPermanentDomain =
        TRUSTED_DOMAINS.includes(hostname);

      if (
        url.protocol !== "https:" ||
        (!isLegacyTunnel && !isPermanentDomain) ||
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
  // CACHE
  // ======================================

  function loadCache() {
    try {
      const raw = sessionStorage.getItem(CACHE_KEY);

      if (!raw) {
        return;
      }

      const saved = JSON.parse(raw);

      if (
        !saved ||
        !validateEndpoint(saved.apiUrl) ||
        Date.now() - saved.checkedAt > CACHE_TTL
      ) {
        return;
      }

      state = {
        ...state,
        ...saved
      };

    } catch {
      // Ignore invalid cache
    }
  }


  function saveCache() {
    try {
      sessionStorage.setItem(
        CACHE_KEY,
        JSON.stringify(state)
      );
    } catch {
      // Storage unavailable
    }
  }


  // ======================================
  // EVENTS
  // ======================================

  function notify() {
    for (const listener of listeners) {
      try {
        listener({ ...state });
      } catch (error) {
        console.warn(
          "[CONNECTION] Listener error:",
          error
        );
      }
    }
  }


  function subscribe(listener) {
    listeners.add(listener);

    listener({ ...state });

    return () => listeners.delete(listener);
  }


  function getState() {
    return { ...state };
  }


  // ======================================
  // HTTP
  // ======================================

  async function fetchJSON(url, options = {}) {
    const controller = new AbortController();

    const timer = setTimeout(
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
        const error = new Error(
          `HTTP ${response.status}`
        );

        error.status = response.status;
        throw error;
      }

      return await response.json();

    } finally {
      clearTimeout(timer);
    }
  }


  // ======================================
  // CHECK CONNECTION
  // ======================================

  async function check() {
    if (checking) {
      return getState();
    }

    checking = true;

    try {
      if (!SUPABASE_URL || !SUPABASE_KEY) {
        throw new Error(
          "Supabase not configured"
        );
      }

      const url =
        SUPABASE_URL +
        "/rest/v1/" +
        ENDPOINT_TABLE +
        "?id=eq.1&select=api_url";

      const rows = await fetchJSON(url, {
        headers: {
          apikey: SUPABASE_KEY
        }
      });

      if (!Array.isArray(rows) || rows.length === 0) {
        throw new Error("Endpoint not found");
      }

      const newAPI = validateEndpoint(
        rows[0].api_url
      );

      if (!newAPI) {
        state.apiUrl = "";
        state.status = "offline";
        state.checkedAt = Date.now();

        errors = 0;

        saveCache();
        notify();

        return getState();
      }

      const status = await fetchJSON(
        newAPI + "/api/status"
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

      state = {
        apiUrl: newAPI,
        status:
          active > 0 || queued > 0
            ? "busy"
            : "online",
        checkedAt: Date.now(),
        activeJobs: active,
        queuedJobs: queued
      };

      errors = 0;

      saveCache();
      notify();

    } catch (error) {
      errors++;

      console.warn(
        "[CONNECTION] Check failed:",
        error
      );

      const age =
        Date.now() - state.checkedAt;

      if (
        errors >= MAX_ERRORS &&
        age > CACHE_TTL
      ) {
        state.status = "offline";
        state.checkedAt = Date.now();

        saveCache();
        notify();
      }

    } finally {
      checking = false;
    }

    return getState();
  }


  // ======================================
  // INITIALIZATION
  // ======================================

  loadCache();

  window.NP_STORAGE_CONNECTION = {
    check,
    subscribe,
    getState
  };

})();
