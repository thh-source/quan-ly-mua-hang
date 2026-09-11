"use client";

import { useEffect, useMemo, useState } from "react";
import "./supplier-picker-enhancer.css";

const normalizeText = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const titleCaseIfUpper = (value: string) => {
  const letters = value.replace(/[^A-Za-zÀ-ỹ]/g, "");
  if (!letters || letters !== letters.toUpperCase()) return value.trim();
  return value
    .toLocaleLowerCase("vi")
    .replace(/(^|[\s\-\/])([a-zà-ỹ])/g, (_, gap: string, char: string) => `${gap}${char.toLocaleUpperCase("vi")}`)
    .trim();
};

export const shortSupplierName = (input: string) => {
  let name = titleCaseIfUpper(input.replace(/\s+/g, " ").trim());
  if (!name) return "";
  const original = name;

  name = name
    .replace(/^chi\s+nh[aá]nh\s+(c[oô]ng\s+ty\s+)?/i, "")
    .replace(/^c[oô]ng\s+ty\s+(tr[aá]ch\s+nhi[eệ]m\s+h[uữ]u\s+h[aạ]n\s+)?/i, "")
    .replace(/^c[oô]ng\s+ty\s+(c[oổ]\s+ph[aầ]n|cp|tnhh|tnhh\s+mtv)\s+/i, "")
    .replace(/^cty\s+(cp|tnhh)?\s*/i, "")
    .trim();

  const descriptors = [
    "cổ phần", "trách nhiệm hữu hạn", "tnhh", "thương mại", "dịch vụ",
    "sản xuất", "xuất nhập khẩu", "dược phẩm", "hóa chất", "thiết bị",
    "vật tư", "phát triển", "đầu tư", "công nghệ", "kỹ thuật", "y tế",
    "phân phối", "kinh doanh"
  ];
  let changed = true;
  while (changed && name) {
    changed = false;
    for (const descriptor of descriptors) {
      const re = new RegExp(`^${descriptor.replace(/ /g, "\\s+")}\\s+`, "i");
      if (re.test(name)) {
        name = name.replace(re, "").trim();
        changed = true;
      }
    }
  }

  name = name.replace(/\s*[\(\[].*?[\)\]]\s*$/g, "").trim();
  if (!name || name.length < 2) return original;
  return name;
};

const waitFor = async <T,>(finder: () => T | null | undefined, timeout = 6000): Promise<T> => {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const value = finder();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  throw new Error("Hết thời gian chờ giao diện cập nhật.");
};

const clickButton = (text: string, root: ParentNode = document) => {
  const normalized = normalizeText(text);
  const button = Array.from(root.querySelectorAll("button")).find(
    (node) => normalizeText(node.textContent || "") === normalized,
  ) as HTMLButtonElement | undefined;
  button?.click();
  return button || null;
};

const setInputValue = (input: HTMLInputElement, value: string) => {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
};

const pickerModal = () =>
  Array.from(document.querySelectorAll<HTMLElement>(".modal")).find((modal) =>
    normalizeText(modal.querySelector("h2")?.textContent || "").includes("chon nha cung cap"),
  ) || null;

const supplierModal = () =>
  Array.from(document.querySelectorAll<HTMLElement>(".modal.supplier-modal, .modal")).find((modal) =>
    normalizeText(modal.querySelector("h2")?.textContent || "").includes("them nha cung cap"),
  ) || null;

const inputByLabel = (root: HTMLElement, labelText: string) => {
  const key = normalizeText(labelText);
  const label = Array.from(root.querySelectorAll("label")).find((node) =>
    normalizeText(node.textContent || "").includes(key),
  );
  return (label?.querySelector("input") as HTMLInputElement | null) || null;
};

const nextSupplierCode = () => {
  const options = Array.from(document.querySelectorAll<HTMLSelectElement>("select"))
    .flatMap((select) => Array.from(select.options));
  const nums = options
    .map((option) => (option.textContent || "").match(/\bNCC-(\d+)\b/i)?.[1])
    .filter(Boolean)
    .map(Number)
    .filter(Number.isFinite);
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return `NCC-${String(next).padStart(3, "0")}`;
};

