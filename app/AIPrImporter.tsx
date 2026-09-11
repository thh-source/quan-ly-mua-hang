"use client";

import {useEffect,useMemo,useRef,useState} from "react";
import "./ai-pr-importer.css";

type AIItem={code:string;category:string;name:string;desc:string;spec:string;unit:string;qty:number;estimate:number;confidence:number;warning:string};
type AIDraft={number:string;date:string;department:string;purpose:string;overallConfidence:number;warnings:string[];items:AIItem[]};

const normalize=(value:string)=>value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/đ/g,"d").replace(/Đ/g,"D").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
const MAX_FILE_SIZE=20*1024*1024;
const CHUNK_SIZE=1024*1024;

function setControlValue(control:HTMLInputElement|HTMLTextAreaElement,value:string){
 const proto=control instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
 const setter=Object.getOwnPropertyDescriptor(proto,"value")?.set;
 setter?.call(control,value);
 control.dispatchEvent(new Event("input",{bubbles:true}));
 control.dispatchEvent(new Event("change",{bubbles:true}));
}
function fieldByLabel(root:ParentNode,labelText:string){
 const wanted=normalize(labelText);
 const label=Array.from(root.querySelectorAll("label")).find(el=>normalize(el.textContent||"").includes(wanted));
 return label?.querySelector<HTMLInputElement|HTMLTextAreaElement>("input,textarea")||null;
}
function applyDraftToPage(draft:AIDraft){
 const page=document.querySelector<HTMLElement>(".create-page");
 if(!page)throw new Error("Hãy mở màn hình Tạo PR trước khi áp dụng.");
 const number=fieldByLabel(page,"Số PR"),date=fieldByLabel(page,"Ngày PR"),department=fieldByLabel(page,"Đơn vị"),purpose=fieldByLabel(page,"Mục đích sử dụng");
 if(number)setControlValue(number,draft.number||"");
 if(date)setControlValue(date,draft.date||"");
 if(department)setControlValue(department,draft.department||"");
 if(purpose)setControlValue(purpose,draft.purpose||"");
 const table=page.querySelector<HTMLTableElement>(".draft-table table");
 if(!table)throw new Error("Không tìm thấy bảng hàng hóa của PR.");
 const addButton=Array.from(page.querySelectorAll<HTMLButtonElement>("button")).find(btn=>normalize(btn.textContent||"").includes("them dong hang hoa"));
 while((table.tBodies[0]?.rows.length||0)<draft.items.length){if(!addButton)throw new Error("Không tìm thấy nút thêm dòng hàng hóa.");addButton.click();}
 const headers=Array.from(table.tHead?.rows[0]?.cells||[]).map(cell=>normalize(cell.textContent||""));
 const find=(...labels:string[])=>headers.findIndex(h=>labels.some(label=>h.includes(normalize(label))));
 const indexes={code:find("Mã hàng"),category:find("Phân loại"),name:find("Tên vật tư hàng hóa"),desc:find("Mô tả kỹ thuật"),spec:find("Quy cách"),unit:find("ĐVT"),qty:find("Số lượng"),estimate:find("Đơn giá dự kiến")};
 const rows=Array.from(table.tBodies[0]?.rows||[]);
 draft.items.forEach((item,rowIndex)=>{const row=rows[rowIndex];if(!row)return;const values:Record<keyof typeof indexes,string>={code:item.code||"",category:item.category||"",name:item.name||"",desc:item.desc||"",spec:item.spec||"",unit:item.unit||"",qty:String(item.qty??0),estimate:String(item.estimate??0)};(Object.keys(indexes) as Array<keyof typeof indexes>).forEach(key=>{const idx=indexes[key];if(idx<0)return;const control=row.cells[idx]?.querySelector<HTMLInputElement|HTMLTextAreaElement>("input,textarea");if(control)setControlValue(control,values[key]);});});
 page.scrollIntoView({behavior:"smooth",block:"start"});
}

async function jsonOrError(res:Response){
 const text=await res.text();
 let data:any={};
 try{data=text?JSON.parse(text):{}}catch{}
 if(!res.ok)throw new Error(data?.error||text||`Lỗi máy chủ (${res.status})`);
 return data;
}

