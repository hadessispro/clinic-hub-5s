#!/usr/bin/env python3
"""Extract the PG customer table from a phpMyAdmin MySQL dump as JSONL.

The parser is deliberately dependency-free and only reads INSERT statements for
39urY3_fspg_customers.  It preserves every source column in a payload object so
the PostgreSQL source snapshot can be reconciled without losing source fields.
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path


def decode_value(value: str):
    if value.upper() == "NULL":
        return None
    if len(value) >= 2 and value[0] == value[-1] == "'":
        value = value[1:-1]
        value = re.sub(
            r"\\(.)",
            lambda match: {"n": "\n", "r": "\r", "t": "\t", "0": "\0"}.get(
                match.group(1), match.group(1)
            ),
            value,
        )
        # The phpMyAdmin export contains UTF-8 text that was decoded once as
        # Latin-1 before being written.  Undo that reversible mojibake layer.
        try:
            repaired = value.encode("latin-1").decode("utf-8")
            if sum(repaired.count(marker) for marker in ("Ã", "Ä", "Æ", "á»")) < sum(
                value.count(marker) for marker in ("Ã", "Ä", "Æ", "á»")
            ):
                value = repaired
        except (UnicodeEncodeError, UnicodeDecodeError):
            pass
        return value
    return value


def extract_rows(sql: str, table: str):
    insert_re = re.compile(
        rf"INSERT INTO `{re.escape(table)}` \((.*?)\) VALUES\s*", re.DOTALL
    )
    for statement in insert_re.finditer(sql):
        columns = re.findall(r"`([^`]+)`", statement.group(1))
        index = statement.end()
        quoted = escaped = False
        depth = 0
        field = ""
        row: list[str] = []

        while index < len(sql):
            char = sql[index]
            if quoted:
                field += char
                if escaped:
                    escaped = False
                elif char == "\\":
                    escaped = True
                elif char == "'":
                    quoted = False
            elif char == "'":
                quoted = True
                field += char
            elif char == "(":
                depth += 1
                if depth > 1:
                    field += char
            elif char == ")":
                depth -= 1
                if depth == 0:
                    row.append(field.strip())
                    if len(row) != len(columns):
                        raise ValueError(
                            f"Expected {len(columns)} fields, found {len(row)}"
                        )
                    yield dict(zip(columns, map(decode_value, row)))
                    row = []
                    field = ""
                else:
                    field += char
            elif char == "," and depth == 1:
                row.append(field.strip())
                field = ""
            elif char == ";" and depth == 0:
                break
            elif depth:
                field += char
            index += 1


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("dump", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--table", default="39urY3_fspg_customers")
    args = parser.parse_args()

    sql = args.dump.read_text(encoding="utf-8", errors="replace")
    count = 0
    source_ids: set[str] = set()
    with args.output.open("w", encoding="utf-8", newline="\n") as output:
        for payload in extract_rows(sql, args.table):
            source_id = str(payload.get("id") or "").strip()
            if not source_id or source_id in source_ids:
                raise ValueError(f"Missing or duplicate source id: {source_id!r}")
            source_ids.add(source_id)
            output.write(
                json.dumps(
                    {"source_id": int(source_id), "payload": payload},
                    ensure_ascii=False,
                    separators=(",", ":"),
                )
                + "\n"
            )
            count += 1
    print(json.dumps({"rows": count, "output": str(args.output)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
