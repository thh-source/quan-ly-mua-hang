"use client";
import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";

type Item = {
  id: number;
  code: string;
  category: string;
  name: string;
  desc: string;
  spec: string;
  unit: string;
  qty: number;
  estimate: number;
};
type Supplier = {
  id: number;
  code: string;
  name: string;
  bankAccount: string;
  bank: string;
  address: string;
  contact: string;
  phone: string;
};
type Quote = Record<number, Record<number, { price: string; note: string }>>;
type PR = {
  id: number;
  number: string;
  date: string;
  department: string;
  purpose: string;
  items: Item[];
  status: string;
};
type POItem = Item & {
  price: number;
  deliveryStatus: "Chưa giao" | "Giao một phần" | "Đã giao";
  deliveredQty: number;
  deliveryDate: string;
};
type PODoc = {
  id: number;
  name: string;
  status: "Đã đủ" | "Còn thiếu" | "Chờ bổ sung";
  note: string;
};
type Payment = {
  id: number;
  phase: string;
  percent: number;
  amount: number;
  status: "Chưa thanh toán" | "Đang xử lý" | "Đã thanh toán";
  date: string;
};
type PO = {
  id: number;
  number: string;
  prNumber: string;
  supplierId: number;
  createdDate: string;
  expectedDate: string;
  status: string;
  items: POItem[];
  docs: PODoc[];
  payments: Payment[];
  note: string;
};
type View =
  | "dashboard"
  | "prs"
  | "create"
  | "compare"
  | "suppliers"
  | "po-list"
  | "po-detail"
  | "contracts"
  | "products"
  | "settings";
type ColumnKey =
  | "stt"
  | "code"
  | "category"
  | "name"
  | "desc"
  | "spec"
  | "unit"
  | "qty"
  | "estimate"
  | "amount";
type SortState = { key: ColumnKey; direction: "asc" | "desc" } | null;
type StoredState = {
  prs: PR[];
  products: Item[];
  suppliers: Supplier[];
  quotes: Quote;
  pos: PO[];
  items: Item[];
  quoteSupplierIds: number[];
};
const BASE_COLUMNS: { key: ColumnKey; label: string }[] = [
  { key: "stt", label: "STT" },
  { key: "code", label: "Mã hàng" },
  { key: "category", label: "Phân loại" },
  { key: "name", label: "Tên vật tư hàng hóa" },
  { key: "desc", label: "Mô tả kỹ thuật" },
  { key: "spec", label: "Quy cách" },
  { key: "unit", label: "ĐVT" },
  { key: "qty", label: "Số lượng" },
  { key: "estimate", label: "Đơn giá dự kiến" },
  { key: "amount", label: "Thành tiền dự kiến" },
];
const valueOf = (item: Item, key: ColumnKey, index = 0): string | number =>
  key === "stt"
    ? index + 1
    : key === "amount"
      ? item.qty * item.estimate
      : item[key];
const reorder = (order: ColumnKey[], from: ColumnKey, to: ColumnKey) => {
  const next = [...order],
    a = next.indexOf(from),
    b = next.indexOf(to);
  if (a < 0 || b < 0 || a === b) return next;
  next.splice(a, 1);
  next.splice(b, 0, from);
  return next;
};
const applyTools = (
  rows: Item[],
  order: ColumnKey[],
  filters: Partial<Record<ColumnKey, string[]>>,
  sort: SortState,
) => {
  const filtered = rows.filter((item, index) =>
    order.every(
      (key) =>
        !filters[key]?.length ||
        filters[key]!.includes(String(valueOf(item, key, index))),
    ),
  );
  if (!sort) return filtered;
  return [...filtered].sort((a, b) => {
    const av = valueOf(a, sort.key),
      bv = valueOf(b, sort.key);
    const cmp =
      typeof av === "number" && typeof bv === "number"
        ? av - bv
        : String(av).localeCompare(String(bv), "vi");
    return sort.direction === "asc" ? cmp : -cmp;
  });
};

const items0: Item[] = [];
const suppliers0: Supplier[] = [];
const quotes0: Quote = {};
const prs0: PR[] = [];
const emptyItem = (index: number): Item => ({
  id: Date.now() + index,
  code: `VT-${String(index + 1).padStart(3, "0")}`,
  category: "",
  name: "",
  desc: "",
  spec: "",
  unit: "Cái",
  qty: 1,
  estimate: 0,
});
const fmt = (n: number) => new Intl.NumberFormat("vi-VN").format(n || 0);
const dateVN = (s: string) =>
  s ? new Intl.DateTimeFormat("vi-VN").format(new Date(s)) : "—";
const pos0: PO[] = [];
const emptyPR: PR = {
  id: 0,
  number: "",
  date: "",
  department: "",
  purpose: "",
  items: [],
  status: "",
};
const emptyPO: PO = {
  id: 0,
  number: "",
  prNumber: "",
  supplierId: 0,
  createdDate: "",
  expectedDate: "",
  status: "",
  items: [],
  docs: [],
  payments: [],
  note: "",
};

