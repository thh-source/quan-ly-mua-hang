import {getChatGPTUser} from "../../../chatgpt-auth";

async function bindings(){return (await import("cloudflare:workers")).env as any}

const MAX_CHUNK_SIZE=2*1024*1024;

export async function POST(request:Request){
 const user=await getChatGPTUser();
 if(!user)return Response.json({error:"Yêu cầu đăng nhập"},{status:401});
 try{
  const form=await request.formData();
  const chunk=form.get("chunk");
  const uploadId=String(form.get("uploadId")||"").replace(/[^a-zA-Z0-9_-]/g,"");
  const index=Number(form.get("index"));
  if(!(chunk instanceof File)||!uploadId||!Number.isInteger(index)||index<0)
   return Response.json({error:"Dữ liệu upload không hợp lệ"},{status:400});
  if(chunk.size>MAX_CHUNK_SIZE)return Response.json({error:"Chunk vượt quá 2 MB"},{status:413});
  const env=await bindings();
  const key=`ai-pr-temp/${user.id}/${uploadId}/${index}`;
  await env.BUCKET.put(key,chunk.stream(),{httpMetadata:{contentType:"application/octet-stream"}});
  return Response.json({ok:true,index});
 }catch(error){
  console.error("AI_PR_CHUNK_UPLOAD_ERROR",error);
  return Response.json({error:error instanceof Error?error.message:"Không thể tải phần file"},{status:500});
 }
}
