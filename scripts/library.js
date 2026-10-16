async function loadLibrary() {

  const container = document.querySelector(".book-grid");

  try {

    const response = await fetch("books.json");

    if (!response.ok) {
      throw new Error("Ошибка загрузки книг");
    }

    const books = await response.json();

    container.innerHTML = "";

    books.forEach(book => {

      const card = document.createElement("a");

      card.className = "book-card";
      card.href = "books/" + encodeURIComponent(book.file);

      const number = document.createElement("div");
      number.className = "book-number";
      number.textContent =
        "Запись № " + String(book.id).padStart(3, "0");

      const title = document.createElement("div");
      title.className = "book-title";
      title.textContent = book.title;

      const meta = document.createElement("div");
      meta.className = "book-meta";
      meta.textContent =
        `${book.type} · ${book.author} · ${book.year}`;

      const status = document.createElement("div");
      status.className = "book-status";
      status.textContent = "Открыть запись";

      card.append(number, title, meta, status);

      container.appendChild(card);

    });

  } catch (error) {

    console.error(error);

    container.textContent =
      "Ошибка загрузки библиотеки.";

  }
}

loadLibrary();
