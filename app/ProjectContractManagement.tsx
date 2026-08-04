"use client";

import { useState } from "react";
import VisualTimeline from "./VisualTimeline";

export type ProjectContractItem = {
  id: number;
  name: string;
  qty: number;
  unitPrice: number;
  note: string;
};
export type ProjectContractMilestone = {
  id: number;
  name: "DQ" | "FAT" | "SAT" | "Giao hàng";
  plannedDate: string;
  actualDate: string;
  status: "Chưa bắt đầu" | "Đang xử lý" | "Hoàn thành" | "Trễ hạn";
  note: string;
};
export type ProjectPaymentDoc = {
  id: number;
  name: string;
  checked: boolean;
  status: "Chưa có" | "Đã có" | "Cần bổ sung";
  note: string;
};
export type ProjectPayment = {
  id: number;
  phase: string;
  method: "TT" | "TTR" | "LC";
  percent: number;
  amount: number;
  dueDate: string;
  paidDate: string;
  status: "Chưa đến hạn" | "Đang xử lý" | "Đã thanh toán" | "Quá hạn";
  condition: string;
  note: string;
  docs: ProjectPaymentDoc[];
};
export type ProjectContract = {
  id: number;
  supplierName: string;
  contractNo: string;
  contractDate: string;
  folderLink: string;
  note: string;
  items: ProjectContractItem[];
  milestones: ProjectContractMilestone[];
  payments: ProjectPayment[];
};
export type ProjectContractProject = {
  id: number;
  name: string;
  note: string;
  contracts: ProjectContract[];
};
export type ProjectContractWorkspace = {
  projects: ProjectContractProject[];
};

const fmt = (value: number) => new Intl.NumberFormat("vi-VN").format(value || 0);
const today = () => new Date().toISOString().slice(0, 10);
const roman = (index: number) => {
  const values = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
  return values[index] || String(index + 1);
};
const defaultDocs = (): ProjectPaymentDoc[] =>
  ["Invoice", "Packing list", "B/L", "CO", "CQ"].map((name, index) => ({
    id: Date.now() + index,
    name,
    checked: false,
    status: "Chưa có",
    note: "",
  }));
const newItem = (index = 0): ProjectContractItem => ({
  id: Date.now() + index,
  name: "",
  qty: 1,
  unitPrice: 0,
  note: "",
});
const newMilestones = (): ProjectContractMilestone[] =>
  (["DQ", "FAT", "SAT", "Giao hàng"] as const).map((name, index) => ({
    id: Date.now() + index,
    name,
    plannedDate: "",
    actualDate: "",
    status: "Chưa bắt đầu",
    note: "",
  }));
const newPayment = (index = 0): ProjectPayment => ({
  id: Date.now() + index,
  phase: `Đợt ${index + 1}`,
  method: "TT",
  percent: 0,
  amount: 0,
  dueDate: "",
  paidDate: "",
  status: "Chưa đến hạn",
  condition: "",
  note: "",
  docs: defaultDocs(),
});
const newContract = (): ProjectContract => ({
  id: Date.now(),
  supplierName: "",
  contractNo: "",
  contractDate: today(),
  folderLink: "",
  note: "",
  items: [newItem()],
  milestones: newMilestones(),
  payments: [newPayment()],
});

