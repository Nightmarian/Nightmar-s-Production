// ======================================
// NIGHTMAR STORAGE
// ALPHA 3.4 — STABLE CONNECTION
// ======================================

window.NP_STORAGE_CONFIG = {

  supabaseUrl:
    "https://ipyqydrqctziltcuboop.supabase.co",

  supabaseKey:
    "sb_publishable_0PNw-wO6K1oMyb8XhLhgpA_GoXJivQV",

  endpointTable: "storage_endpoint",

  statusInterval: 15000,
  endpointInterval: 15000,

  requestTimeout: 10000,

  jobInterval: 3000,
  filesInterval: 10000,

  reconnectDelay: 3000,
  maxConnectionErrors: 3,

  // Не дольше 60 секунд доверяем
  // сохранённому ONLINE без проверки.
  statusCacheTTL: 60000

};
