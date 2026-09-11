"use client";

import { useEffect } from "react";
import { shortSupplierName } from "./SupplierPickerEnhancer";

export default function SupplierComparisonShortNames() {
  useEffect(() => {
    const apply = () => {
      document.querySelectorAll<HTMLElement>(".vat-quote-table th.suphead").forEach((head) => {
        const button = head.querySelector("button");
        const raw = Array.from(head.childNodes)
          .filter((node) => node.nodeType === Node.TEXT_NODE)
          .map((node) => node.textContent || "")
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();
        if (!raw) return;
        const short = shortSupplierName(raw);
        if (!short || short === raw) return;
        Array.from(head.childNodes)
          .filter((node) => node.nodeType === Node.TEXT_NODE)
          .forEach((node, index) => {
            if (index === 0) node.textContent = `${short} `;
            else node.textContent = "";
          });
        head.title = raw;
        if (button) head.appendChild(button);
      });

      document.querySelectorAll<HTMLElement>(".vat-quote-table .badge").forEach((badge) => {
        const raw = (badge.dataset.fullSupplierName || badge.textContent || "").trim();
        if (!raw || raw === "Chưa có giá") return;
        if (!badge.dataset.fullSupplierName) badge.dataset.fullSupplierName = raw;
        const short = shortSupplierName(raw);
        if (short && badge.textContent !== short) {
          badge.textContent = short;
          badge.title = raw;
        }
      });
    };

    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