export default function ProjectContractManagement({
  value,
  onChange,
}: {
  value: ProjectContractWorkspace;
  onChange: (next: ProjectContractWorkspace) => void;
}) {
  const projects = value.projects || [];
  const [selectedProjectId, setSelectedProjectId] = useState(projects[0]?.id || 0),
    [selectedContractId, setSelectedContractId] = useState(0),
    [query, setQuery] = useState("");
  const selectedProject = projects.find((project) => project.id === selectedProjectId) || projects[0];
  const contracts = selectedProject?.contracts || [];
  const shownContracts = contracts.filter((contract) =>
    `${contract.supplierName} ${contract.contractNo}`.toLowerCase().includes(query.toLowerCase()),
  );
  const selectedContract =
    contracts.find((contract) => contract.id === selectedContractId) ||
    shownContracts[0] ||
    contracts[0];
  const allContracts = projects.flatMap((project) => project.contracts);
  const totalValue = allContracts.reduce(
    (sum, contract) =>
      sum + contract.items.reduce((itemSum, item) => itemSum + item.qty * item.unitPrice, 0),
    0,
  );
  const alerts = allContracts.reduce(
    (sum, contract) =>
      sum +
      contract.payments.filter((payment) =>
        payment.docs.some((doc) => !doc.checked || doc.status !== "Đã có"),
      ).length,
    0,
  );
  const paymentTimeline = (selectedContract?.payments || [])
    .filter((payment) => payment.dueDate || payment.paidDate)
    .map((payment) => ({
      id: payment.id,
      date: payment.paidDate || payment.dueDate,
      title: payment.phase,
      note: `${payment.method} · ${payment.status} · ${fmt(payment.amount)} ₫`,
      state:
        payment.status === "Đã thanh toán"
          ? "done"
          : payment.status === "Quá hạn"
            ? "late"
            : "todo",
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const leadtimeTimeline = (selectedContract?.milestones || [])
    .filter((milestone) => milestone.plannedDate || milestone.actualDate)
    .map((milestone) => ({
      id: milestone.id,
      date: milestone.actualDate || milestone.plannedDate,
      title: milestone.name,
      note: `${milestone.status}${milestone.note ? ` · ${milestone.note}` : ""}`,
      status:
        milestone.status === "Hoàn thành"
          ? "done"
          : milestone.status === "Trễ hạn"
            ? "late"
            : milestone.status === "Đang xử lý"
              ? "doing"
              : "todo",
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const update = (nextProjects: ProjectContractProject[]) =>
    onChange({ projects: nextProjects });
  const addProject = () => {
    const project: ProjectContractProject = {
      id: Date.now(),
      name: `Dự án ${projects.length + 1}`,
      note: "",
      contracts: [],
    };
    update([...projects, project]);
    setSelectedProjectId(project.id);
    setSelectedContractId(0);
  };
  const updateProject = (patch: Partial<ProjectContractProject>) => {
    if (!selectedProject) return;
    update(projects.map((project) => (project.id === selectedProject.id ? { ...project, ...patch } : project)));
  };
  const addContract = () => {
    if (!selectedProject) return;
    const contract = newContract();
    update(
      projects.map((project) =>
        project.id === selectedProject.id
          ? { ...project, contracts: [contract, ...project.contracts] }
          : project,
      ),
    );
    setSelectedContractId(contract.id);
  };
  const updateContract = (contractId: number, patch: Partial<ProjectContract>) => {
    if (!selectedProject) return;
    update(
      projects.map((project) =>
        project.id === selectedProject.id
          ? {
              ...project,
              contracts: project.contracts.map((contract) =>
                contract.id === contractId ? { ...contract, ...patch } : contract,
              ),
            }
          : project,
      ),
    );
  };
  const updateContractList = (contractId: number, next: ProjectContract) =>
    updateContract(contractId, next);
  const removeContract = (contractId: number) => {
    if (!selectedProject || !confirm("Xóa hợp đồng dự án này?")) return;
    update(
      projects.map((project) =>
        project.id === selectedProject.id
          ? { ...project, contracts: project.contracts.filter((contract) => contract.id !== contractId) }
          : project,
      ),
    );
    setSelectedContractId(0);
  };
  return (
    <section className="content project-contract-page">
      <div className="heading">
        <div>
          <em>MODULE RIÊNG · HỢP ĐỒNG MUA SẮM DỰ ÁN</em>
          <h1>Quản lý hợp đồng mua sắm dự án</h1>
          <p>Theo dõi leadtime thiết bị, DQ/FAT/SAT, thanh toán TT/TTR/LC và hồ sơ thanh toán.</p>
        </div>
        <div className="actions">
          <button className="ghost" onClick={addProject}>＋ Thêm dự án</button>
          <button className="primary" disabled={!selectedProject} onClick={addContract}>＋ Thêm hợp đồng</button>
        </div>
      </div>
      <div className="project-contract-kpis">
        <article><span>Dự án</span><b>{projects.length}</b></article>
        <article><span>Hợp đồng</span><b>{allContracts.length}</b></article>
        <article><span>Giá trị hợp đồng</span><b>{fmt(totalValue)} ₫</b></article>
        <article className={alerts ? "warn" : ""}><span>Lần TT thiếu hồ sơ</span><b>{alerts}</b></article>
      </div>
      <div className="project-contract-layout">
        <aside className="project-tree">
          <div className="project-tree-title">Cây dự án</div>
          {projects.length ? (
            projects.map((project, index) => (
              <button
                key={project.id}
                className={project.id === selectedProject?.id ? "selected" : ""}
                onClick={() => {
                  setSelectedProjectId(project.id);
                  setSelectedContractId(0);
                }}
              >
                <strong>{roman(index)}. {project.name}</strong>
                <small>{project.contracts.length} hợp đồng</small>
              </button>
            ))
          ) : (
            <p>Chưa có dự án. Bấm “Thêm dự án” để bắt đầu.</p>
          )}
        </aside>
        <div className="project-contract-work">
          {selectedProject ? (
            <>
              <section className="project-panel">
                <div className="project-panel-head">
                  <div>
                    <span>DỰ ÁN ĐANG CHỌN</span>
                    <input
                      value={selectedProject.name}
                      onChange={(event) => updateProject({ name: event.target.value })}
                    />
                  </div>
                  <label>
                    Ghi chú dự án
                    <textarea
                      rows={2}
                      value={selectedProject.note}
                      onChange={(event) => updateProject({ note: event.target.value })}
                      placeholder="Ghi chú chung của dự án..."
                    />
                  </label>
                </div>
              </section>
              <div className="contract-browser">
                <section className="contract-index">
                  <label>⌕<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm NCC, số hợp đồng..."/></label>
                  {shownContracts.length ? shownContracts.map((contract) => (
                    <button
                      key={contract.id}
                      className={contract.id === selectedContract?.id ? "selected" : ""}
                      onClick={() => setSelectedContractId(contract.id)}
                    >
                      <b>{contract.contractNo || "Chưa có số HĐ"}</b>
                      <span>{contract.supplierName || "Chưa nhập NCC"}</span>
                      <small>{contract.contractDate || "Chưa có ngày"}</small>
                    </button>
                  )) : <p>Chưa có hợp đồng trong dự án này.</p>}
                </section>
                {selectedContract ? (
                  <ContractEditor
                    contract={selectedContract}
                    onChange={(next) => updateContractList(selectedContract.id, next)}
                    onDelete={() => removeContract(selectedContract.id)}
                    timeline={paymentTimeline}
                    leadtimeTimeline={leadtimeTimeline}
                  />
                ) : (
                  <section className="project-empty">Chọn hoặc thêm hợp đồng để nhập thông tin.</section>
                )}
              </div>
            </>
          ) : (
            <section className="project-empty">Chưa có dự án nào.</section>
          )}
        </div>
      </div>
    </section>
  );
}

function ContractEditor({
  contract,
  onChange,
  onDelete,
  timeline,
  leadtimeTimeline,
}: {
  contract: ProjectContract;
  onChange: (next: ProjectContract) => void;
  onDelete: () => void;
  timeline: { id: number; date: string; title: string; note: string; state: string }[];
  leadtimeTimeline: { id: number; date: string; title: string; note: string; status: string }[];
}) {
  const total = contract.items.reduce((sum, item) => sum + item.qty * item.unitPrice, 0);
  const itemChange = (id: number, patch: Partial<ProjectContractItem>) =>
    onChange({ ...contract, items: contract.items.map((item) => (item.id === id ? { ...item, ...patch } : item)) });
  const milestoneChange = (id: number, patch: Partial<ProjectContractMilestone>) =>
    onChange({
      ...contract,
      milestones: contract.milestones.map((milestone) => (milestone.id === id ? { ...milestone, ...patch } : milestone)),
    });
  const paymentChange = (id: number, patch: Partial<ProjectPayment>) =>
    onChange({
      ...contract,
      payments: contract.payments.map((payment) => (payment.id === id ? { ...payment, ...patch } : payment)),
    });
  return (
    <section className="project-contract-detail">
      <div className="project-contract-card contract-main-info">
        <div className="section-row-head">
          <div><span>THÔNG TIN HỢP ĐỒNG</span><h2>{contract.contractNo || "Hợp đồng mới"}</h2></div>
          <button className="danger-action" onClick={onDelete}>Xóa hợp đồng</button>
        </div>
        <div className="project-form-grid">
          <label>Tên nhà cung cấp<input value={contract.supplierName} onChange={(event) => onChange({ ...contract, supplierName: event.target.value })}/></label>
          <label>Số hợp đồng<input value={contract.contractNo} onChange={(event) => onChange({ ...contract, contractNo: event.target.value })}/></label>
          <label>Ngày hợp đồng<input type="date" value={contract.contractDate} onChange={(event) => onChange({ ...contract, contractDate: event.target.value })}/></label>
          <label className="wide">Link thư mục hồ sơ<input value={contract.folderLink} onChange={(event) => onChange({ ...contract, folderLink: event.target.value })} placeholder="Dán link SharePoint/OneDrive/thư mục hồ sơ..."/></label>
          <label className="wide">Ghi chú hợp đồng<textarea rows={3} value={contract.note} onChange={(event) => onChange({ ...contract, note: event.target.value })} placeholder="Ghi chú điều khoản, phụ lục, điểm cần lưu ý..."/></label>
        </div>
        {contract.folderLink && <a className="folder-link" href={contract.folderLink} target="_blank">Mở thư mục hồ sơ ↗</a>}
      </div>
      <div className="project-contract-card">
        <div className="section-row-head">
          <div><span>DANH SÁCH HÀNG</span><h2>Thiết bị / hàng hóa</h2></div>
          <button onClick={() => onChange({ ...contract, items: [...contract.items, newItem(contract.items.length)] })}>＋ Thêm hàng</button>
        </div>
        <div className="project-items-table">
          <table>
            <thead><tr><th>Tên hàng</th><th>SL</th><th>Đơn giá</th><th>Thành tiền</th><th>Ghi chú</th><th></th></tr></thead>
            <tbody>{contract.items.map((item) => (
              <tr key={item.id}>
                <td><input value={item.name} onChange={(event) => itemChange(item.id, { name: event.target.value })}/></td>
                <td><input type="number" value={item.qty} onChange={(event) => itemChange(item.id, { qty: Number(event.target.value) })}/></td>
                <td><input type="number" value={item.unitPrice} onChange={(event) => itemChange(item.id, { unitPrice: Number(event.target.value) })}/></td>
                <td className="money">{fmt(item.qty * item.unitPrice)} ₫</td>
                <td><input value={item.note} onChange={(event) => itemChange(item.id, { note: event.target.value })}/></td>
                <td><button onClick={() => onChange({ ...contract, items: contract.items.filter((x) => x.id !== item.id) })}>×</button></td>
              </tr>
            ))}</tbody>
            <tfoot><tr><td colSpan={3}>Tổng giá trị</td><td className="money">{fmt(total)} ₫</td><td colSpan={2}></td></tr></tfoot>
          </table>
        </div>
      </div>
      <div className="project-contract-grid">
        <section className="project-contract-card">
          <div className="section-row-head"><div><span>LEADTIME</span><h2>DQ / FAT / SAT / Giao hàng</h2></div></div>
          <VisualTimeline
            empty="Chưa có mốc DQ/FAT/SAT/giao hàng."
            items={leadtimeTimeline.map((event) => ({
              ...event,
              status: event.status as "done" | "doing" | "late" | "todo",
            }))}
          />
          <div className="milestone-list">
            {contract.milestones.map((milestone) => (
              <article key={milestone.id}>
                <b>{milestone.name}</b>
                <label>Kế hoạch<input type="date" value={milestone.plannedDate} onChange={(event) => milestoneChange(milestone.id, { plannedDate: event.target.value })}/></label>
                <label>Thực tế<input type="date" value={milestone.actualDate} onChange={(event) => milestoneChange(milestone.id, { actualDate: event.target.value })}/></label>
                <select value={milestone.status} onChange={(event) => milestoneChange(milestone.id, { status: event.target.value as ProjectContractMilestone["status"] })}>
                  <option>Chưa bắt đầu</option><option>Đang xử lý</option><option>Hoàn thành</option><option>Trễ hạn</option>
                </select>
                <textarea rows={2} value={milestone.note} onChange={(event) => milestoneChange(milestone.id, { note: event.target.value })} placeholder="Ghi chú giai đoạn..."/>
              </article>
            ))}
          </div>
        </section>
        <section className="project-contract-card">
          <div className="section-row-head"><div><span>TIMELINE</span><h2>Thanh toán</h2></div></div>
          <VisualTimeline
            empty="Chưa có mốc thanh toán."
            items={timeline.map((event) => ({
              id: event.id,
              date: event.date,
              title: event.title,
              note: event.note,
              status: event.state === "done" ? "done" : event.state === "late" ? "late" : "todo",
            }))}
          />
        </section>
      </div>
      <div className="project-contract-card">
        <div className="section-row-head">
          <div><span>THANH TOÁN</span><h2>Các lần thanh toán và hồ sơ</h2></div>
          <button onClick={() => onChange({ ...contract, payments: [...contract.payments, newPayment(contract.payments.length)] })}>＋ Thêm lần thanh toán</button>
        </div>
        <div className="payment-stage-list">
          {contract.payments.map((payment) => (
            <PaymentStage
              key={payment.id}
              payment={payment}
              total={total}
              onChange={(next) => paymentChange(payment.id, next)}
              onDelete={() => onChange({ ...contract, payments: contract.payments.filter((x) => x.id !== payment.id) })}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function PaymentStage({
  payment,
  total,
  onChange,
  onDelete,
}: {
  payment: ProjectPayment;
  total: number;
  onChange: (patch: Partial<ProjectPayment>) => void;
  onDelete: () => void;
}) {
  const docChange = (id: number, patch: Partial<ProjectPaymentDoc>) =>
    onChange({ docs: payment.docs.map((doc) => (doc.id === id ? { ...doc, ...patch } : doc)) });
  return (
    <article className="payment-stage">
      <div className="payment-stage-head">
        <input value={payment.phase} onChange={(event) => onChange({ phase: event.target.value })}/>
        <select value={payment.method} onChange={(event) => onChange({ method: event.target.value as ProjectPayment["method"] })}><option>TT</option><option>TTR</option><option>LC</option></select>
        <label><input type="number" value={payment.percent} onChange={(event) => { const percent = Number(event.target.value); onChange({ percent, amount: (total * percent) / 100 }); }}/>%</label>
        <b>{fmt(payment.amount)} ₫</b>
        <select value={payment.status} onChange={(event) => onChange({ status: event.target.value as ProjectPayment["status"] })}><option>Chưa đến hạn</option><option>Đang xử lý</option><option>Đã thanh toán</option><option>Quá hạn</option></select>
        <button onClick={onDelete}>×</button>
      </div>
      <div className="payment-stage-fields">
        <label>Ngày dự kiến TT<input type="date" value={payment.dueDate} onChange={(event) => onChange({ dueDate: event.target.value })}/></label>
        <label>Ngày đã TT<input type="date" value={payment.paidDate} onChange={(event) => onChange({ paidDate: event.target.value })}/></label>
        <label>Điều kiện thanh toán<textarea rows={2} value={payment.condition} onChange={(event) => onChange({ condition: event.target.value })} placeholder="Ví dụ: sau FAT, sau nhận Invoice/Packing list..."/></label>
        <label>Ghi chú lần TT<textarea rows={2} value={payment.note} onChange={(event) => onChange({ note: event.target.value })}/></label>
      </div>
      <div className="payment-docs">
        <div>
          <b>Checklist hồ sơ thanh toán</b>
          <button onClick={() => onChange({ docs: [...payment.docs, { id: Date.now(), name: "Hồ sơ mới", checked: false, status: "Chưa có", note: "" }] })}>＋ Thêm hồ sơ</button>
        </div>
        {payment.docs.map((doc) => (
          <section key={doc.id}>
            <label><input type="checkbox" checked={doc.checked} onChange={(event) => docChange(doc.id, { checked: event.target.checked, status: event.target.checked ? "Đã có" : doc.status })}/></label>
            <input value={doc.name} onChange={(event) => docChange(doc.id, { name: event.target.value })}/>
            <select value={doc.status} onChange={(event) => docChange(doc.id, { status: event.target.value as ProjectPaymentDoc["status"], checked: event.target.value === "Đã có" })}><option>Chưa có</option><option>Đã có</option><option>Cần bổ sung</option></select>
            <input value={doc.note} onChange={(event) => docChange(doc.id, { note: event.target.value })} placeholder="Ghi chú trạng thái hồ sơ..."/>
            <button onClick={() => onChange({ docs: payment.docs.filter((x) => x.id !== doc.id) })}>×</button>
          </section>
        ))}
      </div>
    </article>
  );
}
