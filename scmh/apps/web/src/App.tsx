import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

type Product = { id: string; code: string; name: string; canonicalName: string; unit: string; status: string };
type Supplier = { id: string; code: string; name: string; taxCode?: string | null; contact?: string | null; phone?: string | null; status: string };
type History = { id: string; productId: string; supplierId: string; purchasedAt: string; poNumber?: string | null; quantityMicros: number; unitPriceVnd: number; totalVnd: number };

const api = async <T,>(url: string): Promise<T> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Không thể tải dữ liệu");
  return (await res.json()).data;
};

const formatVnd = (value: number) => new Intl.NumberFormat("vi-VN").format(value) + " ₫";

export default function App() {
  const [tab, setTab] = useState<"products"|"suppliers"|"history"|"normalization">("products");
  const [q, setQ] = useState("");

  const products = useQuery({ queryKey: ["products", q], queryFn: () => api<Product[]>(`/api/v1/products?q=${encodeURIComponent(q)}`) });
  const suppliers = useQuery({ queryKey: ["suppliers", q], queryFn: () => api<Supplier[]>(`/api/v1/suppliers?q=${encodeURIComponent(q)}`) });
  const history = useQuery({ queryKey: ["history"], queryFn: () => api<History[]>("/api/v1/purchase-history") });

  const productMap = useMemo(() => new Map((products.data ?? []).map(x => [x.id, x.name])), [products.data]);
  const supplierMap = useMemo(() => new Map((suppliers.data ?? []).map(x => [x.id, x.name])), [suppliers.data]);

  return (
    <div className="shell">
      <aside>
        <div className="brand">SCMH</div>
        <div className="brandSub">Smart Procurement</div>
        <nav>
          <button className={tab==="products"?"active":""} onClick={() => setTab("products")}>Hàng hóa</button>
          <button className={tab==="suppliers"?"active":""} onClick={() => setTab("suppliers")}>Nhà cung cấp</button>
          <button className={tab==="history"?"active":""} onClick={() => setTab("history")}>Lịch sử mua</button>
          <button className={tab==="normalization"?"active":""} onClick={() => setTab("normalization")}>Chuẩn hóa</button>
        </nav>
      </aside>

      <main>
        <header>
          <div>
            <h1>{tab==="products"?"Danh mục hàng hóa":tab==="suppliers"?"Nhà cung cấp":tab==="history"?"Lịch sử mua hàng":"Chuẩn hóa dữ liệu"}</h1>
            <p>SCMH Rebuild · Phase 2</p>
          </div>
          {(tab==="products" || tab==="suppliers") && (
            <input value={q} onChange={(e)=>setQ(e.target.value)} placeholder="Tìm kiếm..." />
          )}
        </header>

        {tab==="products" && <section className="panel">
          <div className="toolbar"><strong>{products.data?.length ?? 0} mặt hàng</strong><span>CRUD · Search · Filter · History</span></div>
          {products.isLoading ? <div className="state">Đang tải…</div> :
           products.isError ? <div className="state error">Không thể tải hàng hóa.</div> :
           !products.data?.length ? <div className="state">Chưa có hàng hóa.</div> :
           <table><thead><tr><th>Mã</th><th>Tên hàng</th><th>Tên chuẩn</th><th>ĐVT</th><th>Trạng thái</th></tr></thead>
           <tbody>{products.data.map(x=><tr key={x.id}><td>{x.code}</td><td>{x.name}</td><td>{x.canonicalName}</td><td>{x.unit}</td><td><span className="badge">{x.status}</span></td></tr>)}</tbody></table>}
        </section>}

        {tab==="suppliers" && <section className="panel">
          <div className="toolbar"><strong>{suppliers.data?.length ?? 0} nhà cung cấp</strong><span>Tax code · Alias · Locking</span></div>
          {suppliers.isLoading ? <div className="state">Đang tải…</div> :
           suppliers.isError ? <div className="state error">Không thể tải nhà cung cấp.</div> :
           !suppliers.data?.length ? <div className="state">Chưa có nhà cung cấp.</div> :
           <table><thead><tr><th>Mã</th><th>Nhà cung cấp</th><th>MST</th><th>Liên hệ</th><th>Điện thoại</th><th>Trạng thái</th></tr></thead>
           <tbody>{suppliers.data.map(x=><tr key={x.id}><td>{x.code}</td><td>{x.name}</td><td>{x.taxCode ?? "—"}</td><td>{x.contact ?? "—"}</td><td>{x.phone ?? "—"}</td><td><span className="badge">{x.status}</span></td></tr>)}</tbody></table>}
        </section>}

        {tab==="history" && <section className="panel">
          <div className="toolbar"><strong>{history.data?.length ?? 0} giao dịch lịch sử</strong><span>Price trend foundation</span></div>
          {history.isLoading ? <div className="state">Đang tải…</div> :
           history.isError ? <div className="state error">Không thể tải lịch sử.</div> :
           !history.data?.length ? <div className="state">Chưa có dữ liệu lịch sử mua hàng.</div> :
           <table><thead><tr><th>Ngày</th><th>PO</th><th>Hàng hóa</th><th>NCC</th><th>SL</th><th>Đơn giá</th><th>Thành tiền</th></tr></thead>
           <tbody>{history.data.map(x=><tr key={x.id}><td>{new Date(x.purchasedAt).toLocaleDateString("vi-VN")}</td><td>{x.poNumber ?? "—"}</td><td>{productMap.get(x.productId) ?? x.productId}</td><td>{supplierMap.get(x.supplierId) ?? x.supplierId}</td><td>{x.quantityMicros/1_000_000}</td><td>{formatVnd(x.unitPriceVnd)}</td><td>{formatVnd(x.totalVnd)}</td></tr>)}</tbody></table>}
        </section>}

        {tab==="normalization" && <Normalization />}
      </main>
    </div>
  );
}

function Normalization() {
  const [entityType,setEntityType]=useState<"product"|"supplier">("supplier");
  const [rawValue,setRawValue]=useState("");
  const [result,setResult]=useState<any>(null);
  const [busy,setBusy]=useState(false);
  const match=async()=>{
    if(!rawValue.trim()) return;
    setBusy(true);
    const res=await fetch("/api/v1/normalization/match",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({entityType,rawValue})});
    setResult((await res.json()).data);
    setBusy(false);
  };
  return <section className="panel">
    <div className="normalization">
      <h2>Matching canonical entity</h2>
      <p>Chuẩn hóa tên thô, dò ứng viên và lưu kết quả để tránh tạo trùng.</p>
      <div className="row">
        <select value={entityType} onChange={e=>setEntityType(e.target.value as any)}><option value="supplier">Nhà cung cấp</option><option value="product">Hàng hóa</option></select>
        <input value={rawValue} onChange={e=>setRawValue(e.target.value)} placeholder="Ví dụ: Cty ABC" />
        <button onClick={match} disabled={busy}>{busy?"Đang dò…":"Dò khớp"}</button>
      </div>
      {result && <pre>{JSON.stringify(result,null,2)}</pre>}
    </div>
  </section>
}
