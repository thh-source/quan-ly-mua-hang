"use client";

import { useEffect } from "react";
import "./quote-table-customizer.css";

type CustomColumn = { id: string; label: string };

const STORAGE_COLUMNS = "procurement.quote.custom-columns.v1";
const STORAGE_VALUES = "procurement.quote.custom-values.v1";

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const readColumns = (): CustomColumn[] => {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_COLUMNS) || "[]");
    return Array.isArray(parsed) ? parsed.filter((x) => x?.id && x?.label) : [];
  } catch {
    return [];
  }
};

const readValues = (): Record<string, string> => {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_VALUES) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

const saveValue = (key: string, value: string) => {
  const all = readValues();
  all[key] = value;
  localStorage.setItem(STORAGE_VALUES, JSON.stringify(all));
};

const pageContext = () => {
  const heading = document.querySelector<HTMLElement>(".heading")?.textContent || "quote";
  return normalize(heading).slice(0, 180) || "quote";
};

export default function QuoteTableCustomizer() {
  useEffect(() => {
    let running = false;

    const decorate = () => {
      if (running) return;
      running = true;
      try {
        const table = document.querySelector<HTMLTableElement>(".vat-quote-table table");
        if (!table || !table.tHead || table.tHead.rows.length < 2) return;

        const topRow = table.tHead.rows[0];
        const subRow = table.tHead.rows[1];
        const customColumns = readColumns();

        // Global VAT choice: keep the existing two comparison buttons, but make them
        // the single VAT mode for every supplier price entry.
        const toolbar = document.querySelector<HTMLElement>(".vat-compare-toolbar");
        if (toolbar && toolbar.dataset.globalVatReady !== "1") {
          toolbar.dataset.globalVatReady = "1";
          const label = toolbar.querySelector("span");
          if (label) label.textContent = "Giá nhập cho toàn bộ bảng:";
          toolbar.querySelectorAll<HTMLButtonElement>("button").forEach((button) => {
            const mode = normalize(button.textContent || "").includes("co vat") ? "after-vat" : "before-vat";
            button.addEventListener("click", () => {
              window.setTimeout(() => {
                document.querySelectorAll<HTMLSelectElement>(".vat-mode-cell select").forEach((select) => {
                  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
                  setter?.call(select, mode);
                  select.dispatchEvent(new Event("change", { bubbles: true }));
                });
              }, 0);
            });
          });

          const add = document.createElement("button");
          add.type = "button";
          add.className = "quote-custom-column-btn";
          add.textContent = "＋ Cột tùy chọn";
          add.title = "Thêm cột như Tên hàng NCC báo giá, Xuất xứ, Hãng sản xuất...";
          add.addEventListener("click", () => {
            const labelText = window.prompt(
              "Tên cột muốn thêm cho mỗi nhà cung cấp:\nVí dụ: Tên hàng NCC báo giá, Xuất xứ, Hãng sản xuất, Thời gian giao hàng...",
            );
            const clean = labelText?.trim();
            if (!clean) return;
            const cols = readColumns();
            const id = `c${Date.now().toString(36)}`;
            cols.push({ id, label: clean });
            localStorage.setItem(STORAGE_COLUMNS, JSON.stringify(cols));
            decorate();
          });
          toolbar.appendChild(add);
        }

        // Hide the old per-supplier VAT/conversion columns. They remain in DOM so
        // existing state/logic stays backward-compatible.
        const subHeaders = Array.from(subRow.cells);
        const hiddenIndexes: number[] = [];
        subHeaders.forEach((cell, index) => {
          const text = normalize(cell.textContent || "");
          if (text === "loai vat" || text === "quy doi") {
            cell.classList.add("quote-hidden-column");
            hiddenIndexes.push(index);
          }
        });

        // Supplier group headers are the headers between fixed item columns and
        // the final automatic-choice group. Their original colspan is 4.
        const supplierHeaders = Array.from(topRow.cells).filter(
          (cell) => cell.classList.contains("suphead"),
        ) as HTMLTableCellElement[];
        supplierHeaders.forEach((cell) => {
          cell.colSpan = 2 + customColumns.length;
        });

        const supplierCount = supplierHeaders.length;
        if (!supplierCount) return;

        // Add custom subheaders after Giá NCC and before Ghi chú for every supplier.
        const existingCustomHeaders = Array.from(subRow.querySelectorAll<HTMLTableCellElement>("th[data-quote-custom]"));
        existingCustomHeaders.forEach((node) => node.remove());

        const liveSubHeaders = Array.from(subRow.cells);
        const noteCells = liveSubHeaders.filter((cell) => normalize(cell.textContent || "") === "ghi chu");
        noteCells.slice(0, supplierCount).forEach((noteCell) => {
          customColumns.forEach((column) => {
            const th = document.createElement("th");
            th.dataset.quoteCustom = column.id;
            th.className = "quote-custom-head";
            const labelSpan = document.createElement("span");
            labelSpan.textContent = column.label;
            th.appendChild(labelSpan);
            const remove = document.createElement("button");
            remove.type = "button";
            remove.textContent = "×";
            remove.title = `Xóa cột ${column.label}`;
            remove.addEventListener("click", () => {
              const cols = readColumns().filter((x) => x.id !== column.id);
              localStorage.setItem(STORAGE_COLUMNS, JSON.stringify(cols));
              decorate();
            });
            th.appendChild(remove);
            subRow.insertBefore(th, noteCell);
          });
        });

        // Re-derive indexes after custom headers are inserted.
        const headerCells = Array.from(subRow.cells);
        const hiddenNow = headerCells
          .map((cell, idx) => ({ idx, text: normalize(cell.textContent || "") }))
          .filter((x) => x.text === "loai vat" || x.text === "quy doi")
          .map((x) => x.idx);

        Array.from(table.tBodies).forEach((tbody) => {
          Array.from(tbody.rows).forEach((row, rowIndex) => {
            // Remove stale generated cells first.
            row.querySelectorAll("td[data-quote-custom]").forEach((node) => node.remove());

            hiddenNow.forEach((idx) => {
              row.cells[idx]?.classList.add("quote-hidden-column");
            });

            const currentHeaderCells = Array.from(subRow.cells);
            currentHeaderCells.forEach((header, colIndex) => {
              const customId = header.getAttribute("data-quote-custom");
              if (!customId) return;
              const td = document.createElement("td");
              td.dataset.quoteCustom = customId;
              td.className = "quote-custom-cell";
              const input = document.createElement("input");
              input.type = "text";
              input.placeholder = header.querySelector("span")?.textContent || "Nhập thông tin";

              const supplierIndex = currentHeaderCells
                .slice(0, colIndex)
                .filter((h) => normalize(h.textContent || "") === "gia ncc").length - 1;
              const supplierName = supplierHeaders[Math.max(0, supplierIndex)]?.textContent?.replace("×", "").trim() || `supplier-${supplierIndex}`;
              const rowKey = Array.from(row.cells)
                .slice(0, 6)
                .map((c) => (c.textContent || "").trim())
                .join("|") || `row-${rowIndex}`;
              const key = `${pageContext()}|${supplierName}|${rowKey}|${customId}`;
              input.value = readValues()[key] || "";
              input.addEventListener("input", () => saveValue(key, input.value));
              td.appendChild(input);

              const before = row.cells[colIndex] || null;
              row.insertBefore(td, before);
            });
          });
        });

        // Footer follows the same visual simplification.
        if (table.tFoot) {
          Array.from(table.tFoot.rows).forEach((row) => {
            row.querySelectorAll("td[data-quote-custom]").forEach((node) => node.remove());
            hiddenNow.forEach((idx) => row.cells[idx]?.classList.add("quote-hidden-column"));
            const currentHeaderCells = Array.from(subRow.cells);
            currentHeaderCells.forEach((header, colIndex) => {
              const customId = header.getAttribute("data-quote-custom");
              if (!customId) return;
              const td = document.createElement("td");
              td.dataset.quoteCustom = customId;
              td.className = "quote-custom-footer";
              const before = row.cells[colIndex] || null;
              row.insertBefore(td, before);
            });
          });
        }
      } finally {
        running = false;
      }
    };

    const schedule = () => window.requestAnimationFrame(decorate);
    schedule();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
