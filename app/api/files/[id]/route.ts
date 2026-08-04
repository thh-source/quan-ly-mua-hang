import {getChatGPTUser} from "../../../chatgpt-auth";

async function bindings(){return (await import("cloudflare:workers")).env}

export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
 const user=await getChatGPTUser();if(!user)return new Response("Yêu cầu đăng nhập",{status:401});
 const env=await bindings(),{id}=await params,admin=user.role==="master"||user.role==="admin";const row=await env.DB.prepare(`SELECT object_key,file_name,content_type FROM files WHERE id=? ${admin?"":"AND owner_user_id=?"}`).bind(...(admin?[id]:[id,user.id])).first<{object_key:string;file_name:string;content_type:string}>();
 if(!row)return new Response("Không tìm thấy file",{status:404});const object=await env.BUCKET.get(row.object_key);if(!object)return new Response("Không tìm thấy file",{status:404});
 const headers=new Headers();object.writeHttpMetadata(headers);headers.set("Content-Type",row.content_type);headers.set("Content-Disposition",`inline; filename*=UTF-8''${encodeURIComponent(row.file_name)}`);headers.set("ETag",object.httpEtag);return new Response(object.body,{headers});
}

export async function DELETE(_request:Request,{params}:{params:Promise<{id:string}>}){
 const user=await getChatGPTUser();if(!user)return Response.json({error:"Yêu cầu đăng nhập"},{status:401});
 const env=await bindings(),{id}=await params,admin=user.role==="master"||user.role==="admin";const row=await env.DB.prepare(`SELECT object_key FROM files WHERE id=? ${admin?"":"AND owner_user_id=?"}`).bind(...(admin?[id]:[id,user.id])).first<{object_key:string}>();
 if(!row)return Response.json({error:"Không tìm thấy file"},{status:404});
 await env.BUCKET.delete(row.object_key);
 await env.DB.prepare(`DELETE FROM files WHERE id=? ${admin?"":"AND owner_user_id=?"}`).bind(...(admin?[id]:[id,user.id])).run();
 return Response.json({ok:true});
}
