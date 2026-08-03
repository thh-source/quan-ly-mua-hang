"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type CurrentUser = { id: string; username: string; displayName: string; role: string };
type Status = "Chưa thực hiện" | "Đang thực hiện" | "Hoàn thành" | "Trễ hạn";
type PaymentMethod = "TT" | "TTR" | "LC";
type DocumentStatus = "Chưa có" | "Đã có" | "Đang bổ sung" | "Không yêu cầu";

type ContractItem = {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
  leadTime: string;
  expectedDate: string;
  actualDate: string;
  status: Status;
  note: string;
};

type Milestone = {
  id: string;
  name: string;
  expectedDate: string;
  actualDate: string;
  status: Status;
  note: string;
};

type PaymentDocument = {
  id: string;
  name: string;
  received: boolean;
  status: DocumentStatus;
  note: string;
};

type Payment = {
  id: string;
  name: string;
  terms: string;
  percentage: number;
  amount: number;
  method: PaymentMethod;
  expectedDate: string;
  actualDate: string;
  relatedMilestone: string;
  status: Status;
  note: string;
  documents: PaymentDocument[];
};

type Contract = {
  id: string;
  supplierName: string;
  contractNumber: string;
  contractDate: string;
  folderLink: string;
  note: string;
  items: ContractItem[];
  milestones: Milestone[];
  payments: Payment[];
};

type Project = { id: string; name: string; note: string; contracts: Contract[] };
type AppState = { projects: Project[] };

const statuses: Status[] = ["Chưa thực hiện", "Đang thực hiện", "Hoàn thành", "Trễ hạn"];
const documentStatuses: DocumentStatus[] = ["Chưa có", "Đã có", "Đang bổ sung", "Không yêu cầu"];
const uid = () => crypto.randomUUID();
const blankDocument = (name = "Hồ sơ mới"): PaymentDocument => ({ id: uid(), name, received: false, status: "Chưa có", note: "" });
const blankPayment = (): Payment => ({
  id: uid(), name: "Lần thanh toán mới", terms: "", percentage: 0, amount: 0, method: "TT",
  expectedDate: "", actualDate: "", relatedMilestone: "", status: "Chưa thực hiện", note: "",
  documents: [blankDocument("Invoice"), blankDocument("Packing List"), blankDocument("B/L")],
});
const blankContract = (): Contract => ({
  id: uid(), supplierName: "", contractNumber: "", contractDate: "", folderLink: "", note: "",
  items: [],
  milestones: ["DQ", "FAT", "SAT"].map((name) => ({ id: uid(), name, expectedDate: "", actualDate: "", status: "Chưa thực hiện" as Status, note: "" })),
  payments: [],
});
const money = (n: number) => new Intl.NumberFormat("vi-VN").format(Number(n || 0));
const roman = (index: number) => {
  const map: [number, string][] = [[1000,"M"],[900,"CM"],[500,"D"],[400,"CD"],[100,"C"],[90,"XC"],[50,"L"],[40,"XL"],[10,"X"],[9,"IX"],[5,"V"],[4,"IV"],[1,"I"]];
  let n = index + 1, out = "";
  for (const [value, symbol] of map) while (n >= value) { out += symbol; n -= value; }
  return out;
};

