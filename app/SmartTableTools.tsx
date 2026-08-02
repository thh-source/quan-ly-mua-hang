"use client";

import { useEffect, useRef, useState } from "react";

type ColumnInfo = {
  index: number;
  label: string;
  width: number;
  hidden: boolean;
};
type Preferences = { widths: Record<string, number>; hidden: string[] };

function headerGrid(table: HTMLTableElement) {
  const rows = [...(table.tHead?.rows || [])],
    grid: HTMLTableCellElement[][] = [];
  rows.forEach((row, rowIndex) => {
    grid[rowIndex] ||= [];
    let column = 0;
    [...row.cells].forEach((cell) => {
      while (grid[rowIndex][column]) column++;
      const rowSpan = Math.max(1, cell.rowSpan),
        colSpan = Math.max(1, cell.colSpan);
      for (let r = 0; r < rowSpan; r++) {
        grid[rowIndex + r] ||= [];
        for (let c = 0; c < colSpan; c++) grid[rowIndex + r][column + c] = cell;
      }
      column += colSpan;
    });
  });
  return grid;
}

function labelsFor(table: HTMLTableElement) {
  const grid = headerGrid(table),
    count = Math.max(0, ...grid.map((row) => row.length));
  return Array.from({ length: count }, (_, index) => {
    const parts = grid
      .map((row) =>
        row[index]?.innerText
          .replace(/[×▾↑↓]/g, " ")
          .replace(/\s+/g, " ")
          .trim(),
      )
      .filter(Boolean);
    const unique = [...new Set(parts)];
    return unique.join(" · ") || `Cột ${index + 1}`;
  });
}

function tableKey(table: HTMLTableElement, scopeKey: string) {
  const tables = [
    ...document.querySelectorAll<HTMLTableElement>(".app main table"),
  ].filter((item) => item.offsetParent !== null);
  return `smart-table:${scopeKey}:${Math.max(0, tables.indexOf(table))}`;
}

function readPreferences(key: string): Preferences {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "") as Partial<Preferences>;
    return {
      widths:
        value.widths && typeof value.widths === "object" ? value.widths : {},
      hidden: Array.isArray(value.hidden)
        ? value.hidden.filter((item): item is string => typeof item === "string")
        : [],
    };
  } catch {
    return { widths: {}, hidden: [] };
  }
}
function savePreferences(key: string, value: Preferences) {
  localStorage.setItem(key, JSON.stringify(value));
}