export default function SupplierPickerEnhancer() {
  const [createOpen, setCreateOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [address, setAddress] = useState("");
  const [contact, setContact] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const shortName = useMemo(() => shortSupplierName(fullName), [fullName]);

  useEffect(() => {
    const decorate = () => {
      const modal = pickerModal();
      if (!modal) return;
      const select = modal.querySelector("select") as HTMLSelectElement | null;
      if (!select) return;

      Array.from(select.options).forEach((option) => {
        if (!option.value) return;
        if (!option.dataset.fullSupplierName) {
          const raw = (option.textContent || "").trim();
          const split = raw.split("·");
          const code = split.shift()?.trim() || "";
          const full = split.join("·").trim() || raw;
          option.dataset.fullSupplierName = full;
          option.dataset.supplierCode = code;
        }
        const full = option.dataset.fullSupplierName || "";
        const code = option.dataset.supplierCode || "";
        const short = shortSupplierName(full);
        const wanted = short && normalizeText(short) !== normalizeText(full)
          ? `${code} · ${short} — ${full}`
          : `${code} · ${full}`;
        if (option.textContent !== wanted) option.textContent = wanted;
      });

      if (!modal.querySelector(".supplier-picker-search")) {
        const wrap = document.createElement("div");
        wrap.className = "supplier-picker-search";
        const input = document.createElement("input");
        input.type = "search";
        input.placeholder = "Gõ tên, tên ngắn hoặc mã nhà cung cấp...";
        input.autocomplete = "off";
        input.addEventListener("input", () => {
          const q = normalizeText(input.value);
          Array.from(select.options).forEach((option) => {
            if (!option.value) return;
            const haystack = normalizeText(
              `${option.dataset.supplierCode || ""} ${option.dataset.fullSupplierName || ""} ${shortSupplierName(option.dataset.fullSupplierName || "")}`,
            );
            option.hidden = !!q && !haystack.includes(q);
          });
          const first = Array.from(select.options).find((option) => option.value && !option.hidden);
          if (q && first) first.scrollIntoView({ block: "nearest" });
        });
        wrap.appendChild(input);
        select.parentElement?.insertBefore(wrap, select);
        window.setTimeout(() => input.focus(), 50);
      }

      if (!modal.querySelector(".supplier-quick-create")) {
        const actions = Array.from(modal.querySelectorAll("div")).reverse().find((node) =>
          Array.from(node.children).some((child) => child.tagName === "BUTTON"),
        );
        const button = document.createElement("button");
        button.type = "button";
        button.className = "ghost supplier-quick-create";
        button.textContent = "＋ Tạo NCC mới";
        button.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          setFullName("");
          setAddress("");
          setContact("");
          setPhone("");
          setCreateOpen(true);
        });
        actions?.insertBefore(button, actions.firstChild);
      }
    };

    decorate();
    const observer = new MutationObserver(decorate);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  const quickCreate = async () => {
    if (!fullName.trim() || busy) return;
    setBusy(true);
    setNotice("");
    const legalName = fullName.trim();
    const code = nextSupplierCode();
    try {
      const picker = pickerModal();
      if (picker) clickButton("Hủy", picker);

      const supplierNav = await waitFor(() =>
        Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
          (button) => normalizeText(button.textContent || "") === "nha cung cap",
        ),
      );
      supplierNav.click();

      const addButton = await waitFor(() =>
        Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find((button) =>
          normalizeText(button.textContent || "").includes("them nha cung cap"),
        ),
      );
      addButton.click();

      const modal = await waitFor(supplierModal);
      const codeInput = inputByLabel(modal, "Mã nhà cung cấp");
      const nameInput = inputByLabel(modal, "Tên nhà cung cấp");
      if (!codeInput || !nameInput) throw new Error("Không tìm thấy form nhà cung cấp.");
      setInputValue(codeInput, code);
      setInputValue(nameInput, legalName);
      const addressInput = inputByLabel(modal, "Địa chỉ");
      const contactInput = inputByLabel(modal, "Người liên hệ");
      const phoneInput = inputByLabel(modal, "Điện thoại");
      if (addressInput && address.trim()) setInputValue(addressInput, address.trim());
      if (contactInput && contact.trim()) setInputValue(contactInput, contact.trim());
      if (phoneInput && phone.trim()) setInputValue(phoneInput, phone.trim());

      const save = clickButton("Lưu nhà cung cấp", modal);
      if (!save) throw new Error("Không tìm thấy nút lưu nhà cung cấp.");
      await waitFor(() => (supplierModal() ? null : true));

      const compareNav = await waitFor(() =>
        Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
          (button) => normalizeText(button.textContent || "").includes("so sanh bao gia"),
        ),
      );
      compareNav.click();

      const chooseButton = await waitFor(() =>
        Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
          (button) => normalizeText(button.textContent || "").includes("chon nha cung cap"),
        ),
      );
      chooseButton.click();

      const pickerAgain = await waitFor(pickerModal);
      const select = await waitFor(() => pickerAgain.querySelector("select") as HTMLSelectElement | null);
      const option = Array.from(select.options).find((item) =>
        normalizeText(item.dataset.fullSupplierName || item.textContent || "").includes(normalizeText(legalName)),
      );
      if (option) {
        const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
        setter?.call(select, option.value);
        select.dispatchEvent(new Event("change", { bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 80));
        clickButton("Thêm vào bảng", pickerAgain);
      }

      setCreateOpen(false);
      setNotice(`Đã tạo ${shortSupplierName(legalName)} và thêm vào bảng so sánh.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Không thể tạo nhà cung cấp.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {createOpen && (
        <div className="supplier-enhancer-backdrop" onMouseDown={() => !busy && setCreateOpen(false)}>
          <div className="supplier-enhancer-modal" onMouseDown={(event) => event.stopPropagation()}>
            <h3>Tạo nhanh nhà cung cấp</h3>
            <p>Nhập tên pháp lý đầy đủ. Hệ thống tự rút gọn tên để tìm và hiển thị nhanh trong danh sách.</p>
            <label>
              Tên nhà cung cấp <b>*</b>
              <input autoFocus value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Ví dụ: Công ty cổ phần dược phẩm Phenikaa" />
            </label>
            <div className="supplier-short-preview">
              Tên ngắn tự động: <b>{shortName || "—"}</b>
            </div>
            <div className="supplier-enhancer-grid">
              <label>Địa chỉ<input value={address} onChange={(event) => setAddress(event.target.value)} /></label>
              <label>Người liên hệ<input value={contact} onChange={(event) => setContact(event.target.value)} /></label>
              <label>Điện thoại<input value={phone} onChange={(event) => setPhone(event.target.value)} /></label>
            </div>
            <div className="supplier-enhancer-actions">
              <button className="ghost" disabled={busy} onClick={() => setCreateOpen(false)}>Hủy</button>
              <button className="primary" disabled={!fullName.trim() || busy} onClick={() => void quickCreate()}>{busy ? "Đang tạo..." : "Tạo và thêm vào bảng"}</button>
            </div>
          </div>
        </div>
      )}
      {notice && <div className="supplier-enhancer-toast" onClick={() => setNotice("")}>{notice}</div>}
    </>
  );
}
