"use client";

import { useEffect } from "react";
import "./supplier-history-popup.css";

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export default function SupplierHistoryPopup() {
  useEffect(() => {
    let moving = false;

    const closeSelectedSupplier = () => {
      const supplierPage = document.querySelector<HTMLElement>(".supplier-page");
      const closeButton = Array.from(
        supplierPage?.querySelectorAll<HTMLButtonElement>("button") || [],
      ).find((button) => normalize(button.textContent || "") === "dong chi tiet");
      closeButton?.click();
    };

    const decorate = () => {
      if (moving) return;
      const history = document.querySelector<HTMLElement>(".supplier-purchase-history");
      if (!history) {
        document.querySelector(".supplier-history-popup-backdrop")?.remove();
        return;
      }
      if (history.closest(".supplier-history-popup-card")) return;

      moving = true;
      try {
        const originalParent = history.parentElement;
        if (!originalParent) return;

        const placeholder = document.createComment("supplier-history-popup-placeholder");
        originalParent.insertBefore(placeholder, history);

        const backdrop = document.createElement("div");
        backdrop.className = "supplier-history-popup-backdrop";

        const card = document.createElement("div");
        card.className = "supplier-history-popup-card";
        card.addEventListener("mousedown", (event) => event.stopPropagation());

        const top = document.createElement("div");
        top.className = "supplier-history-popup-top";
        const title = document.createElement("strong");
        title.textContent = "Lịch sử mua và nhập kho";
        const close = document.createElement("button");
        close.type = "button";
        close.className = "supplier-history-popup-close";
        close.setAttribute("aria-label", "Đóng");
        close.textContent = "×";
        close.addEventListener("click", closeSelectedSupplier);
        top.append(title, close);

        card.append(top, history);
        backdrop.appendChild(card);
        backdrop.addEventListener("mousedown", closeSelectedSupplier);
        document.body.appendChild(backdrop);

        const restore = new MutationObserver(() => {
          if (!document.body.contains(history)) {
            restore.disconnect();
            backdrop.remove();
            return;
          }
          const selectedStillExists = document.querySelector(".supplier-page tr.selected");
          if (!selectedStillExists) {
            restore.disconnect();
            if (placeholder.parentNode) placeholder.parentNode.insertBefore(history, placeholder);
            placeholder.remove();
            backdrop.remove();
          }
        });
        restore.observe(document.body, { childList: true, subtree: true });
      } finally {
        moving = false;
      }
    };

    decorate();
    const observer = new MutationObserver(() => window.requestAnimationFrame(decorate));
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
