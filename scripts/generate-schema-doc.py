"""Generate docs/database-schema.md from live Supabase Postgres introspection.

Run: python3 scripts/generate-schema-doc.py

Output: docs/database-schema.md with every public-schema table documented —
columns, types, nullability, defaults, primary keys, foreign keys, unique
constraints, indexes, row counts, and reconstructed CREATE TABLE DDL for
direct copy-paste reuse.

Reads DATABASE_URL from environment (load .env first with `set -a; source .env; set +a`).
"""
from __future__ import annotations

import os
import sys
from datetime import datetime
from pathlib import Path
from collections import defaultdict

import psycopg2
from psycopg2.extras import RealDictCursor


SCHEMA = "public"
OUTPUT = Path("docs/database-schema.md")


def fetch_tables(cur) -> list[dict]:
    cur.execute(
        """
        SELECT c.relname AS name,
               pg_catalog.obj_description(c.oid, 'pg_class') AS comment,
               c.reltuples::bigint AS est_rows
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = %s
           AND c.relkind = 'r'
         ORDER BY c.relname
        """,
        (SCHEMA,),
    )
    return [dict(r) for r in cur.fetchall()]


def fetch_columns(cur, table: str) -> list[dict]:
    cur.execute(
        """
        SELECT a.attname AS name,
               pg_catalog.format_type(a.atttypid, a.atttypmod) AS type,
               NOT a.attnotnull AS nullable,
               pg_get_expr(ad.adbin, ad.adrelid) AS default_expr,
               a.attnum AS position,
               pg_catalog.col_description(a.attrelid, a.attnum) AS comment
          FROM pg_attribute a
          JOIN pg_class c ON c.oid = a.attrelid
          JOIN pg_namespace n ON n.oid = c.relnamespace
     LEFT JOIN pg_attrdef ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
         WHERE n.nspname = %s
           AND c.relname = %s
           AND a.attnum > 0
           AND NOT a.attisdropped
         ORDER BY a.attnum
        """,
        (SCHEMA, table),
    )
    return [dict(r) for r in cur.fetchall()]


def fetch_constraints(cur, table: str) -> dict:
    """Return {'pk': [col], 'fks': [(col, ref_table, ref_col)], 'uniques': [[cols]], 'checks': [(name, def)]}"""
    # Primary key
    cur.execute(
        """
        SELECT a.attname
          FROM pg_index i
          JOIN pg_class c ON c.oid = i.indrelid
          JOIN pg_namespace n ON n.oid = c.relnamespace
          JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY(i.indkey)
         WHERE n.nspname = %s
           AND c.relname = %s
           AND i.indisprimary
         ORDER BY array_position(i.indkey, a.attnum)
        """,
        (SCHEMA, table),
    )
    pk = [r["attname"] for r in cur.fetchall()]

    # Foreign keys
    cur.execute(
        """
        SELECT con.conname AS name,
               a.attname AS col,
               ref_ns.nspname AS ref_schema,
               ref_c.relname AS ref_table,
               ref_a.attname AS ref_col,
               con.confupdtype AS on_update,
               con.confdeltype AS on_delete
          FROM pg_constraint con
          JOIN pg_class c ON c.oid = con.conrelid
          JOIN pg_namespace n ON n.oid = c.relnamespace
          JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = ANY(con.conkey)
          JOIN pg_class ref_c ON ref_c.oid = con.confrelid
          JOIN pg_namespace ref_ns ON ref_ns.oid = ref_c.relnamespace
          JOIN pg_attribute ref_a ON ref_a.attrelid = con.confrelid
                                 AND ref_a.attnum = con.confkey[array_position(con.conkey, a.attnum)]
         WHERE n.nspname = %s
           AND c.relname = %s
           AND con.contype = 'f'
         ORDER BY con.conname, array_position(con.conkey, a.attnum)
        """,
        (SCHEMA, table),
    )
    fks = [dict(r) for r in cur.fetchall()]

    # Unique constraints (non-primary)
    cur.execute(
        """
        SELECT con.conname AS name,
               array_agg(a.attname ORDER BY array_position(con.conkey, a.attnum)) AS cols
          FROM pg_constraint con
          JOIN pg_class c ON c.oid = con.conrelid
          JOIN pg_namespace n ON n.oid = c.relnamespace
          JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = ANY(con.conkey)
         WHERE n.nspname = %s
           AND c.relname = %s
           AND con.contype = 'u'
         GROUP BY con.conname
        """,
        (SCHEMA, table),
    )
    uniques = [dict(r) for r in cur.fetchall()]

    # Check constraints
    cur.execute(
        """
        SELECT con.conname AS name,
               pg_get_constraintdef(con.oid) AS definition
          FROM pg_constraint con
          JOIN pg_class c ON c.oid = con.conrelid
          JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = %s
           AND c.relname = %s
           AND con.contype = 'c'
        """,
        (SCHEMA, table),
    )
    checks = [dict(r) for r in cur.fetchall()]

    return {"pk": pk, "fks": fks, "uniques": uniques, "checks": checks}


