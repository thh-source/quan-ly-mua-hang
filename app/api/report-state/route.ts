import {validateShareToken} from "../../share-auth";
async function bindings(){return (await import("cloudflare:workers")).env}

export async function GET(request:Request){
 const token=new URL(request.url).searchParams.get("token")||"";if(!await validateShareToken(token))return Response.json({error:"Link không hợp lệ"},{status:401});const env=await bindings();const row=await env.DB.prepare("SELECT payload,updated_at,version FROM app_state WHERE id=?").bind("procurement").first<{payload:string;updated_at:string;version:number}>();return Response.json({data:row?JSON.parse(row.payload):null,updatedAt:row?.updated_at||null,version:row?.version||0});
}
