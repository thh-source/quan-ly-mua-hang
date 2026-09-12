import {getChatGPTUser} from "../../chatgpt-auth";
import * as XLSX from "xlsx";
import {Buffer} from "node:buffer";

async function bindings(){return (await import("cloudflare:workers")).env as any}

const MAX_FILE_SIZE=20*1024*1024;
const GATEWAY_INLINE_MAX=14*1024*1024;
const ALLOWED_EXTENSIONS=new Set(["pdf","png","jpg","jpeg","webp","docx","xlsx","xls"]);

function extension(name:string){return name.split(".").pop()?.toLowerCase()||""}
function mimeTypeFromName(name:string,provided=""){
 const ext=extension(name);
 const fallback:Record<string,string>={
  pdf:"application/pdf",png:"image/png",jpg:"image/jpeg",jpeg:"image/jpeg",webp:"image/webp",
  docx:"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls:"application/vnd.ms-excel",
 };
 return provided||fallback[ext]||"application/octet-stream";
}
function responseText(payload:any){
 return (payload?.candidates?.[0]?.content?.parts||[])
  .map((part:any)=>typeof part?.text==="string"?part.text:"")
  .join("")
  .trim();
}
function gatewayConfig(env:any){
 const accountId=String(env.CLOUDFLARE_ACCOUNT_ID||"").trim();
 const gatewayId=String(env.CF_AI_GATEWAY_ID||"").trim();
 const token=String(env.CF_AI_GATEWAY_TOKEN||"").trim();
 if(!accountId||!gatewayId||!token)return null;
 return {
  accountId,
  gatewayId,
  token,
  base:`https://gateway.ai.cloudflare.com/v1/${encodeURIComponent(accountId)}/${encodeURIComponent(gatewayId)}/google-ai-studio/v1beta`,
 };
}

function excelToText(bytes:ArrayBuffer){
 const workbook=XLSX.read(new Uint8Array(bytes),{type:"array",cellDates:true});
 const sections:string[]=[];
 for(const sheetName of workbook.SheetNames){
  const sheet=workbook.Sheets[sheetName];
  if(!sheet)continue;
  const csv=XLSX.utils.sheet_to_csv(sheet,{blankrows:false});
  if(csv.trim())sections.push(`### Sheet: ${sheetName}\n${csv.trim()}`);
 }
 const text=sections.join("\n\n");
 if(!text.trim())throw new Error("File Excel không có dữ liệu để phân tích");
 return text.length>180000?`${text.slice(0,180000)}\n\n[Đã cắt bớt dữ liệu vì file quá lớn]`:text;
}

async function uploadGeminiBytes(apiKey:string,name:string,mime:string,bytes:ArrayBuffer){
 const start=await fetch("https://generativelanguage.googleapis.com/upload/v1beta/files",{
  method:"POST",
  headers:{
   "x-goog-api-key":apiKey,
   "X-Goog-Upload-Protocol":"resumable",
   "X-Goog-Upload-Command":"start",
   "X-Goog-Upload-Header-Content-Length":String(bytes.byteLength),
   "X-Goog-Upload-Header-Content-Type":mime,
   "Content-Type":"application/json",
  },
  body:JSON.stringify({file:{display_name:name}}),
 });
 if(!start.ok){
  const detail=await start.text().catch(()=>"");
  throw new Error(detail||`Gemini không khởi tạo được upload (${start.status})`);
 }
 const uploadUrl=start.headers.get("x-goog-upload-url");
 if(!uploadUrl)throw new Error("Gemini không trả về URL upload");
 const uploadedRes=await fetch(uploadUrl,{
  method:"POST",
  headers:{
   "X-Goog-Upload-Offset":"0",
   "X-Goog-Upload-Command":"upload, finalize",
   "Content-Type":mime,
  },
  body:bytes,
 });
 const uploadedText=await uploadedRes.text();
 let uploaded:any={};
 try{uploaded=uploadedText?JSON.parse(uploadedText):{}}catch{}
 if(!uploadedRes.ok||!uploaded?.file?.uri)
  throw new Error(uploaded?.error?.message||uploadedText||`Không thể tải file lên Gemini (${uploadedRes.status})`);
 let info=uploaded.file;
 for(let i=0;i<20&&info?.state==="PROCESSING";i++){
  await new Promise(resolve=>setTimeout(resolve,500));
  if(!info?.name)break;
  const poll=await fetch(`https://generativelanguage.googleapis.com/v1beta/${info.name}`,{headers:{"x-goog-api-key":apiKey}});
  if(!poll.ok)break;
  const next:any=await poll.json().catch(()=>null);
  if(next)info=next;
 }
 if(info?.state==="FAILED")throw new Error("Gemini không xử lý được file này");
 return {uri:info?.uri||uploaded.file.uri,mime:info?.mimeType||mime};
}