def fetch_indexes(cur, table: str) -> list[dict]:
    cur.execute(
        """
        SELECT i.relname AS name,
               pg_get_indexdef(ix.indexrelid) AS definition,
               ix.indisunique AS is_unique,
               ix.indisprimary AS is_primary
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          JOIN pg_index ix ON ix.indrelid = c.oid
          JOIN pg_class i ON i.oid = ix.indexrelid
         WHERE n.nspname = %s
           AND c.relname = %s
         ORDER BY i.relname
        """,
        (SCHEMA, table),
    )
    return [dict(r) for r in cur.fetchall()]


def fetch_row_count(cur, table: str) -> int | None:
    try:
        cur.execute(f'SELECT COUNT(*) AS n FROM {SCHEMA}."{table}"')
        return cur.fetchone()["n"]
    except Exception:
        cur.connection.rollback()
        return None


def fetch_enum_types(cur) -> list[dict]:
    cur.execute(
        """
        SELECT t.typname AS name,
               array_agg(e.enumlabel ORDER BY e.enumsortorder) AS values
          FROM pg_type t
          JOIN pg_namespace n ON n.oid = t.typnamespace
          JOIN pg_enum e ON e.enumtypid = t.oid
         WHERE n.nspname = %s
         GROUP BY t.typname
         ORDER BY t.typname
        """,
        (SCHEMA,),
    )
    return [dict(r) for r in cur.fetchall()]


ACTION_MAP = {"a": "NO ACTION", "r": "RESTRICT", "c": "CASCADE", "n": "SET NULL", "d": "SET DEFAULT"}


def reconstruct_ddl(table: str, cols: list[dict], cons: dict) -> str:
    parts = [f'CREATE TABLE {SCHEMA}."{table}" (']
    col_lines = []
    for c in cols:
        line = f'  "{c["name"]}" {c["type"]}'
        if not c["nullable"]:
            line += " NOT NULL"
        if c["default_expr"]:
            line += f' DEFAULT {c["default_expr"]}'
        col_lines.append(line)
    if cons["pk"]:
        col_lines.append("  PRIMARY KEY (" + ", ".join(f'"{c}"' for c in cons["pk"]) + ")")
    for u in cons["uniques"]:
        col_lines.append(f'  CONSTRAINT "{u["name"]}" UNIQUE (' + ", ".join(f'"{c}"' for c in u["cols"]) + ")")
    parts.append(",\n".join(col_lines))
    parts.append(");")
    ddl = "\n".join(parts)

    # FK constraints as ALTER TABLE (easier to read)
    fk_groups = defaultdict(list)
    for fk in cons["fks"]:
        fk_groups[fk["name"]].append(fk)
    for name, rows in fk_groups.items():
        cols_ = ", ".join(f'"{r["col"]}"' for r in rows)
        ref_cols = ", ".join(f'"{r["ref_col"]}"' for r in rows)
        ref = f'{rows[0]["ref_schema"]}."{rows[0]["ref_table"]}"'
        on_upd = ACTION_MAP.get(rows[0]["on_update"], "NO ACTION")
        on_del = ACTION_MAP.get(rows[0]["on_delete"], "NO ACTION")
        ddl += (
            f'\nALTER TABLE {SCHEMA}."{table}" ADD CONSTRAINT "{name}" '
            f"FOREIGN KEY ({cols_}) REFERENCES {ref} ({ref_cols})"
        )
        if on_upd != "NO ACTION":
            ddl += f" ON UPDATE {on_upd}"
        if on_del != "NO ACTION":
            ddl += f" ON DELETE {on_del}"
        ddl += ";"

    for chk in cons["checks"]:
        ddl += f'\nALTER TABLE {SCHEMA}."{table}" ADD CONSTRAINT "{chk["name"]}" {chk["definition"]};'

    return ddl


