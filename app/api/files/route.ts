import {getChatGPTUser} from "../../chatgpt-auth";
import {resolveWorkspace} from "../../state-store";

async function bindings(){return (await import("cloudflare:workers")).env}

async function ensureFiles(){const env=await bindings();await env.DB.prepare("CREATE TABLE IF NOT EXISTS files (id TEXT PRIMARY KEY, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, file_name TEXT NOT NULL, object_key TEXT NOT NULL, content_type TEXT NOT NULL, size INTEGER NOT NULL, uploaded_at TEXT NOT NULL, owner_user_id TEXT, document_type TEXT, expires_at TEXT, status TEXT, note TEXT)").run();for(const sql of["ALTER TABLE files ADD COLUMN owner_user_id TEXT","ALTER TABLE files ADD COLUMN document_type TEXT","ALTER TABLE files ADD COLUMN expires_at TEXT","ALTER TABLE files ADD COLUMN status TEXT","ALTER TABLE files ADD COLUMN note TEXT"]){try{await env.DB.prepare(sql).run()}catch{}}}

export async function GET(request:Request){
 const user=await getChatGPTUser();if(!user)return Response.json({error:"Yêu cầu đăng nhập"},{status:401});
 await ensureFiles();const env=await bindings(),url=new URL(request.url),entityType=url.searchParams.get("entityType"),entityId=url.searchParams.get("entityId"),workspaceId=await resolveWorkspace(user,url.searchParams.get("workspace"));
 const select="SELECT id,entity_type AS entityType,entity_id AS entityId,file_name AS fileName,content_type AS contentType,size,uploaded_at AS uploadedAt,document_type AS documentType,expires_at AS expiresAt,status,note FROM files";
 const result=entityType&&entityId?await env.DB.prepare(`${select} WHERE owner_user_id=? AND entity_type=? AND entity_id=? ORDER BY uploaded_at DESC`).bind(workspaceId,entityType,entityId).all():await env.DB.prepare(`${select} WHERE owner_user_id=? ORDER BY uploaded_at DESC LIMIT 200`).bind(workspaceId).all();
 return Response.json({files:result.results});
}

export async function POST(request:Request){
 const user=await getChatGPTUser();if(!user)return Response.json({error:"Yêu cầu đăng nhập"},{status:401});
 await ensureFiles();const env=await bindings(),form=await request.formData(),file=form.get("file"),entityType=String(form.get("entityType")||"general"),entityId=String(form.get("entityId")||"0"),workspaceId=await resolveWorkspace(user,String(form.get("workspaceId")||"")),documentType=String(form.get("documentType")||"Hồ sơ"),expiresAt=String(form.get("expiresAt")||""),status=String(form.get("status")||"Đã nhận"),note=String(form.get("note")||"");
 if(!(file instanceof File))return Response.json({error:"Thiếu file"},{status:400});
 if(file.size>25*1024*1024)return Response.json({error:"File tối đa 25 MB"},{status:413});
 const id=crypto.randomUUID(),safe=file.name.replace(/[^a-zA-Z0-9._-]/g,"_"),key=`${workspaceId}/${entityType}/${entityId}/${id}-${safe}`,now=new Date().toISOString();
 await env.BUCKET.put(key,file.stream(),{httpMetadata:{contentType:file.type||"application/octet-stream"},customMetadata:{originalName:file.name,entityType,entityId}});
 await env.DB.prepare("INSERT INTO files (id,entity_type,entity_id,file_name,object_key,content_type,size,uploaded_at,owner_user_id,document_type,expires_at,status,note) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(id,entityType,entityId,file.name,key,file.type||"application/octet-stream",file.size,now,workspaceId,documentType,expiresAt,status,note).run();
 return Response.json({ok:true,id,fileName:file.name,uploadedAt:now});
}
