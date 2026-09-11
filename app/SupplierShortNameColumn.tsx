"use client";

import { useEffect } from "react";
import { shortSupplierName } from "./SupplierPickerEnhancer";
import "./supplier-short-name-column.css";

const normalizeText = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export default function SupplierShortNameColumn() {
  useEffect(() => {
    let busy = false;

    const decorate = () => {
      if (busy) return;
      busy = true;
      try {
        const tables = Array.from(document.querySelectorAll<HTMLTableElement>("table"));
        for (const table of tables) {
          const headerRow = table.tHead?.rows?.[0];
          if (!headerRow) continue;

          const headers = Array.from(headerRow.cells);
          const codeIndex = headers.findIndex((cell) => normalizeText(cell.textContent || "") === "ma ncc");
          const nameIndex = headers.findIndex((cell) => normalizeText(cell.textContent || "") === "ten nha cung cap");
          if (codeIndex < 0 || nameIndex < 0) continue;

          let shortIndex = headers.findIndex((cell) => normalizeText(cell.textContent || "") === "ten viet tat");
          if (shortIndex < 0) {
            const th = document.createElement("th");
            th.textContent = "TÊN VIẾT TẮT";
            th.className = "supplier-short-name-head";
            const before = headerRow.cells[nameIndex + 1] || null;
            headerRow.insertBefore(th, before);
            shortIndex = nameIndex + 1;
          }

          Array.from(table.tBodies).forEach((tbody) => {
            Array.from(tbody.rows).forEach((row) => {
              const cells = Array.from(row.cells);
              const currentNameIndex = Array.from(headerRow.cells).findIndex(
                (cell) => normalizeText(cell.textContent || "") === "ten nha cung cap",
              );
              const currentShortIndex = Array.from(headerRow.cells).findIndex(
                (cell) => normalizeText(cell.textContent || "") === "ten viet tat",
              );
              if (currentNameIndex < 0 || currentShortIndex < 0) return;

              const fullName = (row.cells[currentNameIndex]?.textContent || "")
                .replace(/Chưa có thông tin phụ/gi, "")
                .trim();
              if (!fullName) return;

              let td = row.querySelector<HTMLTableCellElement>("td.supplier-short-name-cell");
              if (!td) {
                td = document.createElement("td");
                td.className = "supplier-short-name-cell";
                const before = row.cells[currentShortIndex] || null;
                row.insertBefore(td, before);
              }

              const shortName = shortSupplierName(fullName);
              td.textContent = shortName || fullName;
              td.title = `Tên đầy đủ: ${fullName}`;
            });
          });
        }
      } finally {
        busy = false;
      }
    };

    decorate();
    const observer = new MutationObserver(() => window.requestAnimationFrame(decorate));
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