async function readChunkedFile(env:any,userId:string,uploadId:string,chunkCount:number,fileSize:number){
 if(!uploadId||!Number.isInteger(chunkCount)||chunkCount<1||chunkCount>64)
  throw new Error("Thông tin file tạm không hợp lệ");
 if(fileSize>MAX_FILE_SIZE)throw new Error("File tối đa 20 MB");
 const parts:Uint8Array[]=[];
 let total=0;
 for(let i=0;i<chunkCount;i++){
  const key=`ai-pr-temp/${userId}/${uploadId}/${i}`;
  const obj=await env.BUCKET.get(key);
  if(!obj)throw new Error(`Thiếu phần file số ${i+1}`);
  const partBytes=new Uint8Array(await obj.arrayBuffer());
  parts.push(partBytes);total+=partBytes.byteLength;
 }
 if(total!==fileSize)throw new Error("File upload chưa đầy đủ, vui lòng thử lại");
 const merged=new Uint8Array(total);
 let offset=0;
 for(const part of parts){merged.set(part,offset);offset+=part.byteLength}
 return merged.buffer;
}
async function cleanupChunks(env:any,userId:string,uploadId:string,chunkCount:number){
 try{
  await Promise.all(Array.from({length:chunkCount},(_,i)=>env.BUCKET.delete(`ai-pr-temp/${userId}/${uploadId}/${i}`)));
 }catch{}
}

