document.addEventListener("DOMContentLoaded", () => {

  // =====================================
  // ЕДИНЫЙ СПИСОК РАЗДЕЛОВ
  // =====================================

  const navigationItems = [
    {
      title: "ГЛАВНАЯ",
      url: "index.html"
    },
    {
      title: "БИБЛИОТЕКА",
      url: "library.html"
    },
    {
      title: "ЧАТ NP",
      url: "chat.html"
    },
    {
      title: "ОБЕЗОПАСИТЬ И СОХРАНИТЬ",
      url: "development.html"
    },
    {
      title: "РАЗВЛЕЧЬСЯ",
      url: "games/runner.html"
    }
  ];

  // =====================================
  // ОПРЕДЕЛЯЕМ КОРЕНЬ САЙТА
  // =====================================

  const script = document.querySelector(
    'script[src*="navigation.js"]'
  );

  const baseURL = new URL("../", script.src);

  // =====================================
  // СОЗДАЁМ МЕНЮ
  // =====================================

  const header = document.createElement("header");
  header.className = "np-header";

  const brand = document.createElement("a");
  brand.className = "np-brand";
  brand.href = new URL("index.html", baseURL).href;
  brand.textContent = "🎥 Nightmar’s Production";

  const toggle = document.createElement("button");
  toggle.className = "np-menu-toggle";
  toggle.innerHTML = "☰";
  toggle.setAttribute("aria-label", "Открыть меню");

  const nav = document.createElement("nav");
  nav.className = "np-navigation";

  const currentPage = window.location.pathname;

  navigationItems.forEach(item => {
    const link = document.createElement("a");

    link.href = new URL(item.url, baseURL).href;
    link.textContent = item.title;

    if (
      new URL(link.href).pathname === currentPage ||
      (item.url === "index.html" &&
        currentPage === baseURL.pathname)
    ) {
      link.classList.add("active");
    }

    nav.appendChild(link);
  });

  toggle.addEventListener("click", () => {
    const isOpen = nav.classList.toggle("open");

    toggle.innerHTML = isOpen ? "✕" : "☰";
    toggle.setAttribute(
      "aria-label",
      isOpen ? "Закрыть меню" : "Открыть меню"
    );
  });

  header.appendChild(brand);
  header.appendChild(toggle);
  header.appendChild(nav);

  document.body.prepend(header);

});
