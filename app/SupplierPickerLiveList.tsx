"use client";

import { useEffect } from "react";
import "./supplier-picker-live-list.css";

const normalizeText = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export default function SupplierPickerLiveList() {
  useEffect(() => {
    const enhance = () => {
      const search = document.querySelector<HTMLInputElement>(".supplier-picker-search input");
      if (!search || search.dataset.liveListReady === "1") return;

      const modal = search.closest<HTMLElement>(".modal");
      const select = modal?.querySelector<HTMLSelectElement>("select");
      if (!modal || !select) return;

      search.dataset.liveListReady = "1";
      select.classList.add("supplier-native-select");

      const list = document.createElement("div");
      list.className = "supplier-live-list";
      search.parentElement?.appendChild(list);

      const choose = (option: HTMLOptionElement) => {
        const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
        setter?.call(select, option.value);
        select.dispatchEvent(new Event("change", { bubbles: true }));
        search.value = (option.dataset.fullSupplierName || option.textContent || "").trim();
        render();
        list.classList.remove("open");
      };

      const render = () => {
        const q = normalizeText(search.value);
        const options = Array.from(select.options).filter((option) => option.value);
        const matches = options.filter((option) => {
          const full = option.dataset.fullSupplierName || option.textContent || "";
          const code = option.dataset.supplierCode || "";
          return !q || normalizeText(`${code} ${full} ${option.textContent || ""}`).includes(q);
        }).slice(0, 12);

        list.innerHTML = "";
        if (!matches.length) {
          const empty = document.createElement("div");
          empty.className = "supplier-live-empty";
          empty.textContent = q ? "Không tìm thấy nhà cung cấp phù hợp" : "Chưa có nhà cung cấp để chọn";
          list.appendChild(empty);
        } else {
          matches.forEach((option) => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "supplier-live-option";
            button.innerHTML = `<strong>${option.dataset.fullSupplierName || option.textContent || ""}</strong><span>${option.dataset.supplierCode || ""}</span>`;
            button.addEventListener("mousedown", (event) => {
              event.preventDefault();
              choose(option);
            });
            list.appendChild(button);
          });
        }
        list.classList.add("open");
      };

      search.addEventListener("input", render);
      search.addEventListener("focus", render);
      search.addEventListener("keydown", (event) => {
        const buttons = Array.from(list.querySelectorAll<HTMLButtonElement>(".supplier-live-option"));
        if (event.key === "Enter" && buttons.length) {
          event.preventDefault();
          buttons[0].dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
        }
        if (event.key === "Escape") list.classList.remove("open");
      });
      search.addEventListener("blur", () => window.setTimeout(() => list.classList.remove("open"), 120));
    };

    enhance();
    const observer = new MutationObserver(enhance);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