def categorize_tables(tables: list[dict]) -> dict[str, list[dict]]:
    """Group tables into functional buckets for document organization.

    Order of checks matters — tables that match multiple patterns land in
    the first matching category.
    """
    categories = {
        "Core identity & institutions": [],
        "Fee pipeline (extraction → classification → published)": [],
        "Crawler state & artifacts": [],
        "Agent runtime & audit": [],
        "Hamilton research platform": [],
        "External economic data": [],
        "Users, auth, billing, audit": [],
        "Reference & taxonomy": [],
        "Other": [],
    }
    CORE_IDENTITY = {
        "institutions", "institution_dossiers", "institution_aliases",
        "institution_complaints", "institution_financials",
        "crawl_targets", "crawl_target_changes",
    }
    for t in tables:
        n = t["name"]
        if n in CORE_IDENTITY:
            categories["Core identity & institutions"].append(t)
        elif any(k in n for k in ("fee", "published", "canonical_fee", "variant")) and not n.startswith("hamilton_"):
            categories["Fee pipeline (extraction → classification → published)"].append(t)
        elif any(k in n for k in ("crawl", "url", "probe", "discover", "extract")):
            categories["Crawler state & artifacts"].append(t)
        elif any(k in n for k in ("agent", "darwin", "knox", "magellan", "atlas", "budget", "workers_last_run", "job", "wave", "classification_cache", "auth_log", "roomba", "shadow_outputs")):
            categories["Agent runtime & audit"].append(t)
        elif n.startswith("hamilton_") or n in ("published_reports", "report_jobs", "articles", "research_conversations", "research_messages", "research_articles", "research_usage"):
            categories["Hamilton research platform"].append(t)
        elif any(k in n for k in ("fred", "bls", "beige", "cfpb", "fdic", "ncua", "call_report", "sod", "economic", "external_intelligence", "fed_", "ofr", "nyfed", "reg_articles")):
            categories["External economic data"].append(t)
        elif any(k in n for k in ("user", "session", "subscription", "stripe", "lead", "saved_peer", "peer_group", "usage_events", "sessions")):
            categories["Users, auth, billing, audit"].append(t)
        elif any(k in n for k in ("taxonomy", "family", "category", "tier", "never_merge", "gold_standard", "platform_registry", "schema_migrations")):
            categories["Reference & taxonomy"].append(t)
        else:
            categories["Other"].append(t)
    return {k: v for k, v in categories.items() if v}


