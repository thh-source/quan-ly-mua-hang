import {getChatGPTUser} from "../../chatgpt-auth";

async function bindings(){return (await import("cloudflare:workers")).env}

async function ensureSchema(){
 const env=await bindings();
 await env.DB.batch([
  env.DB.prepare("CREATE TABLE IF NOT EXISTS app_state (id TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1)"),
  env.DB.prepare("CREATE TABLE IF NOT EXISTS audit_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, action TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, created_at TEXT NOT NULL)"),
  env.DB.prepare("CREATE TABLE IF NOT EXISTS files (id TEXT PRIMARY KEY, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, file_name TEXT NOT NULL, object_key TEXT NOT NULL, content_type TEXT NOT NULL, size INTEGER NOT NULL, uploaded_at TEXT NOT NULL)"),
 ]);
}

export async function GET(request:Request){
 const user=await getChatGPTUser();if(!user)return Response.json({error:"Không có quyền truy cập"},{status:401});
 await ensureSchema();
 const env=await bindings();
 const row=await env.DB.prepare("SELECT payload, updated_at, version FROM app_state WHERE id = ?").bind("procurement").first<{payload:string;updated_at:string;version:number}>();
 if(!row)return Response.json({data:null,updatedAt:null,version:0});
 return Response.json({data:JSON.parse(row.payload),updatedAt:row.updated_at,version:row.version});
}

export async function PUT(request:Request){
 const user=await getChatGPTUser();if(!user)return Response.json({error:"Yêu cầu đăng nhập"},{status:401});
 await ensureSchema();
 const env=await bindings();
 const data=await request.json();
 const now=new Date().toISOString(),payload=JSON.stringify(data);
 if(payload.length>1_800_000)return Response.json({error:"Dữ liệu vượt giới hạn cho phép"},{status:413});
 await env.DB.batch([
  env.DB.prepare("INSERT INTO app_state (id,payload,updated_at,version) VALUES (?,?,?,1) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at,version=app_state.version+1").bind("procurement",payload,now),
  env.DB.prepare("INSERT INTO audit_logs (action,entity_type,entity_id,created_at) VALUES (?,?,?,?)").bind("SAVE","application","procurement",now),
 ]);
 return Response.json({ok:true,updatedAt:now});
}
