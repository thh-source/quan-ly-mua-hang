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

const nativeSetSelectValue = (select: HTMLSelectElement, value: string) => {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
  setter?.call(select, value);
  select.dispatchEvent(new Event("change", { bubbles: true }));
};

export default function QuoteTableCustomizer() {
  useEffect(() => {
    let running = false;
    let scheduled = 0;

    const ensureVatBank = () => {
      let bank = document.querySelector<HTMLDivElement>("#quote-global-vat-bank");
      if (!bank) {
        bank = document.createElement("div");
        bank.id = "quote-global-vat-bank";
        bank.hidden = true;
        document.body.appendChild(bank);
      }
      return bank;
    };

    const applyGlobalMode = (mode: "before-vat" | "after-vat") => {
      document
        .querySelectorAll<HTMLSelectElement>("#quote-global-vat-bank select[data-quote-vat-select]")
        .forEach((select) => nativeSetSelectValue(select, mode));
    };

    const decorate = () => {
      if (running) return;
      running = true;
      try {
        const table = document.querySelector<HTMLTableElement>(".vat-quote-table table");
        if (!table || !table.tHead || table.tHead.rows.length < 2) return;

        const topRow = table.tHead.rows[0];
        const subRow = table.tHead.rows[1];
        const supplierHeaders = Array.from(
          topRow.querySelectorAll<HTMLTableCellElement>("th.suphead"),
        );
        if (!supplierHeaders.length) return;

        const customColumns = readColumns();
        const fixedColumnCount = Array.from(topRow.cells).filter(
          (cell) => cell.rowSpan === 2,
        ).length;

        const hasOldVatColumns = Array.from(subRow.cells).some((cell) => {
          const text = normalize(cell.textContent || "");
          return text === "loai vat" || text === "quy doi";
        });
        const currentCustomCount = subRow.querySelectorAll("th[data-quote-custom]").length;
        const expectedCustomCount = customColumns.length * supplierHeaders.length;

        if (!hasOldVatColumns && currentCustomCount === expectedCustomCount) {
          supplierHeaders.forEach((cell) => {
            cell.colSpan = 2 + customColumns.length;
          });
          return;
        }

        // Remove any previously generated custom columns before rebuilding the table.
        subRow.querySelectorAll("th[data-quote-custom]").forEach((node) => node.remove());
        table.querySelectorAll("td[data-quote-custom]").forEach((node) => node.remove());

        const bank = ensureVatBank();
        bank.replaceChildren();

        // Locate Loại/VAT and Quy đổi in the supplier subheader row. These indexes
        // do NOT include the row-spanned fixed item columns, so translate them when
        // removing cells from tbody.
        const removeSubIndexes = Array.from(subRow.cells)
          .map((cell, index) => ({ index, text: normalize(cell.textContent || "") }))
          .filter(({ text }) => text === "loai vat" || text === "quy doi")
          .map(({ index }) => index)
          .sort((a, b) => b - a);

        // Preserve the real React VAT select controls outside the table. This keeps
        // the single global VAT toggle functional while the per-NCC VAT columns are
        // physically removed from the rendered table.
        Array.from(table.tBodies).forEach((tbody) => {
          Array.from(tbody.rows).forEach((row) => {
            removeSubIndexes.forEach((subIndex) => {
              const bodyIndex = fixedColumnCount + subIndex;
              const cell = row.cells[bodyIndex];
              if (!cell) return;
              const label = normalize(subRow.cells[subIndex]?.textContent || "");
              if (label === "loai vat") {
                const select = cell.querySelector<HTMLSelectElement>("select");
                if (select) {
                  select.dataset.quoteVatSelect = "1";
                  bank.appendChild(select);
                }
                const rate = cell.querySelector<HTMLInputElement>('input[type="number"]');
                if (rate && rate.value !== "10") {
                  rate.value = "10";
                  rate.dispatchEvent(new Event("input", { bubbles: true }));
                  rate.dispatchEvent(new Event("change", { bubbles: true }));
                }
              }
              cell.remove();
            });
          });
        });

        // Footer uses two physical cells for all fixed columns (checkbox + colspan),
        // then one cell per supplier subcolumn.
        if (table.tFoot) {
          Array.from(table.tFoot.rows).forEach((row) => {
            removeSubIndexes.forEach((subIndex) => {
              const footerIndex = 2 + subIndex;
              row.cells[footerIndex]?.remove();
            });
          });
        }

        removeSubIndexes.forEach((subIndex) => subRow.cells[subIndex]?.remove());

        supplierHeaders.forEach((cell) => {
          cell.colSpan = 2 + customColumns.length;
        });

        // Add custom columns between Giá NCC and Ghi chú for each supplier.
        for (let supplierIndex = 0; supplierIndex < supplierHeaders.length; supplierIndex += 1) {
          for (const column of customColumns) {
            const noteHeaders = Array.from(subRow.cells).filter(
              (cell) => normalize(cell.textContent || "") === "ghi chu",
            );
            const noteHeader = noteHeaders[supplierIndex];
            if (!noteHeader) continue;

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
              table.removeAttribute("data-quote-custom-ready");
              schedule();
            });
            th.appendChild(remove);
            subRow.insertBefore(th, noteHeader);

            const subIndex = Array.from(subRow.cells).indexOf(th);
            Array.from(table.tBodies).forEach((tbody) => {
              Array.from(tbody.rows).forEach((row, rowIndex) => {
                const td = document.createElement("td");
                td.dataset.quoteCustom = column.id;
                td.className = "quote-custom-cell";

                const input = document.createElement("input");
                input.type = "text";
                input.placeholder = column.label;

                const supplierName =
                  supplierHeaders[supplierIndex]?.textContent?.replace("×", "").trim() ||
                  `supplier-${supplierIndex}`;
                const rowKey = Array.from(row.cells)
                  .slice(0, Math.min(fixedColumnCount, 6))
                  .map((cell) => (cell.textContent || "").trim())
                  .join("|") || `row-${rowIndex}`;
                const key = `${pageContext()}|${supplierName}|${rowKey}|${column.id}`;
                input.value = readValues()[key] || "";
                input.addEventListener("input", () => saveValue(key, input.value));
                td.appendChild(input);

                const bodyIndex = fixedColumnCount + subIndex;
                row.insertBefore(td, row.cells[bodyIndex] || null);
              });
            });

            if (table.tFoot) {
              Array.from(table.tFoot.rows).forEach((row) => {
                const td = document.createElement("td");
                td.dataset.quoteCustom = column.id;
                td.className = "quote-custom-footer";
                const footerIndex = 2 + subIndex;
                row.insertBefore(td, row.cells[footerIndex] || null);
              });
            }
          }
        }

        table.dataset.quoteCustomReady = "1";

        const toolbar = document.querySelector<HTMLElement>(".vat-compare-toolbar");
        if (toolbar) {
          const label = toolbar.querySelector("span");
          if (label) label.textContent = "Giá NCC nhập vào:";

          if (toolbar.dataset.globalVatReady !== "1") {
            toolbar.dataset.globalVatReady = "1";
            toolbar.querySelectorAll<HTMLButtonElement>("button").forEach((button) => {
              if (button.classList.contains("quote-custom-column-btn")) return;
              button.addEventListener("click", () => {
                const mode = normalize(button.textContent || "").includes("co vat")
                  ? "after-vat"
                  : "before-vat";
                window.setTimeout(() => applyGlobalMode(mode), 0);
              });
            });

            const add = document.createElement("button");
            add.type = "button";
            add.className = "quote-custom-column-btn";
            add.textContent = "＋ Cột tùy chọn";
            add.title = "Thêm Tên hàng NCC báo, Xuất xứ, Hãng sản xuất, Thời gian giao hàng...";
            add.addEventListener("click", () => {
              const labelText = window.prompt(
                "Tên cột muốn thêm cho mỗi nhà cung cấp:\nVí dụ: Tên hàng NCC báo, Xuất xứ, Hãng sản xuất, Thời gian giao hàng...",
              );
              const clean = labelText?.trim();
              if (!clean) return;
              const cols = readColumns();
              cols.push({ id: `c${Date.now().toString(36)}`, label: clean });
              localStorage.setItem(STORAGE_COLUMNS, JSON.stringify(cols));
              table.removeAttribute("data-quote-custom-ready");
              schedule();
            });
            toolbar.appendChild(add);
          }
        }

        const activeButton = toolbar?.querySelector<HTMLButtonElement>("button.active");
        const activeMode = normalize(activeButton?.textContent || "").includes("co vat")
          ? "after-vat"
          : "before-vat";
        applyGlobalMode(activeMode);
      } finally {
        running = false;
      }
    };

    const schedule = () => {
      window.cancelAnimationFrame(scheduled);
      scheduled = window.requestAnimationFrame(decorate);
    };

    schedule();
    const observer = new MutationObserver((mutations) => {
      const relevant = mutations.some((mutation) =>
        Array.from(mutation.addedNodes).some(
          (node) => node instanceof HTMLElement && (node.matches?.(".vat-quote-table, table, tr, th, td") || node.querySelector?.(".vat-quote-table")),
        ),
      );
      if (relevant) schedule();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(scheduled);
      document.querySelector("#quote-global-vat-bank")?.remove();
    };
  }, []);

  return null;
}
