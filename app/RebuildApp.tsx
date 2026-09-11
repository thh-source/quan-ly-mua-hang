"use client";

import { useEffect, useMemo, useState } from "react";

type Product = { id: string; code: string; name: string; canonicalName: string; unit: string; status: string };
type Supplier = { id: string; code: string; name: string; taxCode?: string | null; contact?: string | null; phone?: string | null; status: string };
type History = { id: string; productId: string; supplierId: string; purchasedAt: string; poNumber?: string | null; quantityMicros: number; unitPriceVnd: number; totalVnd: number };

type ApiState<T> = { data: T; loading: boolean; error: boolean };

const formatVnd = (value: number) => new Intl.NumberFormat("vi-VN").format(value) + " ₫";

async function getData<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error?.message || body?.error || "Không thể tải dữ liệu");
  return body.data as T;
}

export default function RebuildApp() {
  const [tab, setTab] = useState<"products" | "suppliers" | "history" | "normalization">("products");
  const [q, setQ] = useState("");
  const [products, setProducts] = useState<ApiState<Product[]>>({ data: [], loading: true, error: false });
  const [suppliers, setSuppliers] = useState<ApiState<Supplier[]>>({ data: [], loading: true, error: false });
  const [history, setHistory] = useState<ApiState<History[]>>({ data: [], loading: true, error: false });

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setProducts((x) => ({ ...x, loading: true, error: false }));
      getData<Product[]>(`/api/v1/products?q=${encodeURIComponent(q)}`)
        .then((data) => setProducts({ data, loading: false, error: false }))
        .catch(() => setProducts({ data: [], loading: false, error: true }));
      setSuppliers((x) => ({ ...x, loading: true, error: false }));
      getData<Supplier[]>(`/api/v1/suppliers?q=${encodeURIComponent(q)}`)
        .then((data) => setSuppliers({ data, loading: false, error: false }))
        .catch(() => setSuppliers({ data: [], loading: false, error: true }));
    }, 180);
    return () => window.clearTimeout(timer);
  }, [q]);

  useEffect(() => {
    getData<History[]>("/api/v1/purchase-history")
      .then((data) => setHistory({ data, loading: false, error: false }))
      .catch(() => setHistory({ data: [], loading: false, error: true }));
  }, []);

  const productMap = useMemo(() => new Map(products.data.map((x) => [x.id, x.name])), [products.data]);
  const supplierMap = useMemo(() => new Map(suppliers.data.map((x) => [x.id, x.name])), [suppliers.data]);

  return (
    <div className="scmh-shell">
      <aside className="scmh-side">
        <div className="scmh-brand">SCMH</div>
        <div className="scmh-brand-sub">Smart Procurement</div>
        <nav className="scmh-nav">
          <button className={tab === "products" ? "active" : ""} onClick={() => setTab("products")}>Hàng hóa</button>
          <button className={tab === "suppliers" ? "active" : ""} onClick={() => setTab("suppliers")}>Nhà cung cấp</button>
          <button className={tab === "history" ? "active" : ""} onClick={() => setTab("history")}>Lịch sử mua</button>
          <button className={tab === "normalization" ? "active" : ""} onClick={() => setTab("normalization")}>Chuẩn hóa</button>
        </nav>
      </aside>

      <main className="scmh-main">
        <header className="scmh-header">
          <div>
            <h1>{tab === "products" ? "Danh mục hàng hóa" : tab === "suppliers" ? "Nhà cung cấp" : tab === "history" ? "Lịch sử mua hàng" : "Chuẩn hóa dữ liệu"}</h1>
            <p>SCMH · Production</p>
          </div>
          {(tab === "products" || tab === "suppliers") && (
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm kiếm..." />
          )}
        </header>

        {tab === "products" && <section className="scmh-panel">
          <div className="scmh-toolbar"><strong>{products.data.length} mặt hàng</strong><span>Danh mục chuẩn hóa</span></div>
          {products.loading ? <div className="scmh-state">Đang tải…</div> : products.error ? <div className="scmh-state error">Không thể tải hàng hóa.</div> : !products.data.length ? <div className="scmh-state">Chưa có hàng hóa.</div> : <table><thead><tr><th>Mã</th><th>Tên hàng</th><th>Tên chuẩn</th><th>ĐVT</th><th>Trạng thái</th></tr></thead><tbody>{products.data.map((x) => <tr key={x.id}><td>{x.code}</td><td>{x.name}</td><td>{x.canonicalName}</td><td>{x.unit}</td><td><span className="scmh-badge">{x.status}</span></td></tr>)}</tbody></table>}
        </section>}

        {tab === "suppliers" && <section className="scmh-panel">
          <div className="scmh-toolbar"><strong>{suppliers.data.length} nhà cung cấp</strong><span>Danh mục NCC chuẩn hóa</span></div>
          {suppliers.loading ? <div className="scmh-state">Đang tải…</div> : suppliers.error ? <div className="scmh-state error">Không thể tải nhà cung cấp.</div> : !suppliers.data.length ? <div className="scmh-state">Chưa có nhà cung cấp.</div> : <table><thead><tr><th>Mã</th><th>Nhà cung cấp</th><th>MST</th><th>Liên hệ</th><th>Điện thoại</th><th>Trạng thái</th></tr></thead><tbody>{suppliers.data.map((x) => <tr key={x.id}><td>{x.code}</td><td>{x.name}</td><td>{x.taxCode ?? "—"}</td><td>{x.contact ?? "—"}</td><td>{x.phone ?? "—"}</td><td><span className="scmh-badge">{x.status}</span></td></tr>)}</tbody></table>}
        </section>}

        {tab === "history" && <section className="scmh-panel">
          <div className="scmh-toolbar"><strong>{history.data.length} giao dịch lịch sử</strong><span>Nền tảng phân tích giá</span></div>
          {history.loading ? <div className="scmh-state">Đang tải…</div> : history.error ? <div className="scmh-state error">Không thể tải lịch sử.</div> : !history.data.length ? <div className="scmh-state">Chưa có dữ liệu lịch sử mua hàng.</div> : <table><thead><tr><th>Ngày</th><th>PO</th><th>Hàng hóa</th><th>NCC</th><th>SL</th><th>Đơn giá</th><th>Thành tiền</th></tr></thead><tbody>{history.data.map((x) => <tr key={x.id}><td>{new Date(x.purchasedAt).toLocaleDateString("vi-VN")}</td><td>{x.poNumber ?? "—"}</td><td>{productMap.get(x.productId) ?? x.productId}</td><td>{supplierMap.get(x.supplierId) ?? x.supplierId}</td><td>{x.quantityMicros / 1_000_000}</td><td>{formatVnd(x.unitPriceVnd)}</td><td>{formatVnd(x.totalVnd)}</td></tr>)}</tbody></table>}
        </section>}

        {tab === "normalization" && <Normalization />}
      </main>
    </div>
  );
}

function Normalization() {
  const [entityType, setEntityType] = useState<"product" | "supplier">("supplier");
  const [rawValue, setRawValue] = useState("");
  const [result, setResult] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const match = async () => {
    if (!rawValue.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/v1/normalization/match", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ entityType, rawValue }) });
      const body = await res.json();
      setResult(body.data ?? body.error ?? body);
    } finally {
      setBusy(false);
    }
  };
  return <section className="scmh-panel"><div className="scmh-normalization"><h2>Matching canonical entity</h2><p>Chuẩn hóa tên thô, dò ứng viên và lưu kết quả để tránh tạo trùng.</p><div className="scmh-row"><select value={entityType} onChange={(e) => setEntityType(e.target.value as "product" | "supplier")}><option value="supplier">Nhà cung cấp</option><option value="product">Hàng hóa</option></select><input value={rawValue} onChange={(e) => setRawValue(e.target.value)} placeholder="Ví dụ: Cty ABC" /><button onClick={match} disabled={busy}>{busy ? "Đang dò…" : "Dò khớp"}</button></div>{result ? <pre>{JSON.stringify(result, null, 2)}</pre> : null}</div></section>;
}