export async function POST(request:Request){
 const user=await getChatGPTUser();
 if(!user)return Response.json({error:"Yêu cầu đăng nhập"},{status:401});
 let cleanup:{env:any;uploadId:string;chunkCount:number}|null=null;
 try{
  const env=await bindings();
  const apiKey=String(env.GEMINI_API_KEY||"").trim();
  if(!apiKey)return Response.json({error:"Chưa cấu hình GEMINI_API_KEY trên Cloudflare Worker"},{status:503});
  const gateway=gatewayConfig(env);

  let fileName="",providedMime="",bytes:ArrayBuffer;
  const contentType=request.headers.get("content-type")||"";
  if(contentType.includes("application/json")){
   const body=await request.json() as {uploadId?:string;chunkCount?:number;fileName?:string;fileSize?:number;mimeType?:string};
   fileName=String(body.fileName||"");
   providedMime=String(body.mimeType||"");
   const uploadId=String(body.uploadId||"").replace(/[^a-zA-Z0-9_-]/g,"");
   const chunkCount=Number(body.chunkCount||0),fileSize=Number(body.fileSize||0);
   if(!ALLOWED_EXTENSIONS.has(extension(fileName)))return Response.json({error:"Hỗ trợ PDF, ảnh, Word và Excel"},{status:400});
   bytes=await readChunkedFile(env,user.id,uploadId,chunkCount,fileSize);
   cleanup={env,uploadId,chunkCount};
  }else{
   const form=await request.formData();
   const file=form.get("file");
   if(!(file instanceof File))return Response.json({error:"Thiếu file cần phân tích"},{status:400});
   if(file.size>MAX_FILE_SIZE)return Response.json({error:"File tối đa 20 MB"},{status:413});
   if(!ALLOWED_EXTENSIONS.has(extension(file.name)))return Response.json({error:"Hỗ trợ PDF, ảnh, Word và Excel"},{status:400});
   fileName=file.name;providedMime=file.type;bytes=await file.arrayBuffer();
  }

  const schema={
   type:"object",
   properties:{
    number:{type:"string"},
    date:{type:"string",description:"YYYY-MM-DD nếu xác định được, nếu không để trống"},
    department:{type:"string"},
    purpose:{type:"string"},
    overallConfidence:{type:"number",minimum:0,maximum:1},
    warnings:{type:"array",items:{type:"string"}},
    items:{type:"array",items:{
     type:"object",
     properties:{
      code:{type:"string"},category:{type:"string"},name:{type:"string"},desc:{type:"string"},spec:{type:"string"},unit:{type:"string"},qty:{type:"number"},estimate:{type:"number"},confidence:{type:"number",minimum:0,maximum:1},warning:{type:"string"}
     },
     required:["code","category","name","desc","spec","unit","qty","estimate","confidence","warning"]
    }}
   },
   required:["number","date","department","purpose","overallConfidence","warnings","items"]
  };
  const prompt=`Bạn là trợ lý mua hàng. Hãy đọc nội dung người dùng cung cấp (có thể là scan PDF/ảnh hoặc dữ liệu trích từ Word/Excel không đúng mẫu) và chuyển thành bản nháp PR chuẩn cho hệ thống mua hàng.\n\nQuy tắc:\n- Không bịa dữ liệu. Trường không chắc thì để trống hoặc 0 và ghi cảnh báo.\n- Nhận biết các cách gọi tương đương: SL/Qty/Khối lượng => qty; ĐVT/Unit => unit; mô tả/spec/quy cách phải tách hợp lý.\n- Nếu tài liệu chứa nhiều bảng hoặc nhiều trang, hợp nhất các dòng hàng hóa liên quan.\n- Giữ nguyên tên hàng và thông số quan trọng theo tài liệu gốc, nhưng chuẩn hóa khoảng trắng và cách viết.\n- Ngày trả về YYYY-MM-DD nếu xác định được.\n- confidence từ 0 đến 1 phản ánh độ chắc chắn.\n- Không tự tạo mã hàng giả. Nếu không thấy mã hàng thì code để trống.\n- estimate chỉ điền khi tài liệu thực sự có đơn giá/giá dự kiến.\n- purpose và department chỉ suy ra khi có căn cứ rõ ràng; nếu không để trống.\n- Trả đúng JSON theo schema, không thêm giải thích ngoài JSON.`;

  const ext=extension(fileName);
  let parts:any[];
  if(ext==="xlsx"||ext==="xls"){
   const excelText=excelToText(bytes);
   parts=[{text:`${prompt}\n\nTên file: ${fileName}\n\nDỮ LIỆU EXCEL ĐÃ TRÍCH XUẤT:\n${excelText}`}];
  }else if(gateway && ["pdf","png","jpg","jpeg","webp"].includes(ext)){
   if(bytes.byteLength>GATEWAY_INLINE_MAX){
    return Response.json({error:"PDF/ảnh qua AI Gateway hiện giới hạn 14 MB. Hãy giảm kích thước file rồi thử lại."},{status:413});
   }
   const mime=mimeTypeFromName(fileName,providedMime);
   parts=[
    {inline_data:{mime_type:mime,data:Buffer.from(bytes).toString("base64")}},
    {text:prompt},
   ];
  }else{
   const mime=mimeTypeFromName(fileName,providedMime);
   const uploaded=await uploadGeminiBytes(apiKey,fileName,mime,bytes);
   parts=[{file_data:{mime_type:uploaded.mime,file_uri:uploaded.uri}},{text:prompt}];
  }

  const model=String(env.GEMINI_PR_MODEL||"gemini-2.5-flash").replace(/^models\//,"");
  const base=gateway?.base||"https://generativelanguage.googleapis.com/v1beta";
  const headers:Record<string,string>={"x-goog-api-key":apiKey,"Content-Type":"application/json"};
  if(gateway)headers["cf-aig-authorization"]=`Bearer ${gateway.token}`;

  const aiRes=await fetch(`${base}/models/${encodeURIComponent(model)}:generateContent`,{
   method:"POST",
   headers,
   body:JSON.stringify({
    contents:[{role:"user",parts}],
    generationConfig:{temperature:0.1,responseMimeType:"application/json",responseSchema:schema},
   }),
  });
  const raw=await aiRes.text();
  let ai:any={};try{ai=raw?JSON.parse(raw):{}}catch{}
  if(!aiRes.ok){
   console.error("GEMINI_PR_RESPONSE_ERROR",raw);
   if(aiRes.status===401&&gateway)return Response.json({error:"AI Gateway từ chối token. Kiểm tra CF_AI_GATEWAY_TOKEN và quyền AI Gateway: Run."},{status:401});
   if(aiRes.status===429)return Response.json({error:"Gemini đã hết hạn mức tạm thời. Hãy chờ rồi thử lại hoặc kiểm tra quota của project."},{status:429});
   if(aiRes.status===403)return Response.json({error:"Gemini/AI Gateway chưa được cấp quyền phù hợp. Kiểm tra API key, gateway token và quyền Run."},{status:403});
   return Response.json({error:ai?.error?.message||ai?.message||raw||"Gemini chưa phân tích được file này"},{status:502});
  }
  const text=responseText(ai);
  if(!text)return Response.json({error:"Gemini không trả về dữ liệu PR"},{status:502});
  let draft:any;
  try{draft=JSON.parse(text)}catch{console.error("GEMINI_PR_JSON_ERROR",text);return Response.json({error:"Kết quả Gemini không đúng định dạng JSON"},{status:502})}
  return Response.json({ok:true,draft,model,provider:"gemini",via:gateway?"cloudflare-ai-gateway":"direct",fileName});
 }catch(error){
  console.error("GEMINI_PR_IMPORT_ERROR",error);
  return Response.json({error:error instanceof Error?error.message:"Không thể phân tích file"},{status:500});
 }finally{
  if(cleanup)await cleanupChunks(cleanup.env,user.id,cleanup.uploadId,cleanup.chunkCount);
 }
}