export default function SmartTableTools({ scopeKey }: { scopeKey: string }) {
  const activeRef = useRef<HTMLTableElement | null>(null),
    keyRef = useRef(""),
    [columns, setColumns] = useState<ColumnInfo[]>([]),
    [open, setOpen] = useState(false),
    [tableName, setTableName] = useState("Bảng dữ liệu");

  const apply = (table: HTMLTableElement, labels = labelsFor(table)) => {
    if (!labels.length) return;
    let group = table.querySelector<HTMLTableColElement>(
      "colgroup[data-smart-columns]",
    );
    if (!group || group.children.length !== labels.length) {
      group?.remove();
      group = document.createElement("colgroup");
      group.dataset.smartColumns = "true";
      labels.forEach(() => group!.appendChild(document.createElement("col")));
      table.insertBefore(group, table.firstChild);
    }
    const key = tableKey(table, scopeKey),
      prefs = readPreferences(key),
      headerGridRows = headerGrid(table),
      widths = labels.map(
        (label, index) =>
          prefs.widths[label] ||
          Math.max(
            80,
            Math.min(
              360,
              headerGridRows.at(-1)?.[index]?.getBoundingClientRect().width ||
                130,
            ),
          ),
      );
    [...group.children].forEach((node, index) => {
      const col = node as HTMLTableColElement,
        hidden = prefs.hidden.includes(labels[index]);
      col.style.display = hidden ? "none" : "table-column";
      col.style.width = `${widths[index]}px`;
      col.style.minWidth = `${widths[index]}px`;
    });
    table.classList.add("smart-table-enabled");
    table.style.width = `${widths.reduce((sum, width, index) => sum + (prefs.hidden.includes(labels[index]) ? 0 : width), 0)}px`;
    if (activeRef.current === table) {
      keyRef.current = key;
      setColumns(
        labels.map((label, index) => ({
          index,
          label,
          width: widths[index],
          hidden: prefs.hidden.includes(label),
        })),
      );
    }
  };

  const activate = (table: HTMLTableElement) => {
    activeRef.current = table;
    const labels = labelsFor(table);
    keyRef.current = tableKey(table, scopeKey);
    setTableName(
      table
        .closest("section")
        ?.querySelector("h1,h2,h3")
        ?.textContent?.trim() || "Bảng dữ liệu",
    );
    apply(table, labels);
  };
  const update = (next: ColumnInfo[]) => {
    const table = activeRef.current;
    if (!table) return;
    const prefs = {
      widths: Object.fromEntries(next.map((item) => [item.label, item.width])),
      hidden: next.filter((item) => item.hidden).map((item) => item.label),
    };
    savePreferences(keyRef.current, prefs);
    setColumns(next);
    apply(table);
  };
  const toggle = (index: number) => {
    if (
      columns.filter((item) => !item.hidden).length === 1 &&
      !columns.find((item) => item.index === index)?.hidden
    )
      return;
    update(
      columns.map((item) =>
        item.index === index ? { ...item, hidden: !item.hidden } : item,
      ),
    );
  };
  const resize = (index: number, delta: number) =>
    update(
      columns.map((item) =>
        item.index === index
          ? { ...item, width: Math.max(60, Math.min(520, item.width + delta)) }
          : item,
      ),
    );
  const reset = () => {
    localStorage.removeItem(keyRef.current);
    if (activeRef.current) apply(activeRef.current);
  };

  useEffect(() => {
    let frame = 0;
    const scan = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const tables = [
          ...document.querySelectorAll<HTMLTableElement>(".app main table"),
        ].filter((table) => table.offsetParent !== null);
        tables.forEach((table) => apply(table));
        if (!activeRef.current || activeRef.current.offsetParent === null) {
          activeRef.current = null;
          if (tables[0])
            activate(
              tables.sort(
                (a, b) =>
                  b.rows.length * b.rows[0]?.cells.length -
                  a.rows.length * a.rows[0]?.cells.length,
              )[0],
            );
          else setColumns([]);
        }
      });
    };
    const click = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest(".smart-table-panel,.smart-table-launch")) return;
      const table = target.closest<HTMLTableElement>("table");
      if (table && table.closest(".app main")) activate(table);
    };
    const down = (event: MouseEvent) => {
      const th = (event.target as HTMLElement).closest<HTMLTableCellElement>(
        "th",
      );
      if (
        !th ||
        !th.closest(".app main") ||
        th.getBoundingClientRect().right - event.clientX > 8
      )
        return;
      const table = th.closest("table")!,
        grid = headerGrid(table),
        rowIndex = th.parentElement?.rowIndex || 0,
        indices = (grid[rowIndex] || [])
          .map((cell, index) => (cell === th ? index : -1))
          .filter((index) => index >= 0),
        index = indices.at(-1);
      if (index === undefined) return;
      const label = labelsFor(table)[index];
      activate(table);
      event.preventDefault();
      const startX = event.clientX,
        startWidth =
          readPreferences(keyRef.current).widths[label] ||
          th.getBoundingClientRect().width;
      const move = (moveEvent: MouseEvent) => {
        const prefs = readPreferences(keyRef.current);
        prefs.widths[label] = Math.max(
          60,
          Math.min(520, startWidth + moveEvent.clientX - startX),
        );
        savePreferences(keyRef.current, prefs);
        apply(table);
      };
      const up = () => {
        document.removeEventListener("mousemove", move);
        document.removeEventListener("mouseup", up);
      };
      document.addEventListener("mousemove", move);
      document.addEventListener("mouseup", up);
    };
    const observer = new MutationObserver(scan);
    observer.observe(document.querySelector(".app main") || document.body, {
      childList: true,
      subtree: true,
    });
    document.addEventListener("click", click);
    document.addEventListener("mousedown", down);
    scan();
    return () => {
      observer.disconnect();
      document.removeEventListener("click", click);
      document.removeEventListener("mousedown", down);
      cancelAnimationFrame(frame);
    };
  }, [scopeKey]);

  if (!columns.length) return null;
  return (
    <div className="smart-table-tools">
      <button
        className="smart-table-launch"
        onClick={() => setOpen((value) => !value)}
      >
        ☷ Cột
      </button>
      {open && (
        <div className="smart-table-panel">
          <header>
            <div>
              <b>Tùy chỉnh bảng</b>
              <small>{tableName}</small>
            </div>
            <button onClick={() => setOpen(false)}>×</button>
          </header>
          <p>
            Bấm vào bảng cần chỉnh. Kéo mép phải tiêu đề cột hoặc dùng − / +.
          </p>
          <div className="smart-column-list">
            {columns.map((column) => (
              <div
                key={column.index}
                className={column.hidden ? "hidden-column" : ""}
              >
                <label>
                  <input
                    type="checkbox"
                    checked={!column.hidden}
                    onChange={() => toggle(column.index)}
                  />
                  <span title={column.label}>{column.label}</span>
                </label>
                <div>
                  <button onClick={() => resize(column.index, -20)}>−</button>
                  <output>{column.width}</output>
                  <button onClick={() => resize(column.index, 20)}>＋</button>
                </div>
              </div>
            ))}
          </div>
          <footer>
            <button onClick={reset}>Khôi phục mặc định</button>
            <button onClick={() => setOpen(false)}>Xong</button>
          </footer>
        </div>
      )}
    </div>
  );
}
