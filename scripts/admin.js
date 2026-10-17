const REPO = "Nightmarian/Nightmar-s-Production";

async function loadAdminBooks() {

  const container = document.getElementById("admin-books");

  try {

    const response = await fetch("books.json", {
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error("Ошибка загрузки библиотеки");
    }

    const books = await response.json();

    container.innerHTML = "";

    if (books.length === 0) {
      container.textContent = "В библиотеке пока нет книг.";
      return;
    }

    books.forEach(book => {

      const card = document.createElement("div");
      card.className = "admin-book";

      const number = document.createElement("div");
      number.className = "admin-book-number";
      number.textContent =
        "ЗАПИСЬ № " + String(book.id).padStart(3, "0");

      const title = document.createElement("div");
      title.className = "admin-book-title";
      title.textContent = book.title;

      const actions = document.createElement("div");
      actions.className = "admin-book-actions";

      // Читать книгу
      const read = document.createElement("a");
      read.className = "admin-button";
      read.href = "books/" + encodeURIComponent(book.file);
      read.textContent = "ЧИТАТЬ";

      // Открыть HTML в GitHub
      const manage = document.createElement("a");
      manage.className = "admin-button";
      manage.href =
        `https://github.com/${REPO}/blob/main/books/${encodeURIComponent(book.file)}`;
      manage.target = "_blank";
      manage.rel = "noopener noreferrer";
      manage.textContent = "УПРАВЛЯТЬ";

      // Редактировать базу книг
      const edit = document.createElement("a");
      edit.className = "admin-button admin-button-danger";
      edit.href =
        `https://github.com/${REPO}/edit/main/books.json`;
      edit.target = "_blank";
      edit.rel = "noopener noreferrer";
      edit.textContent = "ИЗМЕНИТЬ БИБЛИОТЕКУ";

      actions.append(read, manage, edit);

      card.append(number, title, actions);

      container.appendChild(card);

    });

  } catch (error) {

    console.error(error);

    container.textContent =
      "Не удалось загрузить список книг.";

  }
}

loadAdminBooks();
