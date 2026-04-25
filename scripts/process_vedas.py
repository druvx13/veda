#!/usr/bin/env python3
from __future__ import annotations

import sqlite3
import tempfile
from pathlib import Path
from typing import List, Sequence

from openpyxl import Workbook, load_workbook


ROOT = Path(__file__).resolve().parents[1]
SOURCE_XLSX = ROOT / "FourVedas20200922.xlsx"
RAW_EXCEL_DIR = ROOT / "raw" / "excel"
INDIVIDUAL_SQL_DIR = ROOT / "raw" / "sqls" / "individual"
COMBINED_SQL_DIR = ROOT / "raaw" / "sqls"

VEDA_SHEETS: Sequence[str] = ("Rik", "Yaju", "Saam", "Atharva")


def sql_ident(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


def normalize_headers(headers: Sequence[object]) -> List[str]:
    seen: dict[str, int] = {}
    normalized: List[str] = []
    for index, value in enumerate(headers, start=1):
        text = str(value).strip() if value is not None else ""
        if not text:
            text = f"column_{index}"
        if text in seen:
            seen[text] += 1
            text = f"{text}_{seen[text]}"
        else:
            seen[text] = 1
        normalized.append(text)
    return normalized


def worksheet_to_sqlite(conn: sqlite3.Connection, ws) -> None:
    sheet_name = ws.title
    iterator = ws.iter_rows(values_only=True)
    try:
        first_row = next(iterator)
    except StopIteration:
        return

    raw_headers = list(first_row)
    used_indices = [False] * len(raw_headers)
    for row in (first_row,):
        for index, value in enumerate(row[: len(used_indices)]):
            if value not in (None, ""):
                used_indices[index] = True
    for row in iterator:
        for index, value in enumerate(row[: len(used_indices)]):
            if value not in (None, ""):
                used_indices[index] = True

    keep_indices = [index for index, used in enumerate(used_indices) if used]
    if not keep_indices:
        return

    headers = normalize_headers([raw_headers[index] for index in keep_indices])
    conn.execute(f"DROP TABLE IF EXISTS {sql_ident(sheet_name)}")
    create_columns = ", ".join(sql_ident(col) for col in headers)
    conn.execute(f"CREATE TABLE {sql_ident(sheet_name)} ({create_columns})")

    placeholders = ", ".join("?" for _ in headers)
    insert_sql = f"INSERT INTO {sql_ident(sheet_name)} VALUES ({placeholders})"

    batch: List[Sequence[object]] = []
    data_iterator = ws.iter_rows(min_row=2, values_only=True)
    for row in data_iterator:
        values = [row[index] if index < len(row) else None for index in keep_indices]
        batch.append(values)
        if len(batch) >= 2000:
            conn.executemany(insert_sql, batch)
            batch.clear()
    if batch:
        conn.executemany(insert_sql, batch)

    conn.commit()


def workbook_to_sqlite(xlsx_path: Path, sqlite_path: Path, include_sheets: Sequence[str] | None = None) -> None:
    sqlite_path.parent.mkdir(parents=True, exist_ok=True)
    if sqlite_path.exists():
        sqlite_path.unlink()

    wb = load_workbook(filename=xlsx_path, read_only=True, data_only=True)
    selected_sheets = include_sheets if include_sheets is not None else wb.sheetnames
    with sqlite3.connect(sqlite_path) as conn:
        conn.execute("PRAGMA page_size=65536")
        conn.execute("PRAGMA journal_mode=OFF")
        conn.execute("PRAGMA synchronous=OFF")
        for sheet_name in selected_sheets:
            ws = wb[sheet_name]
            worksheet_to_sqlite(conn, ws)
        conn.execute("VACUUM")
    wb.close()


def workbook_to_sql_dump(xlsx_path: Path, sql_path: Path, include_sheets: Sequence[str] | None = None) -> None:
    sql_path.parent.mkdir(parents=True, exist_ok=True)
    if sql_path.exists():
        sql_path.unlink()

    with tempfile.TemporaryDirectory() as temp_dir:
        temp_sqlite = Path(temp_dir) / "combined.sqlite"
        workbook_to_sqlite(xlsx_path, temp_sqlite, include_sheets=include_sheets)
        with sqlite3.connect(temp_sqlite) as conn, sql_path.open("w", encoding="utf-8") as out_file:
            for line in conn.iterdump():
                out_file.write(line)
                out_file.write("\n")


def split_into_individual_excels() -> list[Path]:
    RAW_EXCEL_DIR.mkdir(parents=True, exist_ok=True)
    wb = load_workbook(filename=SOURCE_XLSX, read_only=True, data_only=True)
    output_paths: list[Path] = []

    for sheet_name in VEDA_SHEETS:
        ws = wb[sheet_name]
        output_path = RAW_EXCEL_DIR / f"{sheet_name.lower()}_veda.xlsx"
        out_wb = Workbook(write_only=True)
        out_ws = out_wb.create_sheet(title=sheet_name)
        for row in ws.iter_rows(values_only=True):
            out_ws.append(list(row))
        out_wb.save(output_path)
        out_wb.close()
        output_paths.append(output_path)

    wb.close()
    return output_paths


def main() -> None:
    individual_files = split_into_individual_excels()

    INDIVIDUAL_SQL_DIR.mkdir(parents=True, exist_ok=True)
    for xlsx_path in individual_files:
        sqlite_name = f"{xlsx_path.stem}.sqlite"
        workbook_to_sqlite(xlsx_path, INDIVIDUAL_SQL_DIR / sqlite_name)

    COMBINED_SQL_DIR.mkdir(parents=True, exist_ok=True)
    workbook_to_sql_dump(SOURCE_XLSX, COMBINED_SQL_DIR / "four_vedas.sql")


if __name__ == "__main__":
    main()
