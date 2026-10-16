import json
import subprocess
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

SOURCE = ROOT / "books" / "source"
BOOKS = ROOT / "books"
DATABASE = ROOT / "books.json"


def create_slug(name):
    """Создаёт безопасное имя файла."""

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

    existing_files = {
        book["file"] for book in books
    }

    next_id = max(
        (book["id"] for book in books),
        default=0
    ) + 1

    for source_file in sorted(SOURCE.glob("*.docx")):

        title = source_file.stem

        slug = create_slug(title)

        if not slug:
            print(f"Пропускаем файл с неподдерживаемым именем: {source_file.name}")
            continue

        output_name = slug + ".html"

        output_file = BOOKS / output_name

        if output_name in existing_files:
            print(f"Книга уже существует: {title}")
            continue

        if output_file.exists():
            print(f"HTML-файл уже существует: {output_name}")
            continue

        print(f"Обрабатываем: {title}")

        command = [
            "pandoc",
            str(source_file),
            "-o",
            str(output_file),
            "--standalone",
            "--css=../css/book.css",
            "--metadata",
            f"title={title}"
        ]

        subprocess.run(command, check=True)

        books.append({
            "id": next_id,
            "title": title,
            "author": "Неизвестен",
            "year": "Не указан",
            "type": "Книга",
            "file": output_name
        })

        existing_files.add(output_name)
        next_id += 1

        print(f"Создана запись № {next_id - 1}")

    save_database(books)

    print("Библиотека обновлена!")


if __name__ == "__main__":
    process_books()
