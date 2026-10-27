// ======================================
// NIGHTMAR STORAGE
// CONNECTION CONFIGURATION
// ALPHA 3.4
// ======================================

window.NP_STORAGE_CONFIG = {

  supabaseUrl:
    "https://ipyqydrqctziltcuboop.supabase.co",

  supabaseKey:
    "sb_publishable_0PNw-wO6K1oMyb8XhLhgpA_GoXJivQV",

  endpointTable:
    "storage_endpoint",

  // Проверка сервера
  statusInterval: 15000,

  // Проверка адреса Supabase
  endpointInterval: 15000,

  // Ожидание HTTP-запроса
  requestTimeout: 10000,

  // Прогресс восстановления
  jobInterval: 3000,

  // Обновление каталога
  filesInterval: 10000,

  // Повторные попытки
  reconnectDelay: 3000,

  // Сколько ошибок допускаем,
  // прежде чем объявить OFFLINE
  maxConnectionErrors: 3

};
