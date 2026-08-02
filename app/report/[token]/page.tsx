import ProcurementApp from "../../ProcurementApp";
import {validateShareToken} from "../../share-auth";

export const dynamic="force-dynamic";
export default async function ReportPage({params}:{params:Promise<{token:string}>}){const {token}=await params,valid=await validateShareToken(token,true);if(!valid)return <main className="invalid-share"><div><i>!</i><h1>Link báo cáo không hợp lệ</h1><p>Đường dẫn đã hết hạn, bị thu hồi hoặc không tồn tại.</p></div></main>;return <ProcurementApp reportToken={token}/>}
