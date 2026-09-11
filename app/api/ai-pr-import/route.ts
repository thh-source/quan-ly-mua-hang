import {getChatGPTUser} from "../../chatgpt-auth";

async function bindings(){return (await import("cloudflare:workers")).env as Record<string,unknown>}

const MAX_FILE_SIZE=20*1024*1024;
const ALLOWED_EXTENSIONS=new Set(["pdf","png","jpg","jpeg","webp","docx","xlsx","xls"]);

function extension(name:string){return name.split(".").pop()?.toLowerCase()||""}
function mimeType(file:File){
 const ext=extension(file.name);
 const fallback:Record<string,string>={
  pdf:"application/pdf",png:"image/png",jpg:"image/jpeg",jpeg:"image/jpeg",webp:"image/webp",
  docx:"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls:"application/vnd.ms-excel",
 };
 return file.type||fallback[ext]||"application/octet-stream";
}
function responseText(payload:any){
 return (payload?.candidates?.[0]?.content?.parts||[])
  .map((part:any)=>typeof part?.text==="string"?part.text:"")
  .join("")
  .trim();
}
async function uploadGeminiFile(apiKey:string,file:File){
 const mime=mimeType(file),bytes=await file.arrayBuffer();
 const start=await fetch("https://generativelanguage.googleapis.com/upload/v1beta/files",{
  method:"POST",
  headers:{
   "x-goog-api-key":apiKey,
   "X-Goog-Upload-Protocol":"resumable",
   "X-Goog-Upload-Command":"start",
   "X-Goog-Upload-Header-Content-Length":String(file.size),
   "X-Goog-Upload-Header-Content-Type":mime,
   "Content-Type":"application/json",
  },
  body:JSON.stringify({file:{display_name:file.name}}),
 });
 if(!start.ok)throw new Error(`Gemini không khởi tạo được upload (${start.status})`);
 const uploadUrl=start.headers.get("x-goog-upload-url");
 if(!uploadUrl)throw new Error("Gemini không trả về URL upload");
 const uploadedRes=await fetch(uploadUrl,{
  method:"POST",
  headers:{
   "Content-Length":String(file.size),
   "X-Goog-Upload-Offset":"0",
   "X-Goog-Upload-Command":"upload, finalize",
  },
  body:bytes,
 });
 const uploaded:any=await uploadedRes.json().catch(()=>({}));
 if(!uploadedRes.ok||!uploaded?.file?.uri)throw new Error(uploaded?.error?.message||"Không thể tải file lên Gemini");
 let info=uploaded.file;
 for(let i=0;i<10&&info?.state==="PROCESSING";i++){
  await new Promise(resolve=>setTimeout(resolve,300));
  if(!info?.name)break;
  const poll=await fetch(`https://generativelanguage.googleapis.com/v1beta/${info.name}`,{headers:{"x-goog-api-key":apiKey}});
  if(!poll.ok)break;
  const next:any=await poll.json().catch(()=>null);
  if(next)info=next;
 }
 if(info?.state==="FAILED")throw new Error("Gemini không xử lý được file này");
 return {uri:info?.uri||uploaded.file.uri,mime:info?.mimeType||mime};
}

export async function POST(request:Request){
 const user=await getChatGPTUser();
 if(!user)return Response.json({error:"Yêu cầu đăng nhập"},{status:401});
 try{
  const env=await bindings();
  const apiKey=String(env.GEMINI_API_KEY||"").trim();
  if(!apiKey)return Response.json({error:"Chưa cấu hình GEMINI_API_KEY trên Cloudflare Worker"},{status:503});

  const form=await request.formData();
  const file=form.get("file");
  if(!(file instanceof File))return Response.json({error:"Thiếu file cần phân tích"},{status:400});
  if(file.size>MAX_FILE_SIZE)return Response.json({error:"File tối đa 20 MB"},{status:413});
  if(!ALLOWED_EXTENSIONS.has(extension(file.name)))return Response.json({error:"Hỗ trợ PDF, ảnh, Word và Excel"},{status:400});

  const uploaded=await uploadGeminiFile(apiKey,file);
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

  const prompt=`Bạn là trợ lý mua hàng. Hãy đọc file người dùng cung cấp (có thể là scan PDF/ảnh, Word tự do hoặc Excel không đúng mẫu) và chuyển thành bản nháp PR chuẩn cho hệ thống mua hàng.\n\nQuy tắc:\n- Không bịa dữ liệu. Trường không chắc thì để trống hoặc 0 và ghi cảnh báo.\n- Nhận biết các cách gọi tương đương: SL/Qty/Khối lượng => qty; ĐVT/Unit => unit; mô tả/spec/quy cách phải tách hợp lý.\n- Nếu file chứa nhiều bảng hoặc nhiều trang, hợp nhất các dòng hàng hóa liên quan.\n- Giữ nguyên tên hàng và thông số quan trọng theo tài liệu gốc, nhưng chuẩn hóa khoảng trắng và cách viết.\n- Ngày trả về YYYY-MM-DD nếu xác định được.\n- confidence từ 0 đến 1 phản ánh độ chắc chắn.\n- Không tự tạo mã hàng giả. Nếu không thấy mã hàng thì code để trống.\n- estimate chỉ điền khi tài liệu thực sự có đơn giá/giá dự kiến.\n- purpose và department chỉ suy ra khi có căn cứ rõ ràng; nếu không để trống.\n- Trả đúng JSON theo schema, không thêm giải thích ngoài JSON.`;

  const model=String(env.GEMINI_PR_MODEL||"gemini-3.7-flash");
  const aiRes=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,{
   method:"POST",
   headers:{"x-goog-api-key":apiKey,"Content-Type":"application/json"},
   body:JSON.stringify({
    contents:[{role:"user",parts:[{file_data:{mime_type:uploaded.mime,file_uri:uploaded.uri}},{text:prompt}]}],
    generationConfig:{
     temperature:0.1,
     responseFormat:{text:{mimeType:"application/json",schema}},
    },
   }),
  });
  const ai:any=await aiRes.json().catch(()=>({}));
  if(!aiRes.ok){
   console.error("GEMINI_PR_RESPONSE_ERROR",ai);
   if(aiRes.status===429)return Response.json({error:"Gemini đã hết hạn mức tạm thời. Hãy chờ rồi thử lại hoặc kiểm tra quota của project."},{status:429});
   if(aiRes.status===403)return Response.json({error:"Gemini API chưa được cấp quyền cho project/API key này. Kiểm tra API key, project và hạn mức Free Tier."},{status:403});
   return Response.json({error:ai?.error?.message||"Gemini chưa phân tích được file này"},{status:502});
  }
  const text=responseText(ai);
  if(!text)return Response.json({error:"Gemini không trả về dữ liệu PR"},{status:502});
  let draft:any;
  try{draft=JSON.parse(text)}catch{console.error("GEMINI_PR_JSON_ERROR",text);return Response.json({error:"Kết quả Gemini không đúng định dạng JSON"},{status:502})}
  return Response.json({ok:true,draft,model,provider:"gemini",fileName:file.name});
 }catch(error){
  console.error("GEMINI_PR_IMPORT_ERROR",error);
  return Response.json({error:error instanceof Error?error.message:"Không thể phân tích file"},{status:500});
 }
}
