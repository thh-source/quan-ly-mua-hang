import {getChatGPTUser} from "../../chatgpt-auth";

async function bindings(){return (await import("cloudflare:workers")).env as Record<string,unknown>}

const MAX_FILE_SIZE=20*1024*1024;
const ALLOWED_EXTENSIONS=new Set(["pdf","png","jpg","jpeg","webp","docx","xlsx","xls"]);

function extension(name:string){return name.split(".").pop()?.toLowerCase()||""}

function responseText(payload:any){
 if(typeof payload?.output_text==="string"&&payload.output_text.trim())return payload.output_text.trim();
 for(const item of payload?.output||[]){
  for(const part of item?.content||[]){
   if(typeof part?.text==="string"&&part.text.trim())return part.text.trim();
  }
 }
 return "";
}

export async function POST(request:Request){
 const user=await getChatGPTUser();
 if(!user)return Response.json({error:"Yêu cầu đăng nhập"},{status:401});
 try{
  const env=await bindings();
  const apiKey=String(env.OPENAI_API_KEY||"").trim();
  if(!apiKey)return Response.json({error:"Chưa cấu hình OPENAI_API_KEY trên Cloudflare Worker"},{status:503});

  const form=await request.formData();
  const file=form.get("file");
  if(!(file instanceof File))return Response.json({error:"Thiếu file cần phân tích"},{status:400});
  if(file.size>MAX_FILE_SIZE)return Response.json({error:"File tối đa 20 MB"},{status:413});
  if(!ALLOWED_EXTENSIONS.has(extension(file.name)))return Response.json({error:"Hỗ trợ PDF, ảnh, Word và Excel"},{status:400});

  const upload=new FormData();
  upload.set("purpose","user_data");
  upload.set("file",file,file.name);
  const fileRes=await fetch("https://api.openai.com/v1/files",{
   method:"POST",
   headers:{Authorization:`Bearer ${apiKey}`},
   body:upload,
  });
  const uploaded:any=await fileRes.json();
  if(!fileRes.ok||!uploaded?.id){
   console.error("AI_PR_FILE_UPLOAD_ERROR",uploaded);
   return Response.json({error:"Không thể gửi file tới AI để phân tích"},{status:502});
  }

  const schema={
   type:"object",
   additionalProperties:false,
   properties:{
    number:{type:"string"},
    date:{type:"string",description:"YYYY-MM-DD nếu xác định được, nếu không để trống"},
    department:{type:"string"},
    purpose:{type:"string"},
    overallConfidence:{type:"number",minimum:0,maximum:1},
    warnings:{type:"array",items:{type:"string"}},
    items:{type:"array",items:{
     type:"object",additionalProperties:false,
     properties:{
      code:{type:"string"},category:{type:"string"},name:{type:"string"},desc:{type:"string"},spec:{type:"string"},unit:{type:"string"},qty:{type:"number"},estimate:{type:"number"},confidence:{type:"number",minimum:0,maximum:1},warning:{type:"string"}
     },
     required:["code","category","name","desc","spec","unit","qty","estimate","confidence","warning"]
    }}
   },
   required:["number","date","department","purpose","overallConfidence","warnings","items"]
  };

  const prompt=`Bạn là trợ lý mua hàng. Hãy đọc file người dùng cung cấp (có thể là scan PDF/ảnh, Word tự do hoặc Excel không đúng mẫu) và chuyển thành bản nháp PR chuẩn cho hệ thống mua hàng.\n\nQuy tắc:\n- Không bịa dữ liệu. Trường không chắc thì để trống hoặc 0 và ghi cảnh báo.\n- Nhận biết các cách gọi tương đương: SL/Qty/Khối lượng => qty; ĐVT/Unit => unit; mô tả/spec/quy cách phải tách hợp lý.\n- Nếu file chứa nhiều bảng hoặc nhiều trang, hợp nhất các dòng hàng hóa liên quan.\n- Giữ nguyên tên hàng và thông số quan trọng theo tài liệu gốc, nhưng chuẩn hóa khoảng trắng và cách viết.\n- Ngày trả về YYYY-MM-DD nếu xác định được.\n- confidence từ 0 đến 1 phản ánh độ chắc chắn.\n- Không tự tạo mã hàng giả. Nếu không thấy mã hàng thì code để trống.\n- estimate chỉ điền khi tài liệu thực sự có đơn giá/giá dự kiến.\n- purpose và department suy ra từ ngữ cảnh nếu có căn cứ rõ ràng; nếu không thì để trống.\n\nChỉ trả dữ liệu theo schema đã yêu cầu.`;

  const model=String(env.OPENAI_PR_MODEL||"gpt-5.6-terra");
  const aiRes=await fetch("https://api.openai.com/v1/responses",{
   method:"POST",
   headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json"},
   body:JSON.stringify({
    model,
    input:[{role:"user",content:[{type:"input_text",text:prompt},{type:"input_file",file_id:uploaded.id}]}],
    text:{format:{type:"json_schema",name:"pr_draft",schema,strict:true}},
   }),
  });
  const ai:any=await aiRes.json();
  if(!aiRes.ok){
   console.error("AI_PR_RESPONSE_ERROR",ai);
   return Response.json({error:ai?.error?.message||"AI chưa phân tích được file này"},{status:502});
  }
  const text=responseText(ai);
  if(!text)return Response.json({error:"AI không trả về dữ liệu PR"},{status:502});
  let draft:any;
  try{draft=JSON.parse(text)}catch{console.error("AI_PR_JSON_ERROR",text);return Response.json({error:"Kết quả AI không đúng định dạng"},{status:502})}
  return Response.json({ok:true,draft,model,fileName:file.name});
 }catch(error){
  console.error("AI_PR_IMPORT_ERROR",error);
  return Response.json({error:error instanceof Error?error.message:"Không thể phân tích file"},{status:500});
 }
}
