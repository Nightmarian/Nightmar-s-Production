import json
import subprocess
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

SOURCE = ROOT / "books" / "source"
BOOKS = ROOT / "books"
DATABASE = ROOT / "books.json"


def create_slug(name):
    """Преобразование названия в безопасное имя."""

    translit = {
        "а": "a", "б": "b", "в": "v",
        "г": "g", "д": "d", "е": "e",
        "ё": "yo", "ж": "zh", "з": "z",
        "и": "i", "й": "y", "к": "k",
        "л": "l", "м": "m", "н": "n",
        "о": "o", "п": "p", "р": "r",
        "с": "s", "т": "t", "у": "u",
        "ф": "f", "х": "h", "ц": "ts",
        "ч": "ch", "ш": "sh", "щ": "sch",
        "ъ": "", "ы": "y", "ь": "",
        "э": "e", "ю": "yu", "я": "ya"
    }

    name = name.lower()

    result = "".join(
        translit.get(char, char)
        for char in name
    )

    result = re.sub(r"[^a-z0-9]+", "-", result)

    return result.strip("-")


def load_database():
    if DATABASE.exists():
        with open(DATABASE, "r", encoding="utf-8") as f:
            return json.load(f)

    return []


def save_database(books):
    with open(DATABASE, "w", encoding="utf-8") as f:
        json.dump(
            books,
            f,
            ensure_ascii=False,
            indent=2
        )


def process_books():

    SOURCE.mkdir(parents=True, exist_ok=True)

    books = load_database()

    source_files = {
        file.name: file
        for file in SOURCE.glob("*.docx")
    }

    # ==================================
    # УДАЛЕНИЕ КНИГ
    # ==================================

    updated_books = []

    for book in books:

        source = book.get("source")

        # Проверяем только автоматически созданные книги
        if source and source not in source_files:

            print(f"Удаляем книгу: {book['title']}")

            html_file = BOOKS / book["file"]

            if html_file.exists():
                html_file.unlink()

            continue

        updated_books.append(book)

    books = updated_books

    # ==================================
    # ДОБАВЛЕНИЕ НОВЫХ КНИГ
    # ==================================

    existing_sources = {
        book.get("source")
        for book in books
    }

    existing_files = {
        book["file"]
        for book in books
    }

    next_id = max(
        (book["id"] for book in books),
        default=0
    ) + 1

    for source_name, source_file in sorted(source_files.items()):

        if source_name in existing_sources:
            continue

        title = source_file.stem.replace("_", " ").strip()

        slug = create_slug(title)

        if not slug:
            print(f"Пропускаем файл: {source_name}")
            continue

        output_name = slug + ".html"

        if output_name in existing_files:
            print(f"Книга уже существует: {title}")
            continue

        output_file = BOOKS / output_name

        if output_file.exists():
            print(f"HTML уже существует: {output_name}")
            continue

        print(f"Создаём книгу: {title}")

        subprocess.run([
            "pandoc",
            str(source_file),
            "-o",
            str(output_file),
            "--standalone",
            "--css=../css/book.css",
            "--metadata",
            f"title={title}"
        ], check=True)


# Добавляем кнопку возвращения в библиотеку

html = output_file.read_text(encoding="utf-8")

back_button = '''
<a href="../library.html" class="back-to-library">
  ← Вернуться в библиотеку
</a>
'''

html = html.replace(
    "<body>",
    "<body>\n" + back_button,
    1
)

output_file.write_text(
    html,
    encoding="utf-8"
)
        

        books.append({
            "id": next_id,
            "title": title,
            "author": "Неизвестен",
            "year": "Не указан",
            "type": "Книга",
            "file": output_name,
            "source": source_name
        })

        existing_sources.add(source_name)
        existing_files.add(output_name)

        next_id += 1

    save_database(books)

    print("Библиотека синхронизирована!")


def add_navigation_to_books():

    back_button = '''
<a href="../library.html" class="back-to-library">
  ← Вернуться в библиотеку
</a>
'''

    for html_file in BOOKS.glob("*.html"):

        html = html_file.read_text(encoding="utf-8")

        if 'class="back-to-library"' in html:
            continue

        html = html.replace(
            "<body>",
            "<body>\n" + back_button,
            1
        )

        html_file.write_text(
            html,
            encoding="utf-8"
        )



if __name__ == "__main__":
    process_books()
    add_navigation_to_books()