export default function ProcurementApp({
  reportToken,
  currentUser,
}: {
  reportToken?: string;
  currentUser?: {
    id: string;
    username: string;
    displayName: string;
    role: "master" | "admin" | "user";
  };
}) {
  const [view, setView] = useState<View>("dashboard"),
    [collapsed, setCollapsed] = useState(false),
    [prs, setPrs] = useState(prs0),
    [selectedPR, setSelectedPR] = useState(emptyPR);
  const [reportMode] = useState(Boolean(reportToken));
  const [items, setItems] = useState(items0),
    [suppliers, setSuppliers] = useState(suppliers0),
    [quotes, setQuotes] = useState(quotes0),
    [search, setSearch] = useState("");
  const [products, setProducts] = useState<Item[]>(items0);
  const [quoteSupplierIds, setQuoteSupplierIds] = useState<number[]>(
      suppliers0.map((s) => s.id),
    ),
    [supplierPicker, setSupplierPicker] = useState(false),
    [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [supplierModal, setSupplierModal] = useState(false),
    [newSupplier, setNewSupplier] = useState<Omit<Supplier, "id">>({
      code: "",
      name: "",
      bankAccount: "",
      bank: "",
      address: "",
      contact: "",
      phone: "",
    }),
    [importMessage, setImportMessage] = useState("");
  const [poSelections, setPoSelections] = useState<number[]>([]),
    [pos, setPos] = useState<PO[]>(pos0),
    [currentPO, setCurrentPO] = useState<PO>(emptyPO);
  const [storageReady, setStorageReady] = useState(false),
    [storageStatus, setStorageStatus] = useState("Đang kết nối dữ liệu...");
  const [compareOrder, setCompareOrder] = useState<ColumnKey[]>(
      BASE_COLUMNS.map((c) => c.key),
    ),
    [compareFilters, setCompareFilters] = useState<
      Partial<Record<ColumnKey, string[]>>
    >({}),
    [compareSort, setCompareSort] = useState<SortState>(null),
    [compareFilterOpen, setCompareFilterOpen] = useState<ColumnKey | null>(
      null,
    );
  const [draft, setDraft] = useState({
    number: "",
    date: new Date().toISOString().slice(0, 10),
    department: "",
    purpose: "",
    items: [emptyItem(0), emptyItem(1)],
  });
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    let active = true;
    const url = reportToken
      ? `/api/report-state?token=${encodeURIComponent(reportToken)}`
      : "/api/state";
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((body) => {
        if (!active) return;
        const data = body.data as StoredState | null;
        if (data) {
          setPrs(data.prs || prs0);
          setProducts(data.products || items0);
          setSuppliers(data.suppliers || suppliers0);
          setQuotes(data.quotes || quotes0);
          setPos(data.pos || pos0);
          setItems(data.items || items0);
          setQuoteSupplierIds(
            data.quoteSupplierIds || suppliers0.map((s) => s.id),
          );
          if (data.prs?.length) setSelectedPR(data.prs[0]);
          if (data.pos?.length) setCurrentPO(data.pos[0]);
        }
        setStorageReady(true);
        setStorageStatus(data ? "Đã đồng bộ online" : "Sẵn sàng lưu online");
      })
      .catch(() => setStorageStatus("Không thể kết nối dữ liệu"));
    return () => {
      active = false;
    };
  }, [reportToken]);
  useEffect(() => {
    if (!storageReady || reportMode) return;
    const timer = setTimeout(() => {
      setStorageStatus("Đang lưu...");
      fetch("/api/state", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prs,
          products,
          suppliers,
          quotes,
          pos,
          items,
          quoteSupplierIds,
        }),
      })
        .then((r) => {
          if (!r.ok) throw new Error();
          setStorageStatus("Đã lưu trên Cloudflare");
        })
        .catch(() => setStorageStatus("Lưu dữ liệu thất bại"));
    }, 700);
    return () => clearTimeout(timer);
  }, [
    storageReady,
    reportMode,
    prs,
    products,
    suppliers,
    quotes,
    pos,
    items,
    quoteSupplierIds,
  ]);
  const uploadGeneralFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setStorageStatus(`Đang tải ${file.name}...`);
    const form = new FormData();
    form.append("file", file);
    form.append("entityType", "general");
    form.append("entityId", "procurement");
    try {
      const response = await fetch("/api/files", {
        method: "POST",
        body: form,
      });
      if (!response.ok) throw new Error();
      setStorageStatus(`Đã lưu file ${file.name}`);
    } catch {
      setStorageStatus("Tải file thất bại");
    }
    event.target.value = "";
  };
  const openShareReport = async () => {
    setStorageStatus("Đang tạo link báo cáo...");
    try {
      const response = await fetch("/api/share", { method: "POST" });
      if (!response.ok) throw new Error();
      const body = await response.json();
      setStorageStatus("Đã tạo link báo cáo");
      window.open(
        `${window.location.origin}/report/${encodeURIComponent(body.token)}`,
        "_blank",
      );
    } catch {
      setStorageStatus("Không thể tạo link báo cáo");
    }
  };
  const filtered = useMemo(
    () =>
      applyTools(
        items.filter((i) =>
          (i.code + i.category + i.name + i.desc)
            .toLowerCase()
            .includes(search.toLowerCase()),
        ),
        compareOrder,
        compareFilters,
        compareSort,
      ),
    [items, search, compareOrder, compareFilters, compareSort],
  );
  const estimated = items.reduce((s, i) => s + i.qty * i.estimate, 0);
  const comparisonSuppliers = suppliers.filter((s) =>
    quoteSupplierIds.includes(s.id),
  );
  const availableSuppliers = suppliers.filter(
    (s) => !quoteSupplierIds.includes(s.id),
  );
  const best = (itemId: number) => {
    const all = comparisonSuppliers
      .map((s) => ({
        supplier: s,
        price: Number(quotes[itemId]?.[s.id]?.price),
      }))
      .filter((x) => x.price > 0);
    return all.length
      ? all.reduce((a, b) => (b.price < a.price ? b : a))
      : null;
  };
  const itemChange = (
    id: number,
    k: keyof Item,
    v: string,
    forDraft = false,
  ) => {
    const setter = forDraft
      ? (fn: (x: Item[]) => Item[]) =>
          setDraft((d) => ({ ...d, items: fn(d.items) }))
      : setItems;
    setter((x) =>
      x.map((i) =>
        i.id === id
          ? { ...i, [k]: ["qty", "estimate"].includes(k) ? Number(v) : v }
          : i,
      ),
    );
  };
  const quoteChange = (
    iid: number,
    sid: number,
    k: "price" | "note",
    v: string,
  ) =>
    setQuotes((q) => ({
      ...q,
      [iid]: {
        ...q[iid],
        [sid]: {
          price: q[iid]?.[sid]?.price || "",
          note: q[iid]?.[sid]?.note || "",
          [k]: v,
        },
      },
    }));
  const openCompare = (pr: PR) => {
    setSelectedPR(pr);
    setItems(pr.items);
    setQuotes(pr.id === 1 ? quotes0 : {});
    setView("compare");
  };
  const savePR = () => {
    if (
      !draft.number.trim() ||
      !draft.date ||
      !draft.department.trim() ||
      !draft.purpose.trim()
    )
      return;
    const valid = draft.items.filter((i) => i.code.trim() || i.name.trim());
    const pr: PR = {
      id: Date.now(),
      number: draft.number.trim(),
      date: draft.date,
      department: draft.department.trim(),
      purpose: draft.purpose.trim(),
      items: valid,
      status: "Chờ xử lý",
    };
    setPrs((p) => [pr, ...p]);
    setProducts((current) => [
      ...current,
      ...valid
        .filter((i) => !current.some((p) => p.code === i.code))
        .map((i) => ({ ...i, id: Date.now() + i.id })),
    ]);
    setDraft({
      number: `PR-${new Date().getFullYear()}-${String(prs.length + 1).padStart(4, "0")}`,
      date: new Date().toISOString().slice(0, 10),
      department: "",
      purpose: "",
      items: [emptyItem(0)],
    });
    setImportMessage("");
    setView("prs");
  };
  const importExcel = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const wb = XLSX.read(reader.result, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<(string | number)[]>(ws, {
          header: 1,
          defval: "",
        });
        const header = rows.findIndex((r) =>
          r.some((c) => String(c).trim().toLowerCase() === "mã hàng"),
        );
        if (header < 0) throw new Error("Không tìm thấy cột Mã hàng");
        const imported = rows
          .slice(header + 1)
          .filter((r) => String(r[1] || r[0] || "").trim())
          .map((r, i) => ({
            id: Date.now() + i,
            code: String(r[1] ?? ""),
            category: String(r[2] ?? ""),
            name: String(r[3] ?? ""),
            desc: String(r[4] ?? ""),
            spec: String(r[5] ?? ""),
            unit: String(r[6] ?? ""),
            qty: Number(r[7]) || 0,
            estimate: Number(r[8]) || 0,
          }));
        if (!imported.length) throw new Error("File chưa có dữ liệu");
        setDraft((d) => ({ ...d, items: imported }));
        setImportMessage(`Đã nhập ${imported.length} mặt hàng từ ${file.name}`);
      } catch (err) {
        setImportMessage(
          `Không thể nhập file: ${err instanceof Error ? err.message : "Sai định dạng"}`,
        );
      }
      event.target.value = "";
    };
    reader.readAsArrayBuffer(file);
  };
  const openSupplierModal = () => {
    setNewSupplier({
      code: `NCC-${String(suppliers.length + 1).padStart(3, "0")}`,
      name: "",
      bankAccount: "",
      bank: "",
      address: "",
      contact: "",
      phone: "",
    });
    setSupplierModal(true);
  };
  const supplierField = (key: keyof Omit<Supplier, "id">, value: string) =>
    setNewSupplier((s) => ({ ...s, [key]: value }));
  const addSupplier = () => {
    if (!newSupplier.name.trim() || !newSupplier.code.trim()) return;
    setSuppliers((s) => [
      ...s,
      {
        id: Date.now(),
        ...newSupplier,
        code: newSupplier.code.trim(),
        name: newSupplier.name.trim(),
      },
    ]);
    setSupplierModal(false);
  };
  const addQuoteSupplier = () => {
    const id = Number(selectedSupplierId);
    if (!id || quoteSupplierIds.includes(id)) return;
    setQuoteSupplierIds((ids) => [...ids, id]);
    setSelectedSupplierId("");
    setSupplierPicker(false);
  };
  const togglePOItem = (id: number) =>
    setPoSelections((selected) => {
      if (selected.includes(id)) return selected.filter((x) => x !== id);
      const supplierId = best(id)?.supplier.id;
      if (!supplierId) return selected;
      const firstSupplier = selected.length
        ? best(selected[0])?.supplier.id
        : null;
      return firstSupplier && firstSupplier !== supplierId
        ? [id]
        : [...selected, id];
    });
  const createPO = () => {
    if (!poSelections.length) return;
    const supplier = best(poSelections[0])?.supplier;
    if (!supplier) return;
    const po: PO = {
      id: Date.now(),
      number: `PO-${new Date().getFullYear()}-${String(pos.length + 1).padStart(4, "0")}`,
      prNumber: selectedPR.number,
      supplierId: supplier.id,
      createdDate: new Date().toISOString().slice(0, 10),
      expectedDate: "",
      status: "Mới tạo",
      items: items
        .filter((i) => poSelections.includes(i.id))
        .map((i) => ({
          ...i,
          price: Number(quotes[i.id]?.[supplier.id]?.price) || 0,
          deliveryStatus: "Chưa giao",
          deliveredQty: 0,
          deliveryDate: "",
        })),
      docs: [
        {
          id: Date.now(),
          name: "Hợp đồng / PO xác nhận",
          status: "Chờ bổ sung",
          note: "",
        },
        {
          id: Date.now() + 1,
          name: "Hóa đơn VAT",
          status: "Còn thiếu",
          note: "",
        },
        {
          id: Date.now() + 2,
          name: "Biên bản giao nhận",
          status: "Còn thiếu",
          note: "",
        },
      ],
      payments: [
        {
          id: Date.now(),
          phase: "Tạm ứng",
          percent: 50,
          amount: 0,
          status: "Chưa thanh toán",
          date: "",
        },
        {
          id: Date.now() + 1,
          phase: "Thanh toán còn lại",
          percent: 50,
          amount: 0,
          status: "Chưa thanh toán",
          date: "",
        },
      ],
      note: "",
    };
    const total = po.items.reduce((s, i) => s + i.price * i.qty, 0);
    po.payments = po.payments.map((p) => ({
      ...p,
      amount: (total * p.percent) / 100,
    }));
    setPos((p) => [po, ...p]);
    setCurrentPO(po);
    setPoSelections([]);
    setView("po-detail");
  };
  const updatePO = (po: PO) => {
    setCurrentPO(po);
    setPos((list) => list.map((x) => (x.id === po.id ? po : x)));
  };
  const nav = [
    { icon: "▦", name: "Tổng quan", action: () => setView("dashboard") },
    { icon: "▣", name: "Danh sách PR", action: () => setView("prs") },
    { icon: "▤", name: "Yêu cầu báo giá" },
    { icon: "⚖", name: "So sánh báo giá", action: () => setView("compare") },
    { icon: "▰", name: "Quản lý PO", action: () => setView("po-list") },
    { icon: "▧", name: "Hợp đồng", action: () => setView("contracts") },
    { icon: "▱", name: "Nhà cung cấp", action: () => setView("suppliers") },
    { icon: "◇", name: "Hàng hóa", action: () => setView("products") },
    { icon: "▥", name: "Báo cáo" },
    { icon: "≋", name: "Danh mục" },
    ...(currentUser?.role === "master" || currentUser?.role === "admin"
      ? [
          {
            icon: "⚙",
            name: "Cài đặt",
            action: () => setView("settings" as View),
          },
        ]
      : []),
  ];
  const visibleNav = reportMode
    ? nav.filter((n) =>
        [
          "Tổng quan",
          "Danh sách PR",
          "So sánh báo giá",
          "Quản lý PO",
          "Hợp đồng",
        ].includes(n.name),
      )
    : nav;
  return (
    <div
      className={`app ${collapsed ? "collapsed" : ""} ${reportMode ? "report-mode" : ""}`}
    >
      <aside>
        <div className="brand">
          <span>◆</span>
          <b>{reportMode ? "BÁO CÁO" : "MUA SẮM"}</b>
        </div>
        <nav>
          {visibleNav.map((n) => (
            <button
              onClick={n.action}
              className={
                (view === "dashboard" && n.name === "Tổng quan") ||
                (view === "compare" && n.name === "So sánh báo giá") ||
                ((view === "prs" || view === "create") &&
                  n.name === "Danh sách PR") ||
                ((view === "po-list" || view === "po-detail") &&
                  n.name === "Quản lý PO") ||
                (view === "contracts" && n.name === "Hợp đồng") ||
                (view === "products" && n.name === "Hàng hóa") ||
                (view === "suppliers" && n.name === "Nhà cung cấp") ||
                (view === "settings" && n.name === "Cài đặt")
                  ? "active"
                  : ""
              }
              key={n.name}
            >
              <span>{n.icon}</span>
              <b>{n.name}</b>
            </button>
          ))}
        </nav>
        <button className="collapse" onClick={() => setCollapsed(!collapsed)}>
          « <b>Thu gọn</b>
        </button>
      </aside>
      <main>
        <header>
          <button className="hamb" onClick={() => setCollapsed(!collapsed)}>
            ☰
          </button>
          <div className="crumb">
            <span>Trang chủ</span>
            {view !== "dashboard" && (
              <>
                {" "}
                ›{" "}
                <span>
                  {view === "compare"
                    ? "So sánh báo giá"
                    : view.startsWith("po")
                      ? "Quản lý PO"
                      : view === "contracts"
                        ? "Hợp đồng"
                        : view === "products"
                          ? "Hàng hóa"
                          : view === "settings"
                            ? "Cài đặt"
                            : view === "suppliers"
                              ? "Nhà cung cấp"
                              : "Đề nghị mua hàng"}
                </span>
              </>
            )}
            {(view === "create" ||
              view === "compare" ||
              view === "po-detail") && (
              <>
                {" "}
                ›{" "}
                <b>
                  {view === "create"
                    ? "Tạo PR mới"
                    : view === "po-detail"
                      ? currentPO.number
                      : selectedPR.number}
                </b>
              </>
            )}
          </div>
          <div className="user">
            <i>{currentUser?.displayName?.slice(0, 2).toUpperCase() || "BC"}</i>
            <div>
              <b>{currentUser?.displayName || "Báo cáo"}</b>
              <small>
                {currentUser
                  ? currentUser.role === "master"
                    ? "Master Admin"
                    : currentUser.role === "admin"
                      ? "Admin"
                      : "Người dùng"
                  : "Chỉ xem"}
              </small>
            </div>
          </div>
        </header>
        {reportMode ? (
          <div className="report-banner">
            <div>
              <b>◉ BÁO CÁO CHỈ XEM</b>
              <span>
                Dữ liệu PR, báo giá, PO và hợp đồng · Không thể chỉnh sửa
              </span>
            </div>
            <small>Dữ liệu đồng bộ trực tuyến</small>
          </div>
        ) : (
          <>
            <div
              className={`cloud-status ${storageStatus.includes("thất bại") || storageStatus.includes("Không thể") ? "error" : ""}`}
            >
              <i>●</i>
              {storageStatus}
            </div>
            <label className="storage-upload-launch">
              ⇧ Tải hồ sơ lên
              <input
                type="file"
                hidden
                accept=".xlsx,.xls,.pdf,.doc,.docx,.jpg,.jpeg,.png"
                onChange={uploadGeneralFile}
              />
            </label>
            <button className="share-report-launch" onClick={openShareReport}>
              ↗ Tạo link báo cáo
            </button>
          </>
        )}
        {view === "dashboard" && (
          <Dashboard
            prs={prs}
            pos={pos}
            suppliers={suppliers}
            onPR={() => setView("prs")}
            onPO={() => setView("po-list")}
            onCompare={() => setView("compare")}
          />
        )}
        {view === "contracts" && (
          <ContractManagement
            pos={pos}
            suppliers={suppliers}
            onOpenPO={(po) => {
              setCurrentPO(po);
              setView("po-detail");
            }}
          />
        )}
        {view === "products" && (
          <ProductCatalog
            products={products}
            setProducts={setProducts}
            pos={pos}
            suppliers={suppliers}
            onCreatePR={() => setView("create")}
          />
        )}
        {view === "settings" &&
          currentUser &&
          (currentUser.role === "master" || currentUser.role === "admin") && (
            <AdminSettings currentUser={currentUser} />
          )}
        {view === "prs" && (
          <PRList
            prs={prs}
            onCreate={() => setView("create")}
            onOpen={openCompare}
          />
        )}
        {view === "create" && (
          <CreatePRCatalog
            draft={draft}
            setDraft={setDraft}
            products={products}
            itemChange={itemChange}
            fileRef={fileRef}
            importExcel={importExcel}
            message={importMessage}
            onCancel={() => setView("prs")}
            onSave={savePR}
          />
        )}
        {view === "suppliers" && (
          <SupplierManagement
            suppliers={suppliers}
            setSuppliers={setSuppliers}
            onAdd={openSupplierModal}
          />
        )}
        {view === "po-list" && (
          <POList
            pos={pos}
            suppliers={suppliers}
            onOpen={(po) => {
              setCurrentPO(po);
              setView("po-detail");
            }}
          />
        )}
        {view === "po-detail" && (
          <PODetail
            po={currentPO}
            suppliers={suppliers}
            setSuppliers={setSuppliers}
            onUpdate={updatePO}
            onBack={() => setView("po-list")}
          />
        )}
        {view === "compare" && (
          <section className="content">
            <div className="heading">
              <div>
                <em>YÊU CẦU MUA HÀNG · {selectedPR.number}</em>
                <h1>Bảng tổng hợp mua hàng</h1>
                <p>{selectedPR.purpose}</p>
              </div>
              <div className="actions">
                <button className="ghost" onClick={() => setView("prs")}>
                  ← Danh sách PR
                </button>
                <button
                  className="ghost"
                  onClick={() => setItems((x) => [...x, emptyItem(x.length)])}
                >
                  ＋ Thêm mặt hàng
                </button>
                <button
                  className="primary"
                  onClick={() => {
                    setSelectedSupplierId("");
                    setSupplierPicker(true);
                  }}
                >
                  ＋ Chọn nhà cung cấp
                </button>
                <button
                  className="po-create-btn"
                  disabled={!poSelections.length}
                  onClick={createPO}
                >
                  Tạo PO ({poSelections.length})
                </button>
              </div>
            </div>
            <div className="cards">
              <article>
                <i>◇</i>
                <strong>{items.length}</strong>
                <span>Mặt hàng</span>
              </article>
              <article>
                <i>♙</i>
                <strong>{suppliers.length}</strong>
                <span>Nhà cung cấp</span>
              </article>
              <article className="good">
                <i>✓</i>
                <div>
                  <strong>Giá tốt nhất</strong>
                  <span>Tự động xác định theo giá thấp nhất</span>
                </div>
              </article>
              <article className="total">
                <span>Giá trị dự kiến</span>
                <strong>{fmt(estimated)} ₫</strong>
              </article>
            </div>
            <div className="toolbar">
              <label>
                ⌕
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Tìm mã hàng, phân loại, tên vật tư..."
                />
              </label>
              <p>
                <span>↔ Kéo tiêu đề để đổi cột</span>
                <span>▾ Bấm để lọc nhiều giá trị</span>
              </p>
            </div>
            {poSelections.length > 0 && (
              <div className="po-selection-bar">
                <span>
                  ✓ Đã chọn <b>{poSelections.length}</b> mặt hàng của{" "}
                  <b>{best(poSelections[0])?.supplier.name}</b>
                </span>
                <button onClick={() => setPoSelections([])}>Bỏ chọn</button>
              </div>
            )}
            <AdvancedItemsTable
              items={items}
              visibleItems={filtered}
              order={compareOrder}
              setOrder={setCompareOrder}
              filters={compareFilters}
              setFilters={setCompareFilters}
              sort={compareSort}
              setSort={setCompareSort}
              filterOpen={compareFilterOpen}
              setFilterOpen={setCompareFilterOpen}
              suppliers={comparisonSuppliers}
              onRemoveSupplier={(id) =>
                setQuoteSupplierIds((ids) => ids.filter((x) => x !== id))
              }
              quotes={quotes}
              itemChange={itemChange}
              quoteChange={quoteChange}
              best={best}
              poSelections={poSelections}
              togglePOItem={togglePOItem}
            />
            <small className="hint">
              Tích chọn một hoặc nhiều mặt hàng cùng nhà cung cấp để tạo PO. Nếu
              chọn mặt hàng thuộc NCC khác, hệ thống sẽ bắt đầu nhóm mới.
            </small>
          </section>
        )}
      </main>
      {supplierModal && (
        <div className="backdrop" onMouseDown={() => setSupplierModal(false)}>
          <div
            className="modal supplier-modal"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <i>＋</i>
            <h2>Thêm nhà cung cấp</h2>
            <p>Nhập thông tin nhà cung cấp để dùng chung cho báo giá và PO.</p>
            <div className="supplier-modal-grid">
              <label>
                Mã nhà cung cấp <b>*</b>
                <input
                  autoFocus
                  value={newSupplier.code}
                  onChange={(e) => supplierField("code", e.target.value)}
                  placeholder="NCC-001"
                />
              </label>
              <label>
                Tên nhà cung cấp <b>*</b>
                <input
                  value={newSupplier.name}
                  onChange={(e) => supplierField("name", e.target.value)}
                  placeholder="Ví dụ: Công ty An Phát"
                />
              </label>
              <label>
                Số tài khoản
                <input
                  value={newSupplier.bankAccount}
                  onChange={(e) => supplierField("bankAccount", e.target.value)}
                  placeholder="Nhập số tài khoản"
                />
              </label>
              <label>
                Ngân hàng
                <input
                  value={newSupplier.bank}
                  onChange={(e) => supplierField("bank", e.target.value)}
                  placeholder="Tên ngân hàng, chi nhánh"
                />
              </label>
              <label>
                Người liên hệ
                <input
                  value={newSupplier.contact}
                  onChange={(e) => supplierField("contact", e.target.value)}
                  placeholder="Họ và tên"
                />
              </label>
              <label>
                Điện thoại
                <input
                  value={newSupplier.phone}
                  onChange={(e) => supplierField("phone", e.target.value)}
                  placeholder="Số điện thoại"
                />
              </label>
              <label className="full">
                Địa chỉ
                <input
                  value={newSupplier.address}
                  onChange={(e) => supplierField("address", e.target.value)}
                  placeholder="Địa chỉ nhà cung cấp"
                />
              </label>
            </div>
            <div>
              <button className="ghost" onClick={() => setSupplierModal(false)}>
                Hủy
              </button>
              <button
                className="primary"
                disabled={!newSupplier.name.trim() || !newSupplier.code.trim()}
                onClick={addSupplier}
              >
                Lưu nhà cung cấp
              </button>
            </div>
          </div>
        </div>
      )}
      {supplierPicker && (
        <div className="backdrop" onMouseDown={() => setSupplierPicker(false)}>
          <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
            <i>▱</i>
            <h2>Chọn nhà cung cấp</h2>
            <p>
              Chọn nhà cung cấp từ danh mục dùng chung để thêm cột Giá và Ghi
              chú.
            </p>
            {availableSuppliers.length ? (
              <label>
                Nhà cung cấp
                <select
                  autoFocus
                  value={selectedSupplierId}
                  onChange={(e) => setSelectedSupplierId(e.target.value)}
                >
                  <option value="">— Chọn nhà cung cấp —</option>
                  {availableSuppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.code} · {s.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <div className="empty-suppliers">
                Tất cả nhà cung cấp trong danh mục đã được thêm vào bảng.
              </div>
            )}
            <div>
              <button
                className="ghost"
                onClick={() => setSupplierPicker(false)}
              >
                Hủy
              </button>
              <button
                className="primary"
                disabled={!selectedSupplierId}
                onClick={addQuoteSupplier}
              >
                Thêm vào bảng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AdvancedItemsTable({
  items,
  visibleItems,
  order,
  setOrder,
  filters,
  setFilters,
  sort,
  setSort,
  filterOpen,
  setFilterOpen,
  suppliers,
  onRemoveSupplier,
  quotes,
  itemChange,
  quoteChange,
  best,
  poSelections,
  togglePOItem,
}: {
  items: Item[];
  visibleItems: Item[];
  order: ColumnKey[];
  setOrder: React.Dispatch<React.SetStateAction<ColumnKey[]>>;
  filters: Partial<Record<ColumnKey, string[]>>;
  setFilters: React.Dispatch<
    React.SetStateAction<Partial<Record<ColumnKey, string[]>>>
  >;
  sort: SortState;
  setSort: React.Dispatch<React.SetStateAction<SortState>>;
  filterOpen: ColumnKey | null;
  setFilterOpen: React.Dispatch<React.SetStateAction<ColumnKey | null>>;
  suppliers: Supplier[];
  onRemoveSupplier: (id: number) => void;
  quotes: Quote;
  itemChange: (id: number, k: keyof Item, v: string) => void;
  quoteChange: (
    iid: number,
    sid: number,
    k: "price" | "note",
    v: string,
  ) => void;
  best: (id: number) => { supplier: Supplier; price: number } | null;
  poSelections: number[];
  togglePOItem: (id: number) => void;
}) {
  const [dragged, setDragged] = useState<ColumnKey | null>(null);
  const setSuppliers = (updater: React.SetStateAction<Supplier[]>) => {
    const next = typeof updater === "function" ? updater(suppliers) : updater;
    const removed = suppliers.find((s) => !next.some((n) => n.id === s.id));
    if (removed) onRemoveSupplier(removed.id);
  };
  const toggleSort = (key: ColumnKey) =>
    setSort((s) =>
      s?.key === key
        ? { key, direction: s.direction === "asc" ? "desc" : "asc" }
        : { key, direction: "asc" },
    );
  const toggleFilter = (key: ColumnKey, value: string) =>
    setFilters((f) => {
      const current = f[key] || [],
        next = current.includes(value)
          ? current.filter((v) => v !== value)
          : [...current, value];
      return { ...f, [key]: next };
    });
  const cell = (item: Item, key: ColumnKey, row: number) => {
    if (key === "stt")
      return (
        <td className="center" key={key}>
          {row + 1}
        </td>
      );
    if (key === "amount")
      return (
        <td className="money" key={key}>
          {fmt(item.qty * item.estimate)}
        </td>
      );
    const inputKey = key as keyof Item;
    const numeric = key === "qty" || key === "estimate";
    return (
      <td key={key}>
        <input
          className={`${key === "name" || key === "desc" ? "wide" : ""} ${key === "unit" || key === "qty" ? "short" : ""} ${numeric ? "num" : ""} ${key === "category" ? "category-input" : ""}`}
          type={numeric ? "number" : "text"}
          value={String(item[inputKey])}
          onChange={(e) => itemChange(item.id, inputKey, e.target.value)}
          placeholder={key === "category" ? "Chọn nhóm..." : ""}
        />
      </td>
    );
  };
  return (
    <div className="tablewrap advanced-table">
      <table>
        <thead>
          <tr>
            <th rowSpan={2} className="po-check-head">
              Lên PO
            </th>
            {order.map((col) => {
              const meta = BASE_COLUMNS.find((c) => c.key === col)!;
              const values = [
                ...new Set(items.map((i, r) => String(valueOf(i, col, r)))),
              ].filter(Boolean);
              return (
                <th
                  rowSpan={2}
                  key={col}
                  draggable
                  onDragStart={() => setDragged(col)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (dragged) setOrder((o) => reorder(o, dragged, col));
                    setDragged(null);
                  }}
                  className={`draggable-head ${dragged === col ? "dragging" : ""}`}
                >
                  <div className="head-label">
                    <button onClick={() => toggleSort(col)}>
                      {meta.label}{" "}
                      <small>
                        {sort?.key === col
                          ? sort.direction === "asc"
                            ? "↑"
                            : "↓"
                          : ""}
                      </small>
                    </button>
                    <button
                      className={
                        filters[col]?.length
                          ? "filter-trigger active"
                          : "filter-trigger"
                      }
                      onClick={() =>
                        setFilterOpen(filterOpen === col ? null : col)
                      }
                    >
                      ▾
                    </button>
                  </div>
                  {filterOpen === col && (
                    <div
                      className="filter-popover"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <strong>Lọc {meta.label}</strong>
                      <div className="filter-options">
                        {values.map((v) => (
                          <label key={v}>
                            <input
                              type="checkbox"
                              checked={filters[col]?.includes(v) || false}
                              onChange={() => toggleFilter(col, v)}
                            />
                            <span>{v}</span>
                          </label>
                        ))}
                      </div>
                      <div className="filter-actions">
                        <button
                          onClick={() =>
                            setFilters((f) => ({ ...f, [col]: [] }))
                          }
                        >
                          Xóa lọc
                        </button>
                        <button onClick={() => setFilterOpen(null)}>
                          Xong
                        </button>
                      </div>
                    </div>
                  )}
                </th>
              );
            })}
            {suppliers.map((s) => (
              <th colSpan={2} className="suphead" key={s.id}>
                {s.name}
                <button
                  onClick={() =>
                    setSuppliers((x) => x.filter((v) => v.id !== s.id))
                  }
                >
                  ×
                </button>
              </th>
            ))}
            <th colSpan={2} className="choice">
              Lựa chọn tự động
            </th>
          </tr>
          <tr>
            {suppliers.flatMap((s) => [
              <th key={s.id + "p"}>Giá</th>,
              <th key={s.id + "n"}>Ghi chú</th>,
            ])}
            <th>Giá tốt nhất</th>
            <th>Nhà cung cấp</th>
          </tr>
        </thead>
        <tbody>
          {visibleItems.map((i, r) => {
            const win = best(i.id);
            return (
              <tr
                key={i.id}
                className={poSelections.includes(i.id) ? "po-row-selected" : ""}
              >
                <td className="po-check">
                  <input
                    type="checkbox"
                    checked={poSelections.includes(i.id)}
                    disabled={!win}
                    onChange={() => togglePOItem(i.id)}
                  />
                </td>
                {order.map((key) => cell(i, key, r))}
                {suppliers.flatMap((s) => {
                  const q = quotes[i.id]?.[s.id] || { price: "", note: "" },
                    low = win?.supplier.id === s.id;
                  return [
                    <td className={low ? "low" : ""} key={s.id + "p"}>
                      <div className="qprice">
                        {low && <b>✓</b>}
                        <input
                          className="num"
                          type="number"
                          placeholder="Nhập giá"
                          value={q.price}
                          onChange={(e) =>
                            quoteChange(i.id, s.id, "price", e.target.value)
                          }
                        />
                      </div>
                    </td>,
                    <td key={s.id + "n"}>
                      <input
                        placeholder="Ghi chú"
                        value={q.note}
                        onChange={(e) =>
                          quoteChange(i.id, s.id, "note", e.target.value)
                        }
                      />
                    </td>,
                  ];
                })}
                <td className="best">{win ? fmt(win.price) + " ₫" : "—"}</td>
                <td>
                  <span className={win ? "badge" : "empty"}>
                    {win?.supplier.name || "Chưa có giá"}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td></td>
            <td colSpan={order.length}>
              TỔNG: {visibleItems.length} mặt hàng ·{" "}
              {fmt(visibleItems.reduce((s, i) => s + i.qty * i.estimate, 0))} ₫
            </td>
            {suppliers.flatMap((s) => [
              <td className="money" key={s.id + "t"}>
                {fmt(
                  visibleItems.reduce(
                    (a, i) =>
                      a + (Number(quotes[i.id]?.[s.id]?.price) || 0) * i.qty,
                    0,
                  ),
                )}{" "}
                ₫
              </td>,
              <td key={s.id + "x"}></td>,
            ])}
            <td colSpan={2}></td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function DraftItemsTable({
  items,
  visibleItems,
  order,
  setOrder,
  filters,
  setFilters,
  sort,
  setSort,
  filterOpen,
  setFilterOpen,
  itemChange,
  setDraft,
}: {
  items: Item[];
  visibleItems: Item[];
  order: ColumnKey[];
  setOrder: React.Dispatch<React.SetStateAction<ColumnKey[]>>;
  filters: Partial<Record<ColumnKey, string[]>>;
  setFilters: React.Dispatch<
    React.SetStateAction<Partial<Record<ColumnKey, string[]>>>
  >;
  sort: SortState;
  setSort: React.Dispatch<React.SetStateAction<SortState>>;
  filterOpen: ColumnKey | null;
  setFilterOpen: React.Dispatch<React.SetStateAction<ColumnKey | null>>;
  itemChange: (
    id: number,
    k: keyof Item,
    v: string,
    forDraft?: boolean,
  ) => void;
  setDraft: React.Dispatch<
    React.SetStateAction<{
      number: string;
      date: string;
      department: string;
      purpose: string;
      items: Item[];
    }>
  >;
}) {
  const [dragged, setDragged] = useState<ColumnKey | null>(null);
  const toggleSort = (key: ColumnKey) =>
    setSort((s) =>
      s?.key === key
        ? { key, direction: s.direction === "asc" ? "desc" : "asc" }
        : { key, direction: "asc" },
    );
  const toggleFilter = (key: ColumnKey, value: string) =>
    setFilters((f) => {
      const current = f[key] || [],
        next = current.includes(value)
          ? current.filter((v) => v !== value)
          : [...current, value];
      return { ...f, [key]: next };
    });
  const cell = (item: Item, key: ColumnKey, row: number) => {
    if (key === "stt")
      return (
        <td className="center" key={key}>
          {row + 1}
        </td>
      );
    if (key === "amount")
      return (
        <td className="money" key={key}>
          {fmt(item.qty * item.estimate)}
        </td>
      );
    const inputKey = key as keyof Item,
      numeric = key === "qty" || key === "estimate";
    return (
      <td key={key}>
        <input
          className={`${key === "name" || key === "desc" ? "wide" : ""} ${key === "unit" || key === "qty" ? "short" : ""} ${numeric ? "num" : ""} ${key === "category" ? "category-input" : ""}`}
          type={numeric ? "number" : "text"}
          value={String(item[inputKey])}
          onChange={(e) => itemChange(item.id, inputKey, e.target.value, true)}
          placeholder={key === "category" ? "Ví dụ: Cơ khí" : ""}
        />
      </td>
    );
  };
  return (
    <div className="draft-table advanced-draft">
      <table>
        <thead>
          <tr>
            {order.map((col) => {
              const meta = BASE_COLUMNS.find((c) => c.key === col)!;
              const values = [
                ...new Set(items.map((i, r) => String(valueOf(i, col, r)))),
              ].filter(Boolean);
              return (
                <th
                  key={col}
                  draggable
                  onDragStart={() => setDragged(col)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (dragged) setOrder((o) => reorder(o, dragged, col));
                    setDragged(null);
                  }}
                  className="draggable-head"
                >
                  <div className="head-label">
                    <button onClick={() => toggleSort(col)}>
                      {meta.label}{" "}
                      <small>
                        {sort?.key === col
                          ? sort.direction === "asc"
                            ? "↑"
                            : "↓"
                          : ""}
                      </small>
                    </button>
                    <button
                      className={
                        filters[col]?.length
                          ? "filter-trigger active"
                          : "filter-trigger"
                      }
                      onClick={() =>
                        setFilterOpen(filterOpen === col ? null : col)
                      }
                    >
                      ▾
                    </button>
                  </div>
                  {filterOpen === col && (
                    <div className="filter-popover">
                      <strong>Lọc {meta.label}</strong>
                      <div className="filter-options">
                        {values.map((v) => (
                          <label key={v}>
                            <input
                              type="checkbox"
                              checked={filters[col]?.includes(v) || false}
                              onChange={() => toggleFilter(col, v)}
                            />
                            <span>{v}</span>
                          </label>
                        ))}
                      </div>
                      <div className="filter-actions">
                        <button
                          onClick={() =>
                            setFilters((f) => ({ ...f, [col]: [] }))
                          }
                        >
                          Xóa lọc
                        </button>
                        <button onClick={() => setFilterOpen(null)}>
                          Xong
                        </button>
                      </div>
                    </div>
                  )}
                </th>
              );
            })}
            <th></th>
          </tr>
        </thead>
        <tbody>
          {visibleItems.map((i, r) => (
            <tr key={i.id}>
              {order.map((key) => cell(i, key, r))}
              <td>
                <button
                  className="delete-row"
                  onClick={() =>
                    setDraft((d) => ({
                      ...d,
                      items: d.items.filter((x) => x.id !== i.id),
                    }))
                  }
                >
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={order.length}>
              TỔNG: {visibleItems.length} mặt hàng ·{" "}
              {fmt(visibleItems.reduce((s, i) => s + i.qty * i.estimate, 0))} ₫
            </td>
            <td></td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function ProductCatalog({
  products,
  setProducts,
  pos,
  suppliers,
  onCreatePR,
}: {
  products: Item[];
  setProducts: React.Dispatch<React.SetStateAction<Item[]>>;
  pos: PO[];
  suppliers: Supplier[];
  onCreatePR: () => void;
}) {
  const [query, setQuery] = useState(""),
    [category, setCategory] = useState("Tất cả"),
    [expanded, setExpanded] = useState<number | null>(products[0]?.id || null);
  const categories = [
      "Tất cả",
      ...new Set(products.map((p) => p.category).filter(Boolean)),
    ],
    shown = products.filter(
      (p) =>
        (category === "Tất cả" || p.category === category) &&
        (p.code + p.name + p.spec).toLowerCase().includes(query.toLowerCase()),
    );
  const history = (product: Item) =>
    pos
      .flatMap((po) =>
        po.items
          .filter((i) => i.code === product.code)
          .map((i) => ({
            date: po.createdDate,
            po: po.number,
            supplier:
              suppliers.find((s) => s.id === po.supplierId)?.name || "—",
            qty: i.qty,
            price: i.price,
          })),
      )
      .sort((a, b) => b.date.localeCompare(a.date));
  return (
    <section className="content product-page">
      <div className="heading">
        <div>
          <em>DANH MỤC DÙNG CHUNG · LỊCH SỬ MUA</em>
          <h1>Danh sách hàng hóa</h1>
          <p>Tra cứu thông tin vật tư và giá mua theo nhà cung cấp, PO.</p>
        </div>
        <div className="actions">
          <button
            className="ghost"
            onClick={() =>
              setProducts((p) => [
                ...p,
                { ...emptyItem(p.length), category: "Hàng hóa mới" },
              ])
            }
          >
            ＋ Thêm hàng hóa
          </button>
          <button className="primary" onClick={onCreatePR}>
            Tạo PR từ danh mục
          </button>
        </div>
      </div>
      <div className="product-kpis">
        <article>
          <span>Tổng hàng hóa</span>
          <b>{products.length}</b>
          <small>{categories.length - 1} phân loại</small>
        </article>
        <article>
          <span>Đã phát sinh mua</span>
          <b>
            {
              products.filter((p) =>
                pos.some((po) => po.items.some((i) => i.code === p.code)),
              ).length
            }
          </b>
          <small>Có dữ liệu PO</small>
        </article>
        <article>
          <span>Tổng lượt mua</span>
          <b>{pos.reduce((n, p) => n + p.items.length, 0)}</b>
          <small>Lịch sử theo PO</small>
        </article>
        <article>
          <span>Giá gần nhất</span>
          <b>
            {fmt(
              products.reduce((n, p) => n + p.estimate, 0) /
                Math.max(1, products.length),
            )}{" "}
            ₫
          </b>
          <small>Bình quân danh mục</small>
        </article>
      </div>
      <div className="product-toolbar">
        <label>
          ⌕
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm mã, tên hàng hóa, quy cách..."
          />
        </label>
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          {categories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <span>{shown.length} hàng hóa</span>
      </div>
      <div className="product-table">
        <table>
          <thead>
            <tr>
              <th>Mã hàng</th>
              <th>Tên hàng hóa</th>
              <th>Phân loại</th>
              <th>Quy cách</th>
              <th>ĐVT</th>
              <th>Giá dự kiến</th>
              <th>Lần mua gần nhất</th>
              <th>Biến động giá</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {shown.map((p) => {
              const h = history(p),
                latest = h[0],
                previous = h[1],
                change = latest && previous
                  ? Math.round(
                      ((latest.price - previous.price) / previous.price) * 100,
                    )
                  : 0;
              return (
                <tbody key={p.id} className="product-group">
                  <tr>
                    <td>
                      <b className="product-code">{p.code}</b>
                    </td>
                    <td>
                      <strong>{p.name || "Hàng hóa mới"}</strong>
                      <small>{p.desc || "Chưa có mô tả kỹ thuật"}</small>
                    </td>
                    <td>
                      <span className="category-pill">
                        {p.category || "Chưa phân loại"}
                      </span>
                    </td>
                    <td>{p.spec || "—"}</td>
                    <td>{p.unit}</td>
                    <td className="money">{fmt(p.estimate)} ₫</td>
                    <td>
                      <b>{latest?.po || "Chưa phát sinh"}</b>
                      <small>
                        {latest
                          ? `${dateVN(latest.date)} · ${latest.supplier}`
                          : "Chưa có dữ liệu PO"}
                      </small>
                    </td>
                    <td>
                      <span className={change <= 0 ? "price-down" : "price-up"}>
                        {latest && previous
                          ? `${change <= 0 ? "↓" : "↑"} ${Math.abs(change)}%`
                          : "—"}
                      </span>
                    </td>
                    <td>
                      <button
                        className="history-btn"
                        onClick={() =>
                          setExpanded(expanded === p.id ? null : p.id)
                        }
                      >
                        {expanded === p.id ? "Thu gọn" : "Lịch sử giá"}
                      </button>
                    </td>
                  </tr>
                  {expanded === p.id && (
                    <tr className="history-row">
                      <td colSpan={9}>
                        <div className="price-history">
                          <div>
                            <h3>Lịch sử mua · {p.name}</h3>
                            <p>So sánh từng lần mua theo PO và nhà cung cấp</p>
                          </div>
                          <table>
                            <thead>
                              <tr>
                                <th>Ngày mua</th>
                                <th>Số PO</th>
                                <th>Nhà cung cấp</th>
                                <th>Số lượng</th>
                                <th>Đơn giá</th>
                                <th>Thành tiền</th>
                              </tr>
                            </thead>
                            <tbody>
                              {!h.length && (
                                <tr>
                                  <td colSpan={6}>Chưa có lịch sử mua hàng.</td>
                                </tr>
                              )}
                              {h.map((x, i) => (
                                <tr key={i}>
                                  <td>{dateVN(x.date)}</td>
                                  <td>
                                    <b>{x.po}</b>
                                  </td>
                                  <td>{x.supplier}</td>
                                  <td>
                                    {x.qty} {p.unit}
                                  </td>
                                  <td className="money">{fmt(x.price)} ₫</td>
                                  <td className="money">
                                    {fmt(x.qty * x.price)} ₫
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CreatePRCatalog({
  draft,
  setDraft,
  products,
  itemChange,
  fileRef,
  importExcel,
  message,
  onCancel,
  onSave,
}: {
  draft: {
    number: string;
    date: string;
    department: string;
    purpose: string;
    items: Item[];
  };
  setDraft: React.Dispatch<
    React.SetStateAction<{
      number: string;
      date: string;
      department: string;
      purpose: string;
      items: Item[];
    }>
  >;
  products: Item[];
  itemChange: (
    id: number,
    k: keyof Item,
    v: string,
    forDraft?: boolean,
  ) => void;
  fileRef: React.RefObject<HTMLInputElement | null>;
  importExcel: (e: ChangeEvent<HTMLInputElement>) => void;
  message: string;
  onCancel: () => void;
  onSave: () => void;
}) {
  const [selectedProduct, setSelectedProduct] = useState(""),
    [order, setOrder] = useState<ColumnKey[]>(BASE_COLUMNS.map((c) => c.key)),
    [filters, setFilters] = useState<Partial<Record<ColumnKey, string[]>>>({}),
    [sort, setSort] = useState<SortState>(null),
    [open, setOpen] = useState<ColumnKey | null>(null);
  const visible = useMemo(
      () => applyTools(draft.items, order, filters, sort),
      [draft.items, order, filters, sort],
    ),
    total = draft.items.reduce((s, i) => s + i.qty * i.estimate, 0);
  const addCatalogProduct = () => {
    const product = products.find((p) => p.id === Number(selectedProduct));
    if (!product) return;
    setDraft((d) => ({
      ...d,
      items: [...d.items, { ...product, id: Date.now(), qty: 1 }],
    }));
    setSelectedProduct("");
  };
  return (
    <section className="content create-page">
      <div className="heading">
        <div>
          <em>ĐỀ NGHỊ MUA HÀNG</em>
          <h1>Tạo PR mới</h1>
          <p>Chọn hàng từ danh mục hoặc tạo mới nếu chưa có.</p>
        </div>
        <div className="actions">
          <button className="ghost" onClick={onCancel}>
            Hủy
          </button>
          <button
            className="primary"
            onClick={onSave}
            disabled={
              !draft.number ||
              !draft.date ||
              !draft.department ||
              !draft.purpose
            }
          >
            Lưu PR
          </button>
        </div>
      </div>
      <div className="form-card">
        <div className="section-title">
          <span>1</span>
          <div>
            <h2>Thông tin PR</h2>
            <p>Các thông tin nhận diện và mục đích sử dụng</p>
          </div>
        </div>
        <div className="form-grid">
          <label>
            Số PR <b>*</b>
            <input
              value={draft.number}
              onChange={(e) =>
                setDraft((d) => ({ ...d, number: e.target.value }))
              }
            />
          </label>
          <label>
            Ngày PR <b>*</b>
            <input
              type="date"
              value={draft.date}
              onChange={(e) =>
                setDraft((d) => ({ ...d, date: e.target.value }))
              }
            />
          </label>
          <label>
            Đơn vị <b>*</b>
            <input
              placeholder="Ví dụ: Phòng Kỹ thuật"
              value={draft.department}
              onChange={(e) =>
                setDraft((d) => ({ ...d, department: e.target.value }))
              }
            />
          </label>
          <label className="purpose-input">
            Mục đích sử dụng <b>*</b>
            <textarea
              rows={3}
              value={draft.purpose}
              onChange={(e) =>
                setDraft((d) => ({ ...d, purpose: e.target.value }))
              }
            />
          </label>
        </div>
      </div>
      <div className="form-card items-card">
        <div className="items-heading">
          <div className="section-title">
            <span>2</span>
            <div>
              <h2>Danh sách hàng hóa</h2>
              <p>Chọn sản phẩm có sẵn hoặc nhập mới trực tiếp vào bảng</p>
            </div>
          </div>
          <div className="excel-actions">
            <a
              className="ghost download"
              href="/mau-nhap-danh-sach-hang-hoa-pr.xlsx"
              download
            >
              ⇩ Tải Excel mẫu
            </a>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              hidden
              onChange={importExcel}
            />
            <button
              className="excel-upload"
              onClick={() => fileRef.current?.click()}
            >
              ⇧ Nhập Excel
            </button>
          </div>
        </div>
        <div className="catalog-picker">
          <div>
            <label>
              Chọn từ danh mục
              <select
                value={selectedProduct}
                onChange={(e) => setSelectedProduct(e.target.value)}
              >
                <option value="">— Tìm và chọn hàng hóa —</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} · {p.name} · {p.spec}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="primary"
              disabled={!selectedProduct}
              onClick={addCatalogProduct}
            >
              Thêm vào PR
            </button>
          </div>
          <span>hoặc</span>
          <button
            className="new-product-btn"
            onClick={() =>
              setDraft((d) => ({
                ...d,
                items: [
                  ...d.items,
                  {
                    ...emptyItem(d.items.length),
                    code: `VT-${String(products.length + 1).padStart(3, "0")}`,
                  },
                ],
              }))
            }
          >
            ＋ Tạo hàng hóa mới
          </button>
          <small>Hàng hóa mới sẽ tự động lưu vào danh mục khi lưu PR.</small>
        </div>
        {message && (
          <div
            className={`import-message ${message.startsWith("Không") ? "error" : ""}`}
          >
            {message}
          </div>
        )}
        <DraftItemsTable
          items={draft.items}
          visibleItems={visible}
          order={order}
          setOrder={setOrder}
          filters={filters}
          setFilters={setFilters}
          sort={sort}
          setSort={setSort}
          filterOpen={open}
          setFilterOpen={setOpen}
          itemChange={itemChange}
          setDraft={setDraft}
        />
        <button
          className="add-row"
          onClick={() =>
            setDraft((d) => ({
              ...d,
              items: [...d.items, emptyItem(d.items.length)],
            }))
          }
        >
          ＋ Thêm dòng hàng hóa
        </button>
      </div>
      <div className="create-footer">
        <p>
          <b>{draft.items.filter((i) => i.code || i.name).length}</b> mặt hàng ·
          Tổng dự kiến <strong>{fmt(total)} ₫</strong>
        </p>
        <div>
          <button className="ghost" onClick={onCancel}>
            Hủy
          </button>
          <button className="primary" onClick={onSave}>
            Lưu PR
          </button>
        </div>
      </div>
    </section>
  );
}

function ContractManagement({
  pos,
  suppliers,
  onOpenPO,
}: {
  pos: PO[];
  suppliers: Supplier[];
  onOpenPO: (po: PO) => void;
}) {
  const [selectedId, setSelectedId] = useState(pos[0]?.id || 0),
    [tab, setTab] = useState<"timeline" | "documents" | "invoices">("timeline"),
    [query, setQuery] = useState("");
  const selected = pos.find((p) => p.id === selectedId) || pos[0];
  if (!selected)
    return (
      <section className="content">
        <h1>Quản lý hợp đồng</h1>
        <p>Chưa có PO để tạo hợp đồng.</p>
      </section>
    );
  const supplier = suppliers.find((s) => s.id === selected.supplierId),
    total = selected.items.reduce((n, i) => n + i.qty * i.price, 0),
    delivered = selected.items.reduce((n, i) => n + i.deliveredQty, 0),
    ordered = selected.items.reduce((n, i) => n + i.qty, 0),
    docsDone = selected.docs.filter((d) => d.status === "Đã đủ").length,
    paid = selected.payments
      .filter((p) => p.status === "Đã thanh toán")
      .reduce((n, p) => n + p.amount, 0);
  const shown = pos.filter((p) => {
    const s = suppliers.find((x) => x.id === p.supplierId);
    return (p.number + (s?.name || ""))
      .toLowerCase()
      .includes(query.toLowerCase());
  });
  const events = [
    {
      date: selected.createdDate,
      title: "Phát hành hợp đồng / PO",
      note: `${selected.number} được gửi tới ${supplier?.name}`,
      state: "done",
    },
    ...selected.payments.map((p) => ({
      date: p.date,
      title: `Thanh toán ${p.phase}`,
      note: `${fmt(p.amount)} ₫ · ${p.status}`,
      state: p.status === "Đã thanh toán" ? "done" : "upcoming",
    })),
    ...selected.items
      .filter((i) => i.deliveryDate)
      .map((i) => ({
        date: i.deliveryDate,
        title: `Giao ${i.name}`,
        note: `${i.deliveredQty}/${i.qty} ${i.unit} · ${i.deliveryStatus}`,
        state: i.deliveryStatus === "Đã giao" ? "done" : "warning",
      })),
    ...(selected.expectedDate
      ? [
          {
            date: selected.expectedDate,
            title: "Hạn hoàn tất giao hàng",
            note: `Còn ${Math.max(0, ordered - delivered)} đơn vị chưa giao`,
            state: "warning",
          },
        ]
      : []),
  ]
    .filter((event) => event.date)
    .sort((a, b) => a.date.localeCompare(b.date));
  return (
    <section className="content contract-page">
      <div className="heading">
        <div>
          <em>LIÊN THÔNG PO · HỒ SƠ · THANH TOÁN</em>
          <h1>Quản lý hợp đồng</h1>
          <p>Theo dõi nghĩa vụ giao hàng, hóa đơn và hồ sơ theo từng PO.</p>
        </div>
        <button className="primary">＋ Tạo hợp đồng từ PO</button>
      </div>
      <div className="contract-kpis">
        <article>
          <span>Tổng hợp đồng</span>
          <b>{pos.length}</b>
          <small>
            {pos.filter((p) => p.status !== "Hoàn thành").length} đang thực hiện
          </small>
        </article>
        <article>
          <span>Tổng giá trị</span>
          <b>
            {fmt(
              pos.reduce(
                (n, p) => n + p.items.reduce((s, i) => s + i.qty * i.price, 0),
                0,
              ),
            )}{" "}
            ₫
          </b>
          <small>Liên thông từ PO</small>
        </article>
        <article className="warn">
          <span>Sắp đến hạn giao</span>
          <b>{pos.filter((p) => p.expectedDate).length}</b>
          <small>Trong 7 ngày tới</small>
        </article>
        <article className="danger">
          <span>Hồ sơ còn thiếu</span>
          <b>
            {pos.reduce(
              (n, p) => n + p.docs.filter((d) => d.status !== "Đã đủ").length,
              0,
            )}
          </b>
          <small>Cần bổ sung trước thanh toán</small>
        </article>
      </div>
      <div className="contract-layout">
        <aside className="contract-list">
          <div className="contract-search">
            ⌕
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm hợp đồng, PO, NCC..."
            />
          </div>
          {shown.map((po) => {
            const s = suppliers.find((x) => x.id === po.supplierId),
              value = po.items.reduce((n, x) => n + x.qty * x.price, 0);
            return (
              <button
                className={po.id === selected.id ? "selected" : ""}
                key={po.id}
                onClick={() => setSelectedId(po.id)}
              >
                <div>
                  <strong>HĐ-{po.number}</strong>
                  <i>{po.status}</i>
                </div>
                <b>{s?.name}</b>
                <span>Liên kết {po.number}</span>
                <footer>
                  <small>{dateVN(po.createdDate)}</small>
                  <strong>{fmt(value)} ₫</strong>
                </footer>
              </button>
            );
          })}
        </aside>
        <div className="contract-detail">
          <div className="contract-hero">
            <div>
              <span>HĐ-{selected.number}</span>
              <h2>Hợp đồng cung cấp hàng hóa</h2>
              <p>
                {supplier?.code} · {supplier?.name}
              </p>
            </div>
            <div>
              <button onClick={() => onOpenPO(selected)}>
                Mở PO liên kết ↗
              </button>
              <strong>{fmt(total)} ₫</strong>
              <small>
                {selected.expectedDate
                  ? `Hạn giao ${dateVN(selected.expectedDate)}`
                  : "Chưa thiết lập hạn giao"}
              </small>
            </div>
          </div>
          {selected.expectedDate && <div className="deadline-alert">
            <i>!</i>
            <div>
              <b>Sắp đến hạn giao hàng</b>
              <p>
                Hạn giao dự kiến {dateVN(selected.expectedDate)} · Còn{" "}
                {Math.max(0, ordered - delivered)} đơn vị chưa giao. Cần xác
                nhận tiến độ với nhà cung cấp.
              </p>
            </div>
            <button onClick={() => onOpenPO(selected)}>
              Cập nhật giao hàng
            </button>
          </div>}
          <div className="contract-progress">
            <article>
              <span>Giao hàng</span>
              <b>{ordered ? Math.round((delivered / ordered) * 100) : 0}%</b>
              <div>
                <i
                  style={{
                    width: `${ordered ? (delivered / ordered) * 100 : 0}%`,
                  }}
                />
              </div>
              <small>
                {delivered}/{ordered} đơn vị đã giao
              </small>
            </article>
            <article>
              <span>Hồ sơ</span>
              <b>
                {selected.docs.length
                  ? Math.round((docsDone / selected.docs.length) * 100)
                  : 0}
                %
              </b>
              <div>
                <i
                  style={{
                    width: `${selected.docs.length ? (docsDone / selected.docs.length) * 100 : 0}%`,
                  }}
                />
              </div>
              <small>
                {docsDone}/{selected.docs.length} hồ sơ đầy đủ
              </small>
            </article>
            <article>
              <span>Thanh toán</span>
              <b>{total ? Math.round((paid / total) * 100) : 0}%</b>
              <div>
                <i style={{ width: `${total ? (paid / total) * 100 : 0}%` }} />
              </div>
              <small>
                {fmt(paid)} / {fmt(total)} ₫
              </small>
            </article>
          </div>
          <div className="contract-tabs">
            <button
              className={tab === "timeline" ? "active" : ""}
              onClick={() => setTab("timeline")}
            >
              Timeline
            </button>
            <button
              className={tab === "documents" ? "active" : ""}
              onClick={() => setTab("documents")}
            >
              Hồ sơ ({selected.docs.length})
            </button>
            <button
              className={tab === "invoices" ? "active" : ""}
              onClick={() => setTab("invoices")}
            >
              Hóa đơn
            </button>
          </div>
          {tab === "timeline" && (
            <div className="contract-timeline">
              {events.map((e, i) => (
                <article key={i} className={e.state}>
                  <time>{dateVN(e.date)}</time>
                  <i />
                  <div>
                    <b>{e.title}</b>
                    <p>{e.note}</p>
                  </div>
                </article>
              ))}
            </div>
          )}
          {tab === "documents" && (
            <div className="contract-docs">
              {selected.docs.map((d) => (
                <article key={d.id}>
                  <i className={d.status === "Đã đủ" ? "ok" : "missing"}>
                    {d.status === "Đã đủ" ? "✓" : "!"}
                  </i>
                  <div>
                    <b>{d.name}</b>
                    <p>{d.note || "Không có ghi chú"}</p>
                  </div>
                  <span className={d.status === "Đã đủ" ? "ok" : "missing"}>
                    {d.status}
                  </span>
                  <small>
                    {d.status !== "Đã đủ" ? "Chưa hoàn thiện" : "Đã kiểm tra"}
                  </small>
                </article>
              ))}
            </div>
          )}
          {tab === "invoices" && (
            <div className="invoice-table empty-state">
              Chưa có dữ liệu hóa đơn. Hóa đơn sẽ hiển thị sau khi được cập
              nhật vào PO.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function Dashboard({
  prs,
  pos,
  suppliers,
  onPR,
  onPO,
  onCompare,
}: {
  prs: PR[];
  pos: PO[];
  suppliers: Supplier[];
  onPR: () => void;
  onPO: () => void;
  onCompare: () => void;
}) {
  const poValue = pos.reduce(
      (n, p) => n + p.items.reduce((s, i) => s + i.qty * i.price, 0),
      0,
    ),
    missingDocs = pos.reduce(
      (n, p) => n + p.docs.filter((d) => d.status !== "Đã đủ").length,
      0,
    ),
    pendingPayments = pos.reduce(
      (n, p) =>
        n + p.payments.filter((x) => x.status !== "Đã thanh toán").length,
      0,
    ),
    completed =
      prs.filter((p) => p.status === "Hoàn thành").length +
      pos.filter((p) => p.status === "Hoàn thành").length,
    doing =
      prs.filter((p) => p.status !== "Hoàn thành").length +
      pos.filter((p) => p.status !== "Hoàn thành").length,
    attention = missingDocs + pendingPayments,
    progressTotal = completed + doing + attention,
    progressPercent = progressTotal
      ? Math.round((completed / progressTotal) * 100)
      : 0;
  const work = [
    {
      tone: "blue",
      icon: "▣",
      title: `${prs.filter((p) => p.status !== "Hoàn thành").length} PR đang xử lý`,
      text: "Kiểm tra yêu cầu và hoàn thiện báo giá",
      action: onPR,
      label: "Xem danh sách PR",
    },
    {
      tone: "orange",
      icon: "▰",
      title: `${pos.reduce((n, p) => n + p.items.filter((i) => i.deliveryStatus !== "Đã giao").length, 0)} mặt hàng chưa giao đủ`,
      text: "Cập nhật tiến độ giao hàng theo PO",
      action: onPO,
      label: "Theo dõi giao hàng",
    },
    {
      tone: "red",
      icon: "▧",
      title: `${missingDocs} hồ sơ còn thiếu`,
      text: "Hóa đơn, biên bản và hồ sơ thanh toán",
      action: onPO,
      label: "Kiểm tra hồ sơ",
    },
  ];
  return (
    <section className="content dashboard-page">
      <div className="dashboard-welcome">
        <div>
          <em>TỔNG QUAN MUA HÀNG</em>
          <h1>Tổng quan hoạt động mua hàng</h1>
          <p>
            Theo dõi toàn bộ tiến độ PR, báo giá, PO và thanh toán tại một nơi.
          </p>
        </div>
        <button className="primary" onClick={onPR}>
          ＋ Tạo PR mới
        </button>
      </div>
      <div className="dashboard-kpis">
        <button onClick={onPR}>
          <i className="blue">▣</i>
          <span>
            Yêu cầu mua hàng<strong>{prs.length}</strong>
            <small>
              {prs.filter((p) => p.status === "Chờ xử lý").length} PR chờ xử lý
            </small>
          </span>
        </button>
        <button onClick={onCompare}>
          <i className="purple">⚖</i>
          <span>
            Đang so sánh giá
            <strong>
              {prs.filter((p) => p.status.includes("báo giá")).length}
            </strong>
            <small>Cần hoàn tất lựa chọn NCC</small>
          </span>
        </button>
        <button onClick={onPO}>
          <i className="green">▰</i>
          <span>
            Đơn mua hàng<strong>{pos.length}</strong>
            <small>
              {pos.filter((p) => p.status.includes("giao")).length} PO đang giao
            </small>
          </span>
        </button>
        <button onClick={onPO}>
          <i className="orange">₫</i>
          <span>
            Giá trị PO<strong>{fmt(poValue)} ₫</strong>
            <small>{pendingPayments} đợt chờ thanh toán</small>
          </span>
        </button>
      </div>
      <div className="dashboard-grid">
        <section className="dashboard-panel priority-panel">
          <div className="panel-title">
            <div>
              <h2>Công việc cần ưu tiên</h2>
              <p>Các hạng mục cần xử lý trong hôm nay</p>
            </div>
            <span>{work.length} việc</span>
          </div>
          <div className="priority-list">
            {work.map((w) => (
              <article key={w.title}>
                <i className={w.tone}>{w.icon}</i>
                <div>
                  <b>{w.title}</b>
                  <p>{w.text}</p>
                </div>
                <button onClick={w.action}>{w.label} →</button>
              </article>
            ))}
          </div>
        </section>
        <section className="dashboard-panel progress-panel">
          <div className="panel-title">
            <div>
              <h2>Tiến độ mua hàng</h2>
              <p>Tổng hợp theo trạng thái hiện tại</p>
            </div>
          </div>
          <div className="donut">
            <div style={{background:`conic-gradient(#168446 0 ${progressPercent}%,#f0b54a ${progressPercent}% ${Math.min(100,progressPercent+(doing/progressTotal||0)*100)}%,#e8edf3 0)`}}>
              <strong>{progressPercent}%</strong>
              <span>Đúng tiến độ</span>
            </div>
          </div>
          <ul>
            <li>
              <i className="done" />
              <span>Đã hoàn thành</span>
              <b>{completed}</b>
            </li>
            <li>
              <i className="doing" />
              <span>Đang thực hiện</span>
              <b>{doing}</b>
            </li>
            <li>
              <i className="late" />
              <span>Cần chú ý</span>
              <b>{attention}</b>
            </li>
          </ul>
        </section>
      </div>
      <div className="dashboard-grid lower">
        <section className="dashboard-panel">
          <div className="panel-title">
            <div>
              <h2>PO gần đây</h2>
              <p>Tiến độ giao hàng và hồ sơ</p>
            </div>
            <button onClick={onPO}>Xem tất cả</button>
          </div>
          <div className="recent-po">
            {pos.map((po) => {
              const s = suppliers.find((x) => x.id === po.supplierId),
                done = po.items.filter(
                  (i) => i.deliveryStatus === "Đã giao",
                ).length;
              return (
                <article key={po.id} onClick={onPO}>
                  <div>
                    <b>{po.number}</b>
                    <span>{s?.name}</span>
                  </div>
                  <div>
                    <small>Giao hàng</small>
                    <span className="mini-progress">
                      <i
                        style={{ width: `${(done / po.items.length) * 100}%` }}
                      />
                    </span>
                    <b>
                      {done}/{po.items.length}
                    </b>
                  </div>
                  <i>{po.status}</i>
                </article>
              );
            })}
          </div>
        </section>
        <section className="dashboard-panel alert-panel">
          <div className="panel-title">
            <div>
              <h2>Cảnh báo nghiệp vụ</h2>
              <p>Các vấn đề cần kiểm tra</p>
            </div>
          </div>
          <div>
            <article>
              <i>!</i>
              <span>
                <b>{missingDocs} hồ sơ chưa đầy đủ</b>
                <small>Cần bổ sung trước thanh toán</small>
              </span>
            </article>
            <article>
              <i>₫</i>
              <span>
                <b>{pendingPayments} đợt thanh toán chờ xử lý</b>
                <small>Kiểm tra hạn và chứng từ</small>
              </span>
            </article>
            <article>
              <i>▱</i>
              <span>
                <b>
                  {suppliers.filter((s) => !s.bankAccount || !s.contact).length}{" "}
                  NCC thiếu thông tin
                </b>
                <small>Tài khoản hoặc người liên hệ</small>
              </span>
            </article>
          </div>
        </section>
      </div>
    </section>
  );
}

function AdminSettings({
  currentUser,
}: {
  currentUser: {
    id: string;
    username: string;
    displayName: string;
    role: string;
  };
}) {
  type UserRow = {
    id: string;
    username: string;
    displayName: string;
    role: string;
    active: number;
    createdAt: string;
  };
  const [users, setUsers] = useState<UserRow[]>([]),
    [message, setMessage] = useState(""),
    [form, setForm] = useState({
      username: "",
      displayName: "",
      password: "",
      role: "user",
    });
  const load = () =>
    fetch("/api/users")
      .then((r) => r.json())
      .then((b) => setUsers(b.users || []));
  useEffect(() => {
    load();
  }, []);
  const create = async () => {
    setMessage("");
    const response = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      }),
      body = await response.json();
    if (!response.ok) {
      setMessage(body.error || "Không thể tạo tài khoản");
      return;
    }
    setForm({ username: "", displayName: "", password: "", role: "user" });
    setMessage("Đã tạo tài khoản mới");
    load();
  };
  const toggle = async (user: UserRow) => {
    await fetch(`/api/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !user.active }),
    });
    load();
  };
  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    location.reload();
  };
  return (
    <section className="content admin-settings">
      <div className="heading">
        <div>
          <em>MASTER ADMIN</em>
          <h1>Cài đặt & người dùng</h1>
          <p>Tạo tài khoản, phân quyền và khóa quyền truy cập hệ thống.</p>
        </div>
        <button className="ghost" onClick={logout}>
          Đăng xuất
        </button>
      </div>
      <div className="admin-grid">
        <section className="admin-card create-user-card">
          <div className="section-heading">
            <div>
              <span>＋</span>
              <h2>Tạo tài khoản người dùng</h2>
            </div>
          </div>
          <div className="admin-form">
            <label>
              ID đăng nhập
              <input
                value={form.username}
                onChange={(e) =>
                  setForm((f) => ({ ...f, username: e.target.value }))
                }
                placeholder="Ví dụ: nguyenvana"
              />
            </label>
            <label>
              Tên người dùng
              <input
                value={form.displayName}
                onChange={(e) =>
                  setForm((f) => ({ ...f, displayName: e.target.value }))
                }
                placeholder="Nguyễn Văn A"
              />
            </label>
            <label>
              Mật khẩu ban đầu
              <input
                type="password"
                value={form.password}
                onChange={(e) =>
                  setForm((f) => ({ ...f, password: e.target.value }))
                }
                placeholder="Tối thiểu 8 ký tự"
              />
            </label>
            <label>
              Vai trò
              <select
                value={form.role}
                onChange={(e) =>
                  setForm((f) => ({ ...f, role: e.target.value }))
                }
              >
                <option value="user">Người dùng</option>
                <option value="admin">Admin</option>
              </select>
            </label>
            {message && (
              <div
                className={
                  message.startsWith("Đã")
                    ? "admin-message success"
                    : "admin-message"
                }
              >
                {message}
              </div>
            )}
            <button
              className="primary"
              disabled={
                !form.username || !form.displayName || form.password.length < 8
              }
              onClick={create}
            >
              Tạo tài khoản
            </button>
          </div>
        </section>
        <section className="admin-card master-card">
          <div className="section-heading">
            <div>
              <span>◆</span>
              <h2>Tài khoản đang đăng nhập</h2>
            </div>
          </div>
          <dl>
            <div>
              <dt>ID</dt>
              <dd>{currentUser.username}</dd>
            </div>
            <div>
              <dt>Tên</dt>
              <dd>{currentUser.displayName}</dd>
            </div>
            <div>
              <dt>Quyền</dt>
              <dd>
                <span>
                  {currentUser.role === "master" ? "Master Admin" : "Admin"}
                </span>
              </dd>
            </div>
            <div>
              <dt>Phiên đăng nhập</dt>
              <dd>12 giờ</dd>
            </div>
          </dl>
          <p>
            Mật khẩu được băm PBKDF2 trước khi lưu. Hệ thống không lưu mật khẩu
            dạng văn bản.
          </p>
        </section>
      </div>
      <section className="admin-card user-list-card">
        <div className="section-heading">
          <div>
            <span>♙</span>
            <h2>Danh sách tài khoản</h2>
          </div>
          <small>{users.length} tài khoản</small>
        </div>
        <div className="user-table">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Tên người dùng</th>
                <th>Vai trò</th>
                <th>Ngày tạo</th>
                <th>Trạng thái</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>
                    <b>{u.username}</b>
                  </td>
                  <td>{u.displayName}</td>
                  <td>
                    <span className={`role ${u.role}`}>
                      {u.role === "master"
                        ? "Master Admin"
                        : u.role === "admin"
                          ? "Admin"
                          : "Người dùng"}
                    </span>
                  </td>
                  <td>{dateVN(u.createdAt)}</td>
                  <td>
                    <span
                      className={u.active ? "account-active" : "account-locked"}
                    >
                      {u.active ? "Đang hoạt động" : "Đã khóa"}
                    </span>
                  </td>
                  <td>
                    {u.role !== "master" && u.id !== currentUser.id && (
                      <button onClick={() => toggle(u)}>
                        {u.active ? "Khóa" : "Mở khóa"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}

function SupplierManagement({
  suppliers,
  setSuppliers,
  onAdd,
}: {
  suppliers: Supplier[];
  setSuppliers: React.Dispatch<React.SetStateAction<Supplier[]>>;
  onAdd: () => void;
}) {
  const update = (id: number, key: keyof Supplier, value: string) =>
    setSuppliers((list) =>
      list.map((s) => (s.id === id ? { ...s, [key]: value } : s)),
    );
  return (
    <section className="content supplier-page">
      <div className="heading">
        <div>
          <em>DANH MỤC DÙNG CHUNG</em>
          <h1>Danh sách nhà cung cấp</h1>
          <p>
            Thông tin tại đây được đồng bộ sang PO và các nghiệp vụ mua hàng.
          </p>
        </div>
        <button className="primary" onClick={onAdd}>
          ＋ Thêm nhà cung cấp
        </button>
      </div>
      <div className="supplier-summary">
        <span>
          <b>{suppliers.length}</b> nhà cung cấp
        </span>
        <span>
          <b>{suppliers.filter((s) => s.bankAccount).length}</b> đã có tài khoản
        </span>
        <span>
          <b>{suppliers.filter((s) => s.contact).length}</b> đã có người liên hệ
        </span>
      </div>
      <div className="supplier-grid">
        {suppliers.map((s) => (
          <article key={s.id} className="supplier-card">
            <div className="supplier-card-head">
              <span>{s.code}</span>
              <strong>{s.name}</strong>
              <i>Đang hoạt động</i>
            </div>
            <div className="supplier-fields">
              <label>
                Mã nhà cung cấp
                <input
                  value={s.code}
                  onChange={(e) => update(s.id, "code", e.target.value)}
                />
              </label>
              <label>
                Tên nhà cung cấp
                <input
                  value={s.name}
                  onChange={(e) => update(s.id, "name", e.target.value)}
                />
              </label>
              <label>
                Số tài khoản
                <input
                  value={s.bankAccount}
                  onChange={(e) => update(s.id, "bankAccount", e.target.value)}
                />
              </label>
              <label>
                Ngân hàng
                <input
                  value={s.bank}
                  onChange={(e) => update(s.id, "bank", e.target.value)}
                />
              </label>
              <label className="full">
                Địa chỉ
                <input
                  value={s.address}
                  onChange={(e) => update(s.id, "address", e.target.value)}
                />
              </label>
              <label>
                Người liên hệ
                <input
                  value={s.contact}
                  onChange={(e) => update(s.id, "contact", e.target.value)}
                />
              </label>
              <label>
                Điện thoại
                <input
                  value={s.phone}
                  onChange={(e) => update(s.id, "phone", e.target.value)}
                />
              </label>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function POList({
  pos,
  suppliers,
  onOpen,
}: {
  pos: PO[];
  suppliers: Supplier[];
  onOpen: (po: PO) => void;
}) {
  const [q, setQ] = useState("");
  const shown = pos.filter((po) => {
    const s = suppliers.find((x) => x.id === po.supplierId);
    return (po.number + po.prNumber + (s?.name || ""))
      .toLowerCase()
      .includes(q.toLowerCase());
  });
  return (
    <section className="content po-list-page">
      <div className="heading">
        <div>
          <em>THEO DÕI ĐƠN MUA HÀNG</em>
          <h1>Quản lý PO</h1>
          <p>Kiểm soát giao hàng, hồ sơ và thanh toán theo từng đơn mua.</p>
        </div>
      </div>
      <div className="po-kpis">
        <article>
          <span>Tổng PO</span>
          <b>{pos.length}</b>
        </article>
        <article>
          <span>Đang giao hàng</span>
          <b>{pos.filter((p) => p.status.includes("giao")).length}</b>
        </article>
        <article>
          <span>Hồ sơ còn thiếu</span>
          <b>
            {pos.reduce(
              (n, p) => n + p.docs.filter((d) => d.status !== "Đã đủ").length,
              0,
            )}
          </b>
        </article>
        <article>
          <span>Chờ thanh toán</span>
          <b>
            {pos.reduce(
              (n, p) =>
                n +
                p.payments.filter((x) => x.status !== "Đã thanh toán").length,
              0,
            )}
          </b>
        </article>
      </div>
      <div className="po-list-panel">
        <div className="pr-toolbar">
          <label>
            ⌕
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Tìm số PO, PR hoặc nhà cung cấp..."
            />
          </label>
          <span>{shown.length} đơn mua hàng</span>
        </div>
        <div className="pr-table">
          <table>
            <thead>
              <tr>
                <th>Số PO</th>
                <th>PR nguồn</th>
                <th>Nhà cung cấp</th>
                <th>Ngày tạo</th>
                <th>Ngày dự kiến giao</th>
                <th>Giá trị PO</th>
                <th>Giao hàng</th>
                <th>Hồ sơ</th>
                <th>Thanh toán</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {shown.map((po) => {
                const s = suppliers.find((x) => x.id === po.supplierId),
                  delivered = po.items.filter(
                    (i) => i.deliveryStatus === "Đã giao",
                  ).length,
                  docs = po.docs.filter((d) => d.status === "Đã đủ").length,
                  paid = po.payments
                    .filter((p) => p.status === "Đã thanh toán")
                    .reduce((n, p) => n + p.amount, 0),
                  total = po.items.reduce((n, i) => n + i.qty * i.price, 0);
                return (
                  <tr key={po.id}>
                    <td>
                      <button className="pr-link" onClick={() => onOpen(po)}>
                        {po.number}
                      </button>
                    </td>
                    <td>{po.prNumber}</td>
                    <td>
                      <b>{s?.name}</b>
                      <small className="supplier-code">{s?.code}</small>
                    </td>
                    <td>{dateVN(po.createdDate)}</td>
                    <td>{dateVN(po.expectedDate)}</td>
                    <td className="money">{fmt(total)} ₫</td>
                    <td>
                      <span className="mini-progress">
                        <i
                          style={{
                            width: `${po.items.length ? (delivered / po.items.length) * 100 : 0}%`,
                          }}
                        />
                      </span>
                      <small>
                        {delivered}/{po.items.length} mặt hàng
                      </small>
                    </td>
                    <td>
                      <span
                        className={
                          docs === po.docs.length
                            ? "status done"
                            : "status waiting"
                        }
                      >
                        {docs}/{po.docs.length} đủ
                      </span>
                    </td>
                    <td>
                      <b>{total ? Math.round((paid / total) * 100) : 0}%</b>
                    </td>
                    <td>
                      <button className="row-action" onClick={() => onOpen(po)}>
                        Quản lý →
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function PODetail({
  po,
  suppliers,
  setSuppliers,
  onUpdate,
  onBack,
}: {
  po: PO;
  suppliers: Supplier[];
  setSuppliers: React.Dispatch<React.SetStateAction<Supplier[]>>;
  onUpdate: (po: PO) => void;
  onBack: () => void;
}) {
  const supplier = suppliers.find((s) => s.id === po.supplierId)!;
  const total = po.items.reduce((s, i) => s + i.qty * i.price, 0);
  const supplierUpdate = (key: keyof Supplier, value: string) =>
    setSuppliers((list) =>
      list.map((s) => (s.id === supplier.id ? { ...s, [key]: value } : s)),
    );
  const itemUpdate = (id: number, key: keyof POItem, value: string | number) =>
    onUpdate({
      ...po,
      items: po.items.map((i) => (i.id === id ? { ...i, [key]: value } : i)),
    });
  const events = [
    ...po.items
      .filter((i) => i.deliveryDate)
      .map((i) => ({
        date: i.deliveryDate,
        title: `Giao hàng: ${i.name}`,
        note: `${i.deliveredQty}/${i.qty} ${i.unit} · ${i.deliveryStatus}`,
        kind: "delivery",
      })),
    ...po.payments
      .filter((p) => p.date)
      .map((p) => ({
        date: p.date,
        title: `Thanh toán: ${p.phase}`,
        note: `${fmt(p.amount)} ₫ · ${p.status}`,
        kind: "payment",
      })),
  ].sort((a, b) => a.date.localeCompare(b.date));
  return (
    <section className="content po-detail">
      <div className="heading">
        <div>
          <button className="back-link" onClick={onBack}>
            ← Quản lý PO
          </button>
          <em>ĐƠN MUA HÀNG · {po.number}</em>
          <h1>{supplier?.name}</h1>
          <p>
            Từ {po.prNumber} · Tạo ngày {dateVN(po.createdDate)}
          </p>
        </div>
        <div className="po-total">
          <span>Giá trị PO</span>
          <b>{fmt(total)} ₫</b>
          <i>{po.status}</i>
        </div>
      </div>
      <div className="po-tabs">
        <a href="#supplier">Thông tin NCC</a>
        <a href="#delivery">Giao hàng</a>
        <a href="#documents">Hồ sơ</a>
        <a href="#payments">Thanh toán</a>
        <a href="#timeline">Timeline</a>
      </div>
      <section id="supplier" className="po-section">
        <div className="section-heading">
          <div>
            <span>▱</span>
            <h2>Thông tin nhà cung cấp</h2>
          </div>
          <small>Đồng bộ từ danh sách nhà cung cấp · {supplier.code}</small>
        </div>
        <div className="po-supplier-form">
          <label>
            Nhà cung cấp
            <select
              value={po.supplierId}
              onChange={(e) =>
                onUpdate({ ...po, supplierId: Number(e.target.value) })
              }
            >
              {suppliers.map((s) => (
                <option value={s.id} key={s.id}>
                  {s.code} · {s.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Số tài khoản
            <input
              value={supplier.bankAccount}
              onChange={(e) => supplierUpdate("bankAccount", e.target.value)}
            />
          </label>
          <label>
            Ngân hàng
            <input
              value={supplier.bank}
              onChange={(e) => supplierUpdate("bank", e.target.value)}
            />
          </label>
          <label>
            Người liên hệ
            <input
              value={supplier.contact}
              onChange={(e) => supplierUpdate("contact", e.target.value)}
            />
          </label>
          <label>
            Điện thoại
            <input
              value={supplier.phone}
              onChange={(e) => supplierUpdate("phone", e.target.value)}
            />
          </label>
          <label className="wide-field">
            Địa chỉ
            <input
              value={supplier.address}
              onChange={(e) => supplierUpdate("address", e.target.value)}
            />
          </label>
        </div>
      </section>
      <section id="delivery" className="po-section">
        <div className="section-heading">
          <div>
            <span>▰</span>
            <h2>Tiến độ giao hàng theo sản phẩm</h2>
          </div>
          <label>
            Ngày dự kiến giao chung
            <input
              type="date"
              value={po.expectedDate}
              onChange={(e) =>
                onUpdate({ ...po, expectedDate: e.target.value })
              }
            />
          </label>
        </div>
        <div className="delivery-table">
          <table>
            <thead>
              <tr>
                <th>Mã hàng</th>
                <th>Tên sản phẩm</th>
                <th>SL đặt</th>
                <th>Đã giao</th>
                <th>Trạng thái</th>
                <th>Ngày giao gần nhất</th>
                <th>Còn lại</th>
              </tr>
            </thead>
            <tbody>
              {po.items.map((i) => (
                <tr key={i.id}>
                  <td>{i.code}</td>
                  <td>
                    <b>{i.name}</b>
                    <small>{i.category}</small>
                  </td>
                  <td>
                    {i.qty} {i.unit}
                  </td>
                  <td>
                    <input
                      className="delivery-qty"
                      type="number"
                      min="0"
                      max={i.qty}
                      value={i.deliveredQty}
                      onChange={(e) =>
                        itemUpdate(i.id, "deliveredQty", Number(e.target.value))
                      }
                    />
                  </td>
                  <td>
                    <select
                      value={i.deliveryStatus}
                      onChange={(e) =>
                        itemUpdate(i.id, "deliveryStatus", e.target.value)
                      }
                    >
                      <option>Chưa giao</option>
                      <option>Giao một phần</option>
                      <option>Đã giao</option>
                    </select>
                  </td>
                  <td>
                    <input
                      type="date"
                      value={i.deliveryDate}
                      onChange={(e) =>
                        itemUpdate(i.id, "deliveryDate", e.target.value)
                      }
                    />
                  </td>
                  <td>
                    <b
                      className={
                        i.qty - i.deliveredQty > 0 ? "remaining" : "complete"
                      }
                    >
                      {i.qty - i.deliveredQty} {i.unit}
                    </b>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <div className="po-two-columns">
        <section id="documents" className="po-section">
          <div className="section-heading">
            <div>
              <span>▧</span>
              <h2>Hồ sơ cần thiết</h2>
            </div>
            <button
              onClick={() =>
                onUpdate({
                  ...po,
                  docs: [
                    ...po.docs,
                    {
                      id: Date.now(),
                      name: "Hồ sơ mới",
                      status: "Còn thiếu",
                      note: "",
                    },
                  ],
                })
              }
            >
              ＋ Thêm hồ sơ
            </button>
          </div>
          <div className="checklist">
            {po.docs.map((d) => (
              <div key={d.id}>
                <input
                  value={d.name}
                  onChange={(e) =>
                    onUpdate({
                      ...po,
                      docs: po.docs.map((x) =>
                        x.id === d.id ? { ...x, name: e.target.value } : x,
                      ),
                    })
                  }
                />
                <select
                  value={d.status}
                  onChange={(e) =>
                    onUpdate({
                      ...po,
                      docs: po.docs.map((x) =>
                        x.id === d.id
                          ? { ...x, status: e.target.value as PODoc["status"] }
                          : x,
                      ),
                    })
                  }
                >
                  <option>Đã đủ</option>
                  <option>Còn thiếu</option>
                  <option>Chờ bổ sung</option>
                </select>
                <input
                  placeholder="Ghi chú"
                  value={d.note}
                  onChange={(e) =>
                    onUpdate({
                      ...po,
                      docs: po.docs.map((x) =>
                        x.id === d.id ? { ...x, note: e.target.value } : x,
                      ),
                    })
                  }
                />
              </div>
            ))}
          </div>
        </section>
        <section id="payments" className="po-section">
          <div className="section-heading">
            <div>
              <span>₫</span>
              <h2>Tiến độ thanh toán</h2>
            </div>
            <button
              onClick={() =>
                onUpdate({
                  ...po,
                  payments: [
                    ...po.payments,
                    {
                      id: Date.now(),
                      phase: "Đợt mới",
                      percent: 0,
                      amount: 0,
                      status: "Chưa thanh toán",
                      date: "",
                    },
                  ],
                })
              }
            >
              ＋ Thêm đợt
            </button>
          </div>
          <div className="payment-list">
            {po.payments.map((p) => (
              <div key={p.id}>
                <input
                  value={p.phase}
                  onChange={(e) =>
                    onUpdate({
                      ...po,
                      payments: po.payments.map((x) =>
                        x.id === p.id ? { ...x, phase: e.target.value } : x,
                      ),
                    })
                  }
                />
                <label>
                  <input
                    type="number"
                    value={p.percent}
                    onChange={(e) =>
                      onUpdate({
                        ...po,
                        payments: po.payments.map((x) =>
                          x.id === p.id
                            ? {
                                ...x,
                                percent: Number(e.target.value),
                                amount: (total * Number(e.target.value)) / 100,
                              }
                            : x,
                        ),
                      })
                    }
                  />
                  %
                </label>
                <b>{fmt(p.amount)} ₫</b>
                <select
                  value={p.status}
                  onChange={(e) =>
                    onUpdate({
                      ...po,
                      payments: po.payments.map((x) =>
                        x.id === p.id
                          ? {
                              ...x,
                              status: e.target.value as Payment["status"],
                            }
                          : x,
                      ),
                    })
                  }
                >
                  <option>Chưa thanh toán</option>
                  <option>Đang xử lý</option>
                  <option>Đã thanh toán</option>
                </select>
                <input
                  type="date"
                  value={p.date}
                  onChange={(e) =>
                    onUpdate({
                      ...po,
                      payments: po.payments.map((x) =>
                        x.id === p.id ? { ...x, date: e.target.value } : x,
                      ),
                    })
                  }
                />
              </div>
            ))}
          </div>
        </section>
      </div>
      <section id="timeline" className="po-section">
        <div className="section-heading">
          <div>
            <span>◷</span>
            <h2>Timeline giao hàng & thanh toán</h2>
          </div>
        </div>
        <div className="timeline">
          {events.length ? (
            events.map((e, i) => (
              <article key={i} className={e.kind}>
                <time>{dateVN(e.date)}</time>
                <i />
                <div>
                  <b>{e.title}</b>
                  <p>{e.note}</p>
                </div>
              </article>
            ))
          ) : (
            <p>Chưa có sự kiện giao hàng hoặc thanh toán.</p>
          )}
        </div>
      </section>
    </section>
  );
}

function PRList({
  prs,
  onCreate,
  onOpen,
}: {
  prs: PR[];
  onCreate: () => void;
  onOpen: (pr: PR) => void;
}) {
  const [q, setQ] = useState("");
  const shown = prs.filter((p) =>
    (p.number + p.department + p.purpose)
      .toLowerCase()
      .includes(q.toLowerCase()),
  );
  return (
    <section className="content pr-page">
      <div className="heading">
        <div>
          <em>QUẢN LÝ ĐỀ NGHỊ MUA HÀNG</em>
          <h1>Danh sách PR</h1>
          <p>Theo dõi yêu cầu mua hàng và chuyển sang bước lấy báo giá.</p>
        </div>
        <button className="primary" onClick={onCreate}>
          ＋ Tạo PR mới
        </button>
      </div>
      <div className="pr-stats">
        <article>
          <span>Tổng số PR</span>
          <strong>{prs.length}</strong>
          <small>Trong danh sách hiện tại</small>
        </article>
        <article>
          <span>Chờ xử lý</span>
          <strong>{prs.filter((p) => p.status === "Chờ xử lý").length}</strong>
          <small>Cần tiếp tục thực hiện</small>
        </article>
        <article>
          <span>Đang lấy báo giá</span>
          <strong>
            {prs.filter((p) => p.status === "Đang lấy báo giá").length}
          </strong>
          <small>Đang so sánh nhà cung cấp</small>
        </article>
      </div>
      <div className="pr-panel">
        <div className="pr-toolbar">
          <label>
            ⌕
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Tìm số PR, đơn vị, mục đích..."
            />
          </label>
          <span>{shown.length} yêu cầu mua hàng</span>
        </div>
        <div className="pr-table">
          <table>
            <thead>
              <tr>
                <th>Số PR</th>
                <th>Ngày PR</th>
                <th>Đơn vị</th>
                <th>Mục đích sử dụng</th>
                <th>Số mặt hàng</th>
                <th>Giá trị dự kiến</th>
                <th>Trạng thái</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {shown.map((pr) => (
                <tr key={pr.id}>
                  <td>
                    <button className="pr-link" onClick={() => onOpen(pr)}>
                      {pr.number}
                    </button>
                  </td>
                  <td>{dateVN(pr.date)}</td>
                  <td>{pr.department}</td>
                  <td className="purpose-cell">{pr.purpose}</td>
                  <td className="center">{pr.items.length}</td>
                  <td className="money">
                    {fmt(pr.items.reduce((s, i) => s + i.qty * i.estimate, 0))}{" "}
                    ₫
                  </td>
                  <td>
                    <span
                      className={`status ${pr.status === "Đã hoàn thành" ? "done" : pr.status === "Đang lấy báo giá" ? "progress" : "waiting"}`}
                    >
                      {pr.status}
                    </span>
                  </td>
                  <td>
                    <button className="row-action" onClick={() => onOpen(pr)}>
                      Mở PR →
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function CreatePR({
  draft,
  setDraft,
  itemChange,
  fileRef,
  importExcel,
  message,
  onCancel,
  onSave,
}: {
  draft: {
    number: string;
    date: string;
    department: string;
    purpose: string;
    items: Item[];
  };
  setDraft: React.Dispatch<
    React.SetStateAction<{
      number: string;
      date: string;
      department: string;
      purpose: string;
      items: Item[];
    }>
  >;
  itemChange: (
    id: number,
    k: keyof Item,
    v: string,
    forDraft?: boolean,
  ) => void;
  fileRef: React.RefObject<HTMLInputElement | null>;
  importExcel: (e: ChangeEvent<HTMLInputElement>) => void;
  message: string;
  onCancel: () => void;
  onSave: () => void;
}) {
  const total = draft.items.reduce((s, i) => s + i.qty * i.estimate, 0);
  const [order, setOrder] = useState<ColumnKey[]>(
      BASE_COLUMNS.map((c) => c.key),
    ),
    [filters, setFilters] = useState<Partial<Record<ColumnKey, string[]>>>({}),
    [sort, setSort] = useState<SortState>(null),
    [open, setOpen] = useState<ColumnKey | null>(null);
  const visible = useMemo(
    () => applyTools(draft.items, order, filters, sort),
    [draft.items, order, filters, sort],
  );
  return (
    <section className="content create-page">
      <div className="heading">
        <div>
          <em>ĐỀ NGHỊ MUA HÀNG</em>
          <h1>Tạo PR mới</h1>
          <p>Nhập thông tin chung và danh sách hàng hóa cần mua.</p>
        </div>
        <div className="actions">
          <button className="ghost" onClick={onCancel}>
            Hủy
          </button>
          <button
            className="primary"
            onClick={onSave}
            disabled={
              !draft.number ||
              !draft.date ||
              !draft.department ||
              !draft.purpose
            }
          >
            Lưu PR
          </button>
        </div>
      </div>
      <div className="form-card">
        <div className="section-title">
          <span>1</span>
          <div>
            <h2>Thông tin PR</h2>
            <p>Các thông tin nhận diện và mục đích sử dụng</p>
          </div>
        </div>
        <div className="form-grid">
          <label>
            Số PR <b>*</b>
            <input
              value={draft.number}
              onChange={(e) =>
                setDraft((d) => ({ ...d, number: e.target.value }))
              }
            />
          </label>
          <label>
            Ngày PR <b>*</b>
            <input
              type="date"
              value={draft.date}
              onChange={(e) =>
                setDraft((d) => ({ ...d, date: e.target.value }))
              }
            />
          </label>
          <label>
            Đơn vị <b>*</b>
            <input
              placeholder="Ví dụ: Phòng Kỹ thuật"
              value={draft.department}
              onChange={(e) =>
                setDraft((d) => ({ ...d, department: e.target.value }))
              }
            />
          </label>
          <label className="purpose-input">
            Mục đích sử dụng <b>*</b>
            <textarea
              rows={3}
              placeholder="Mô tả nhu cầu và mục đích sử dụng..."
              value={draft.purpose}
              onChange={(e) =>
                setDraft((d) => ({ ...d, purpose: e.target.value }))
              }
            />
          </label>
        </div>
      </div>
      <div className="form-card items-card">
        <div className="items-heading">
          <div className="section-title">
            <span>2</span>
            <div>
              <h2>Danh sách hàng hóa</h2>
              <p>Kéo cột để đổi vị trí; bấm ▾ để lọc một hoặc nhiều giá trị</p>
            </div>
          </div>
          <div className="excel-actions">
            <a
              className="ghost download"
              href="/mau-nhap-danh-sach-hang-hoa-pr.xlsx"
              download
            >
              ⇩ Tải Excel mẫu
            </a>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              hidden
              onChange={importExcel}
            />
            <button
              className="excel-upload"
              onClick={() => fileRef.current?.click()}
            >
              ⇧ Nhập dữ liệu từ Excel
            </button>
          </div>
        </div>
        {message && (
          <div
            className={`import-message ${message.startsWith("Không") ? "error" : ""}`}
          >
            {message.startsWith("Không") ? "⚠" : "✓"} {message}
          </div>
        )}
        <DraftItemsTable
          items={draft.items}
          visibleItems={visible}
          order={order}
          setOrder={setOrder}
          filters={filters}
          setFilters={setFilters}
          sort={sort}
          setSort={setSort}
          filterOpen={open}
          setFilterOpen={setOpen}
          itemChange={itemChange}
          setDraft={setDraft}
        />
        <button
          className="add-row"
          onClick={() =>
            setDraft((d) => ({
              ...d,
              items: [...d.items, emptyItem(d.items.length)],
            }))
          }
        >
          ＋ Thêm dòng hàng hóa
        </button>
      </div>
      <div className="create-footer">
        <p>
          <b>{draft.items.filter((i) => i.code || i.name).length}</b> mặt hàng ·
          Tổng dự kiến <strong>{fmt(total)} ₫</strong>
        </p>
        <div>
          <button className="ghost" onClick={onCancel}>
            Hủy
          </button>
          <button
            className="primary"
            onClick={onSave}
            disabled={
              !draft.number ||
              !draft.date ||
              !draft.department ||
              !draft.purpose
            }
          >
            Lưu PR
          </button>
        </div>
      </div>
    </section>
  );
}