def render_markdown(tables: list[dict], enums: list[dict], details: dict, categories: dict) -> str:
    ts = datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")
    lines = [
        "# Bank Fee Index — Database Schema",
        "",
        f"**Generated:** {ts} (live introspection via `scripts/generate-schema-doc.py`)",
        f"**Schema:** `public` · **Tables:** {len(tables)}",
        "",
        "This doc is auto-generated from the live Supabase Postgres database. It's the authoritative current-state schema reference — not hand-edited, not reconstructed from migrations. If you need to rebuild, every `CREATE TABLE` block below is copy-paste ready.",
        "",
        "## Naming gotchas to know before reading",
        "",
        "- **There is no `institutions` table.** The de-facto institutions table is `crawl_targets` — every FK across the schema that says `institution_id` actually points at `crawl_targets.id`. Older docs, memory files, and chat history may refer to an `institutions` table that does not exist.",
        "- **`fees_raw` vs `extracted_fees` vs `fees_verified` vs `fees_published`** are four *separate* tables that together form the fee pipeline. They are not views of one another.",
        "- **`agent_events_*` and `agent_auth_log_*` are partitioned** by month — look under Agent runtime & audit for the partition parents.",
        "- **Supabase-managed schemas** (`auth`, `storage`, `realtime`, `vault`, `supabase_migrations`) are **NOT** documented here. This doc only covers `public`.",
        "",
        "To regenerate:",
        "",
        "```bash",
        "set -a; source .env; set +a",
        "python3 scripts/generate-schema-doc.py",
        "```",
        "",
        "---",
        "",
        "## Table of contents",
        "",
    ]

    # TOC by category
    for cat, items in categories.items():
        lines.append(f"- **{cat}** ({len(items)})")
        for t in items:
            anchor = t["name"].replace("_", "-")
            lines.append(f"  - [`{t['name']}`](#{anchor})")

    if enums:
        lines.append("- **Enum types**")
        for e in enums:
            anchor = e["name"].replace("_", "-")
            lines.append(f"  - [`{e['name']}`](#enum-{anchor})")

    lines.append("")
    lines.append("---")
    lines.append("")

    # Enum types block
    if enums:
        lines.append("## Enum types")
        lines.append("")
        for e in enums:
            anchor = e["name"].replace("_", "-")
            lines.append(f'### <a id="enum-{anchor}"></a>`{e["name"]}`')
            lines.append("")
            lines.append("Values: " + ", ".join(f"`{v}`" for v in e["values"]))
            lines.append("")
            ddl = f'CREATE TYPE {SCHEMA}.{e["name"]} AS ENUM (\n  '
            ddl += ",\n  ".join(f"'{v}'" for v in e["values"])
            ddl += "\n);"
            lines.append("```sql")
            lines.append(ddl)
            lines.append("```")
            lines.append("")
        lines.append("---")
        lines.append("")

    # Per-category table dump
    for cat, items in categories.items():
        lines.append(f"## {cat}")
        lines.append("")
        for t in items:
            d = details[t["name"]]
            anchor = t["name"].replace("_", "-")
            lines.append(f'### <a id="{anchor}"></a>`{t["name"]}`')
            lines.append("")
            if t.get("comment"):
                lines.append(f"*{t['comment']}*")
                lines.append("")
            meta_bits = [f"**Rows:** {d['row_count']:,}" if d["row_count"] is not None else "**Rows:** (unreadable)"]
            if d["constraints"]["pk"]:
                meta_bits.append("**PK:** `" + ", ".join(d["constraints"]["pk"]) + "`")
            if d["constraints"]["fks"]:
                fk_names = sorted({fk["ref_table"] for fk in d["constraints"]["fks"]})
                meta_bits.append(f"**FK → :** {', '.join('`' + n + '`' for n in fk_names)}")
            lines.append(" · ".join(meta_bits))
            lines.append("")

            # Column table
            lines.append("| Column | Type | Nullable | Default |")
            lines.append("|---|---|:---:|---|")
            for c in d["columns"]:
                null_marker = "✓" if c["nullable"] else ""
                default = (c["default_expr"] or "").replace("|", "\\|")
                if len(default) > 60:
                    default = default[:57] + "..."
                typ = c["type"].replace("|", "\\|")
                lines.append(f'| `{c["name"]}` | `{typ}` | {null_marker} | `{default}` |' if default else f'| `{c["name"]}` | `{typ}` | {null_marker} |  |')
            lines.append("")

            # Indexes (skip if only PK)
            non_pk_ix = [ix for ix in d["indexes"] if not ix["is_primary"]]
            if non_pk_ix:
                lines.append("**Indexes:**")
                for ix in non_pk_ix:
                    lines.append(f'- `{ix["name"]}`' + (" (unique)" if ix["is_unique"] else ""))
                lines.append("")

            # Check constraints
            if d["constraints"]["checks"]:
                lines.append("**Check constraints:**")
                for chk in d["constraints"]["checks"]:
                    lines.append(f'- `{chk["name"]}`: `{chk["definition"]}`')
                lines.append("")

            # DDL block
            lines.append("<details><summary>DDL</summary>")
            lines.append("")
            lines.append("```sql")
            lines.append(d["ddl"])
            lines.append("```")
            lines.append("")
            lines.append("</details>")
            lines.append("")
        lines.append("---")
        lines.append("")

    return "\n".join(lines)


def main():
    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        print("ERROR: DATABASE_URL not set. Run `set -a; source .env; set +a` first.", file=sys.stderr)
        sys.exit(1)

    print(f"Connecting to {dsn.split('@')[-1].split('?')[0]}…")
    conn = psycopg2.connect(dsn)
    cur = conn.cursor(cursor_factory=RealDictCursor)

    print("Fetching table list…")
    tables = fetch_tables(cur)
    print(f"  {len(tables)} tables in schema `{SCHEMA}`")

    print("Fetching enum types…")
    enums = fetch_enum_types(cur)
    print(f"  {len(enums)} enum types")

    details = {}
    for i, t in enumerate(tables, 1):
        name = t["name"]
        print(f"  [{i:>3}/{len(tables)}] {name}")
        cols = fetch_columns(cur, name)
        cons = fetch_constraints(cur, name)
        ix = fetch_indexes(cur, name)
        rc = fetch_row_count(cur, name)
        ddl = reconstruct_ddl(name, cols, cons)
        details[name] = {
            "columns": cols,
            "constraints": cons,
            "indexes": ix,
            "row_count": rc,
            "ddl": ddl,
        }

    cur.close()
    conn.close()

    print("Categorizing tables…")
    cats = categorize_tables(tables)

    print(f"Rendering markdown → {OUTPUT}")
    md = render_markdown(tables, enums, details, cats)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(md)
    print(f"Done. {len(md.splitlines()):,} lines, {len(md):,} chars.")


if __name__ == "__main__":
    main()