export default function ProjectContractsApp({ currentUser }: { currentUser: CurrentUser }) {
  const [data, setData] = useState<AppState>({ projects: [] });
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [selectedContractId, setSelectedContractId] = useState("");
  const [tab, setTab] = useState<"info" | "items" | "timeline" | "payments">("info");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialized = useRef(false);

  const selectedProject = data.projects.find((p) => p.id === selectedProjectId) || null;
  const selectedContract = selectedProject?.contracts.find((c) => c.id === selectedContractId) || null;

  useEffect(() => {
    fetch("/api/project-contracts/state")
      .then(async (r) => { if (!r.ok) throw new Error("Không tải được dữ liệu"); return r.json(); })
      .then((res) => {
        const next: AppState = res.data || { projects: [] };
        setData(next);
        const firstProject = next.projects[0];
        if (firstProject) {
          setSelectedProjectId(firstProject.id);
          setSelectedContractId(firstProject.contracts[0]?.id || "");
        }
      })
      .catch((e) => setMessage(e instanceof Error ? e.message : "Lỗi tải dữ liệu"))
      .finally(() => { setLoading(false); initialized.current = true; });
  }, []);

  useEffect(() => {
    if (!initialized.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaving(true);
      try {
        const r = await fetch("/api/project-contracts/state", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
        if (!r.ok) throw new Error("Không lưu được dữ liệu");
        setMessage("Đã tự động lưu");
        setTimeout(() => setMessage(""), 1800);
      } catch (e) { setMessage(e instanceof Error ? e.message : "Lỗi lưu dữ liệu"); }
      finally { setSaving(false); }
    }, 650);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [data]);

  const totals = useMemo(() => {
    const contractCount = data.projects.reduce((s, p) => s + p.contracts.length, 0);
    const paymentCount = data.projects.reduce((s, p) => s + p.contracts.reduce((a, c) => a + c.payments.length, 0), 0);
    const pendingDocs = data.projects.reduce((s, p) => s + p.contracts.reduce((a, c) => a + c.payments.reduce((x, pay) => x + pay.documents.filter((d) => !d.received && d.status !== "Không yêu cầu").length, 0), 0), 0);
    return { contractCount, paymentCount, pendingDocs };
  }, [data]);

  function updateProject(patch: Partial<Project>) {
    setData((old) => ({ projects: old.projects.map((p) => p.id === selectedProjectId ? { ...p, ...patch } : p) }));
  }
  function updateContract(patch: Partial<Contract>) {
    if (!selectedProject || !selectedContract) return;
    updateProject({ contracts: selectedProject.contracts.map((c) => c.id === selectedContract.id ? { ...c, ...patch } : c) });
  }
  function addProject() {
    const name = prompt("Tên dự án mới:", `Dự án ${data.projects.length + 1}`)?.trim();
    if (!name) return;
    const project: Project = { id: uid(), name, note: "", contracts: [] };
    setData((old) => ({ projects: [...old.projects, project] }));
    setSelectedProjectId(project.id); setSelectedContractId(""); setTab("info");
  }
  function deleteProject() {
    if (!selectedProject || !confirm(`Xóa dự án “${selectedProject.name}” và toàn bộ hợp đồng bên trong?`)) return;
    const next = data.projects.filter((p) => p.id !== selectedProject.id);
    setData({ projects: next }); setSelectedProjectId(next[0]?.id || ""); setSelectedContractId(next[0]?.contracts[0]?.id || "");
  }
  function addContract() {
    if (!selectedProject) return;
    const contract = blankContract();
    updateProject({ contracts: [...selectedProject.contracts, contract] });
    setSelectedContractId(contract.id); setTab("info");
  }
  function deleteContract() {
    if (!selectedProject || !selectedContract || !confirm("Xóa hợp đồng này?")) return;
    const next = selectedProject.contracts.filter((c) => c.id !== selectedContract.id);
    updateProject({ contracts: next }); setSelectedContractId(next[0]?.id || "");
  }

  if (loading) return <div className="pc-loading">Đang tải module hợp đồng dự án…</div>;

  return <div className="pc-shell">
    <aside className="pc-sidebar">
      <div className="pc-brand"><div>HC</div><span><b>HỢP ĐỒNG DỰ ÁN</b><small>Module độc lập</small></span></div>
      <button className="pc-back" onClick={() => location.href = "/"}>← Về hệ thống PR/PO</button>
      <div className="pc-tree-head"><span>CÂY DỰ ÁN</span><button onClick={addProject}>＋</button></div>
      <div className="pc-tree">
        {data.projects.map((project, index) => <div key={project.id}>
          <button className={`pc-project ${project.id === selectedProjectId ? "active" : ""}`} onClick={() => { setSelectedProjectId(project.id); setSelectedContractId(project.contracts[0]?.id || ""); }}>
            <span>{roman(index)}.</span><b>{project.name}</b><small>{project.contracts.length}</small>
          </button>
          {project.id === selectedProjectId && <div className="pc-contract-tree">
            {project.contracts.map((contract) => <button key={contract.id} className={contract.id === selectedContractId ? "active" : ""} onClick={() => setSelectedContractId(contract.id)}>
              📄 {contract.contractNumber || "Hợp đồng chưa đặt số"}
            </button>)}
          </div>}
        </div>)}
        {!data.projects.length && <p className="pc-empty-tree">Chưa có dự án</p>}
      </div>
      <div className="pc-user"><span>{currentUser.displayName?.slice(0,1).toUpperCase()}</span><div><b>{currentUser.displayName}</b><small>{saving ? "Đang lưu…" : "Đã kết nối"}</small></div></div>
    </aside>

    <main className="pc-main">
      <header className="pc-topbar"><div><strong>Quản lý hợp đồng mua sắm dự án</strong><small>Không dùng chung dữ liệu với PR/PO</small></div><div className="pc-save-state">{message || (saving ? "Đang lưu…" : "Tự động lưu")}</div></header>
      <div className="pc-content">
        <section className="pc-stats">
          <article><span>Dự án</span><b>{data.projects.length}</b></article>
          <article><span>Hợp đồng</span><b>{totals.contractCount}</b></article>
          <article><span>Lần thanh toán</span><b>{totals.paymentCount}</b></article>
          <article><span>Hồ sơ còn thiếu</span><b>{totals.pendingDocs}</b></article>
        </section>

        {!selectedProject ? <section className="pc-welcome"><div>📁</div><h1>Chưa có dự án</h1><p>Tạo dự án đầu tiên để bắt đầu quản lý hợp đồng thiết bị.</p><button onClick={addProject}>＋ Thêm dự án</button></section> : <>
          <section className="pc-project-header">
            <div><small>DỰ ÁN ĐANG CHỌN</small><input value={selectedProject.name} onChange={(e) => updateProject({ name: e.target.value })}/></div>
            <div className="pc-header-actions"><button onClick={addContract}>＋ Thêm hợp đồng</button><button className="danger" onClick={deleteProject}>Xóa dự án</button></div>
            <textarea placeholder="Ghi chú dự án…" value={selectedProject.note} onChange={(e) => updateProject({ note: e.target.value })}/>
          </section>

          {!selectedContract ? <section className="pc-welcome compact"><div>📄</div><h2>Dự án chưa có hợp đồng</h2><button onClick={addContract}>＋ Tạo hợp đồng đầu tiên</button></section> : <section className="pc-card">
            <div className="pc-contract-title"><div><small>HỢP ĐỒNG</small><h1>{selectedContract.contractNumber || "Hợp đồng chưa đặt số"}</h1></div><button className="danger" onClick={deleteContract}>Xóa hợp đồng</button></div>
            <nav className="pc-tabs">
              <button className={tab === "info" ? "active" : ""} onClick={() => setTab("info")}>Thông tin</button>
              <button className={tab === "items" ? "active" : ""} onClick={() => setTab("items")}>Hàng & Leadtime</button>
              <button className={tab === "timeline" ? "active" : ""} onClick={() => setTab("timeline")}>Timeline DQ/FAT/SAT</button>
              <button className={tab === "payments" ? "active" : ""} onClick={() => setTab("payments")}>Thanh toán & Hồ sơ</button>
            </nav>

            {tab === "info" && <div className="pc-form-grid">
              <label>Tên nhà cung cấp<input value={selectedContract.supplierName} onChange={(e) => updateContract({ supplierName: e.target.value })}/></label>
              <label>Số hợp đồng<input value={selectedContract.contractNumber} onChange={(e) => updateContract({ contractNumber: e.target.value })}/></label>
              <label>Ngày hợp đồng<input type="date" value={selectedContract.contractDate} onChange={(e) => updateContract({ contractDate: e.target.value })}/></label>
              <label className="span-3">Link thư mục hồ sơ<div className="pc-link-input"><input placeholder="https://..." value={selectedContract.folderLink} onChange={(e) => updateContract({ folderLink: e.target.value })}/>{selectedContract.folderLink && <a href={selectedContract.folderLink} target="_blank" rel="noreferrer">Mở thư mục ↗</a>}</div></label>
              <label className="span-3">Ghi chú hợp đồng<textarea value={selectedContract.note} onChange={(e) => updateContract({ note: e.target.value })}/></label>
            </div>}

            {tab === "items" && <Items contract={selectedContract} onChange={updateContract}/>} 
            {tab === "timeline" && <Timeline contract={selectedContract} onChange={updateContract}/>} 
            {tab === "payments" && <Payments contract={selectedContract} onChange={updateContract}/>} 
          </section>}
        </>}
      </div>
    </main>
  </div>;
}

function Items({ contract, onChange }: { contract: Contract; onChange: (patch: Partial<Contract>) => void }) {
  const total = contract.items.reduce((s, x) => s + Number(x.quantity || 0) * Number(x.unitPrice || 0), 0);
  const update = (id: string, patch: Partial<ContractItem>) => onChange({ items: contract.items.map((x) => x.id === id ? { ...x, ...patch } : x) });
  return <div className="pc-section">
    <div className="pc-section-head"><div><h2>Danh sách hàng và Leadtime</h2><p>Quản lý thời gian dự kiến, thực tế và ghi chú cho từng thiết bị.</p></div><button onClick={() => onChange({ items: [...contract.items, { id: uid(), name: "", quantity: 1, unitPrice: 0, leadTime: "", expectedDate: "", actualDate: "", status: "Chưa thực hiện", note: "" }] })}>＋ Thêm hàng</button></div>
    <div className="pc-table"><table><thead><tr><th>STT</th><th>Tên hàng / thiết bị</th><th>Số lượng</th><th>Đơn giá</th><th>Thành tiền</th><th>Leadtime</th><th>Ngày dự kiến</th><th>Ngày thực tế</th><th>Trạng thái</th><th>Ghi chú</th><th></th></tr></thead><tbody>
      {contract.items.map((item, i) => <tr key={item.id}><td>{i+1}</td><td><input value={item.name} onChange={(e)=>update(item.id,{name:e.target.value})}/></td><td><input type="number" value={item.quantity} onChange={(e)=>update(item.id,{quantity:Number(e.target.value)})}/></td><td><input type="number" value={item.unitPrice} onChange={(e)=>update(item.id,{unitPrice:Number(e.target.value)})}/></td><td className="money">{money(item.quantity*item.unitPrice)}</td><td><input value={item.leadTime} placeholder="VD: 16 tuần" onChange={(e)=>update(item.id,{leadTime:e.target.value})}/></td><td><input type="date" value={item.expectedDate} onChange={(e)=>update(item.id,{expectedDate:e.target.value})}/></td><td><input type="date" value={item.actualDate} onChange={(e)=>update(item.id,{actualDate:e.target.value})}/></td><td><select value={item.status} onChange={(e)=>update(item.id,{status:e.target.value as Status})}>{statuses.map(s=><option key={s}>{s}</option>)}</select></td><td><textarea value={item.note} onChange={(e)=>update(item.id,{note:e.target.value})}/></td><td><button className="pc-icon-danger" onClick={()=>onChange({items:contract.items.filter(x=>x.id!==item.id)})}>×</button></td></tr>)}
      {!contract.items.length && <tr><td colSpan={11} className="pc-no-row">Chưa có hàng hóa</td></tr>}
    </tbody><tfoot><tr><td colSpan={4}>Tổng giá trị danh sách hàng</td><td className="money">{money(total)}</td><td colSpan={6}></td></tr></tfoot></table></div>
  </div>;
}

function Timeline({ contract, onChange }: { contract: Contract; onChange: (patch: Partial<Contract>) => void }) {
  const update = (id: string, patch: Partial<Milestone>) => onChange({ milestones: contract.milestones.map((x) => x.id === id ? { ...x, ...patch } : x) });
  return <div className="pc-section"><div className="pc-section-head"><div><h2>Timeline hợp đồng</h2><p>Các mốc DQ, FAT, SAT và các giai đoạn bổ sung.</p></div><button onClick={() => onChange({ milestones: [...contract.milestones, { id: uid(), name: "Mốc mới", expectedDate: "", actualDate: "", status: "Chưa thực hiện", note: "" }] })}>＋ Thêm mốc</button></div>
    <div className="pc-timeline">{contract.milestones.map((m, i) => <article key={m.id} className={`status-${m.status.replaceAll(" ", "-").toLowerCase()}`}><div className="pc-dot">{i+1}</div><div className="pc-milestone"><div className="pc-milestone-top"><input value={m.name} onChange={(e)=>update(m.id,{name:e.target.value})}/><select value={m.status} onChange={(e)=>update(m.id,{status:e.target.value as Status})}>{statuses.map(s=><option key={s}>{s}</option>)}</select><button className="pc-icon-danger" onClick={()=>onChange({milestones:contract.milestones.filter(x=>x.id!==m.id)})}>×</button></div><div className="pc-date-grid"><label>Ngày dự kiến<input type="date" value={m.expectedDate} onChange={(e)=>update(m.id,{expectedDate:e.target.value})}/></label><label>Ngày thực tế<input type="date" value={m.actualDate} onChange={(e)=>update(m.id,{actualDate:e.target.value})}/></label></div><label>Ghi chú<textarea value={m.note} onChange={(e)=>update(m.id,{note:e.target.value})}/></label></div></article>)}</div>
  </div>;
}

function Payments({ contract, onChange }: { contract: Contract; onChange: (patch: Partial<Contract>) => void }) {
  const updatePayment = (id: string, patch: Partial<Payment>) => onChange({ payments: contract.payments.map((p) => p.id === id ? { ...p, ...patch } : p) });
  return <div className="pc-section"><div className="pc-section-head"><div><h2>Các lần thanh toán và hồ sơ</h2><p>Mỗi lần thanh toán có điều khoản, hình thức và checklist hồ sơ riêng.</p></div><button onClick={() => onChange({ payments: [...contract.payments, blankPayment()] })}>＋ Thêm lần thanh toán</button></div>
    <div className="pc-payment-list">{contract.payments.map((pay, index) => <article className="pc-payment" key={pay.id}><div className="pc-payment-head"><div className="pc-pay-index">{index+1}</div><input value={pay.name} onChange={(e)=>updatePayment(pay.id,{name:e.target.value})}/><span>{pay.method}</span><button className="pc-icon-danger" onClick={()=>onChange({payments:contract.payments.filter(x=>x.id!==pay.id)})}>×</button></div>
      <div className="pc-pay-grid"><label>Điều khoản thanh toán<textarea value={pay.terms} onChange={(e)=>updatePayment(pay.id,{terms:e.target.value})}/></label><label>Tỷ lệ (%)<input type="number" value={pay.percentage} onChange={(e)=>updatePayment(pay.id,{percentage:Number(e.target.value)})}/></label><label>Số tiền<input type="number" value={pay.amount} onChange={(e)=>updatePayment(pay.id,{amount:Number(e.target.value)})}/></label><label>Hình thức<select value={pay.method} onChange={(e)=>updatePayment(pay.id,{method:e.target.value as PaymentMethod})}><option>TT</option><option>TTR</option><option>LC</option></select></label><label>Ngày dự kiến<input type="date" value={pay.expectedDate} onChange={(e)=>updatePayment(pay.id,{expectedDate:e.target.value})}/></label><label>Ngày thực tế<input type="date" value={pay.actualDate} onChange={(e)=>updatePayment(pay.id,{actualDate:e.target.value})}/></label><label>Mốc liên quan<input list={`milestones-${pay.id}`} value={pay.relatedMilestone} onChange={(e)=>updatePayment(pay.id,{relatedMilestone:e.target.value})}/><datalist id={`milestones-${pay.id}`}>{contract.milestones.map(m=><option key={m.id} value={m.name}/>)}</datalist></label><label>Trạng thái<select value={pay.status} onChange={(e)=>updatePayment(pay.id,{status:e.target.value as Status})}>{statuses.map(s=><option key={s}>{s}</option>)}</select></label><label className="span-all">Ghi chú lần thanh toán<textarea value={pay.note} onChange={(e)=>updatePayment(pay.id,{note:e.target.value})}/></label></div>
      <Documents payment={pay} onChange={(documents)=>updatePayment(pay.id,{documents})}/>
    </article>)}{!contract.payments.length && <div className="pc-no-payments">Chưa có lần thanh toán</div>}</div>
  </div>;
}

function Documents({ payment, onChange }: { payment: Payment; onChange: (documents: PaymentDocument[]) => void }) {
  const update = (id: string, patch: Partial<PaymentDocument>) => onChange(payment.documents.map((d) => d.id === id ? { ...d, ...patch } : d));
  return <div className="pc-docs"><div className="pc-doc-head"><b>Checklist hồ sơ thanh toán</b><button onClick={()=>onChange([...payment.documents, blankDocument()])}>＋ Thêm hồ sơ</button></div><div className="pc-doc-table"><table><thead><tr><th>Đã có</th><th>Tên hồ sơ</th><th>Trạng thái</th><th>Ghi chú</th><th></th></tr></thead><tbody>{payment.documents.map(doc=><tr key={doc.id}><td><input className="pc-check" type="checkbox" checked={doc.received} onChange={(e)=>update(doc.id,{received:e.target.checked,status:e.target.checked?"Đã có":doc.status==="Đã có"?"Chưa có":doc.status})}/></td><td><input value={doc.name} onChange={(e)=>update(doc.id,{name:e.target.value})}/></td><td><select value={doc.status} onChange={(e)=>update(doc.id,{status:e.target.value as DocumentStatus,received:e.target.value==="Đã có"})}>{documentStatuses.map(s=><option key={s}>{s}</option>)}</select></td><td><textarea value={doc.note} onChange={(e)=>update(doc.id,{note:e.target.value})}/></td><td><button className="pc-icon-danger" onClick={()=>onChange(payment.documents.filter(x=>x.id!==doc.id))}>×</button></td></tr>)}</tbody></table></div></div>;
}