export default function AIPrImporter(){
 const [open,setOpen]=useState(false),[file,setFile]=useState<File|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(""),[draft,setDraft]=useState<AIDraft|null>(null),[fileName,setFileName]=useState(""),[progress,setProgress]=useState(0);
 const fileRef=useRef<HTMLInputElement>(null);
 const confidence=useMemo(()=>draft?Math.round((draft.overallConfidence||0)*100):0,[draft]);

 useEffect(()=>{const mount=()=>{const page=document.querySelector<HTMLElement>(".create-page");if(!page)return;const actions=page.querySelector<HTMLElement>(".heading .actions");if(!actions||actions.querySelector(".ai-pr-launch"))return;const button=document.createElement("button");button.type="button";button.className="ghost ai-pr-launch";button.innerHTML="✦ AI đọc file tạo PR";button.addEventListener("click",()=>setOpen(true));actions.insertBefore(button,actions.firstChild);};mount();const observer=new MutationObserver(()=>requestAnimationFrame(mount));observer.observe(document.body,{childList:true,subtree:true});return()=>observer.disconnect();},[]);

 const analyze=async()=>{
  if(!file||busy)return;
  if(file.size>MAX_FILE_SIZE){setError("File tối đa 20 MB. Hãy giảm dung lượng file rồi thử lại.");return;}
  setBusy(true);setError("");setDraft(null);setProgress(0);
  try{
   const uploadId=crypto.randomUUID();
   const chunkCount=Math.ceil(file.size/CHUNK_SIZE);
   for(let i=0;i<chunkCount;i++){
    const blob=file.slice(i*CHUNK_SIZE,Math.min(file.size,(i+1)*CHUNK_SIZE));
    const part=new File([blob],`${file.name}.part-${i}`,{type:"application/octet-stream"});
    const form=new FormData();form.set("uploadId",uploadId);form.set("index",String(i));form.set("chunk",part);
    const res=await fetch("/api/ai-pr-import/chunk",{method:"POST",body:form});
    await jsonOrError(res);
    setProgress(Math.round(((i+1)/chunkCount)*70));
   }
   const res=await fetch("/api/ai-pr-import",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({uploadId,chunkCount,fileName:file.name,fileSize:file.size,mimeType:file.type})});
   setProgress(85);
   const data=await jsonOrError(res) as {draft?:AIDraft;fileName?:string};
   if(!data.draft)throw new Error("AI chưa phân tích được file.");
   setDraft(data.draft);setFileName(data.fileName||file.name);setProgress(100);
  }catch(e){setError(e instanceof Error?e.message:"Không thể phân tích file.");}finally{setBusy(false)}
 };

 const updateHeader=(key:keyof Pick<AIDraft,"number"|"date"|"department"|"purpose">,value:string)=>setDraft(d=>d?{...d,[key]:value}:d);
 const updateItem=(index:number,key:keyof AIItem,value:string|number)=>setDraft(d=>d?{...d,items:d.items.map((item,i)=>i===index?{...item,[key]:value}:item)}:d);
 const apply=()=>{if(!draft)return;const hasExisting=Array.from(document.querySelectorAll<HTMLInputElement|HTMLTextAreaElement>(".create-page .draft-table tbody input,.create-page .draft-table tbody textarea")).some(el=>el.value.trim());if(hasExisting&&!window.confirm("Bảng PR đang có dữ liệu. Áp dụng AI sẽ ghi đè các dòng đầu tiên. Tiếp tục?"))return;try{applyDraftToPage(draft);setOpen(false);}catch(e){setError(e instanceof Error?e.message:"Không thể áp dụng dữ liệu vào PR.")}};

 return <>{open&&<div className="ai-pr-backdrop" onMouseDown={()=>!busy&&setOpen(false)}><div className="ai-pr-modal" onMouseDown={e=>e.stopPropagation()}>
  <div className="ai-pr-head"><div><span>AI IMPORT PR</span><h2>Đọc file bất kỳ → PR chuẩn</h2><p>PDF scan, ảnh, Word hoặc Excel không cần đúng mẫu.</p></div><button onClick={()=>!busy&&setOpen(false)}>×</button></div>
  {!draft?<div className="ai-pr-upload">
   <input ref={fileRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.docx,.xlsx,.xls" hidden onChange={e=>{const next=e.target.files?.[0]||null;setFile(next);setError(next&&next.size>MAX_FILE_SIZE?"File tối đa 20 MB. Hãy giảm dung lượng file rồi thử lại.":"");setProgress(0)}}/>
   <button className="ai-pr-drop" onClick={()=>fileRef.current?.click()}><b>{file?file.name:"Chọn file cần AI phân tích"}</b><small>PDF / JPG / PNG / DOCX / XLSX · tối đa 20 MB</small></button>
   {busy&&<div style={{marginTop:12,fontSize:12,color:"#48637f"}}>Đang tải và phân tích… {progress}%</div>}
   <div className="ai-pr-actions"><button className="ghost" onClick={()=>setOpen(false)} disabled={busy}>Hủy</button><button className="primary" disabled={!file||busy||file.size>MAX_FILE_SIZE} onClick={()=>void analyze()}>{busy?"AI đang đọc tài liệu...":"✦ Phân tích và tạo PR nháp"}</button></div>
  </div>:<div className="ai-pr-review">
   <div className="ai-pr-score"><div><b>{confidence}%</b><span>Độ tin cậy tổng thể</span></div><p><strong>{fileName}</strong><br/>Kiểm tra các ô màu vàng trước khi áp dụng.</p></div>
   {!!draft.warnings?.length&&<div className="ai-pr-warnings">{draft.warnings.map((w,i)=><span key={i}>⚠ {w}</span>)}</div>}
   <div className="ai-pr-fields"><label>Số PR<input value={draft.number} onChange={e=>updateHeader("number",e.target.value)}/></label><label>Ngày PR<input type="date" value={draft.date} onChange={e=>updateHeader("date",e.target.value)}/></label><label>Đơn vị<input value={draft.department} onChange={e=>updateHeader("department",e.target.value)}/></label><label className="wide">Mục đích sử dụng<textarea rows={2} value={draft.purpose} onChange={e=>updateHeader("purpose",e.target.value)}/></label></div>
   <div className="ai-pr-table"><table><thead><tr><th>#</th><th>Mã hàng</th><th>Tên hàng</th><th>Mô tả kỹ thuật</th><th>Quy cách</th><th>ĐVT</th><th>SL</th><th>Đơn giá dự kiến</th><th>AI</th></tr></thead><tbody>{draft.items.map((item,i)=><tr key={i} className={item.confidence<.75?"uncertain":""}><td>{i+1}</td><td><input value={item.code} onChange={e=>updateItem(i,"code",e.target.value)}/></td><td><textarea rows={2} value={item.name} onChange={e=>updateItem(i,"name",e.target.value)}/></td><td><textarea rows={2} value={item.desc} onChange={e=>updateItem(i,"desc",e.target.value)}/></td><td><textarea rows={2} value={item.spec} onChange={e=>updateItem(i,"spec",e.target.value)}/></td><td><input value={item.unit} onChange={e=>updateItem(i,"unit",e.target.value)}/></td><td><input type="number" value={item.qty} onChange={e=>updateItem(i,"qty",Number(e.target.value))}/></td><td><input type="number" value={item.estimate} onChange={e=>updateItem(i,"estimate",Number(e.target.value))}/></td><td title={item.warning||""}><b>{Math.round(item.confidence*100)}%</b>{item.warning&&<small>⚠</small>}</td></tr>)}</tbody></table></div>
   <div className="ai-pr-actions"><button className="ghost" onClick={()=>{setDraft(null);setError("");setProgress(0)}}>← Chọn file khác</button><button className="primary" onClick={apply}>Áp dụng vào form PR</button></div>
  </div>}
  {error&&<div className="ai-pr-error">{error}</div>}
 </div></div>}</>;
}
