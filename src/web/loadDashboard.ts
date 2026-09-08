// 조회 성공 시 조회 오류만 해제하고 실패 시 마지막 정상 데이터를 보존합니다.
export async function loadDashboard<T>(request:()=>Promise<T>, apply:(data:T)=>void, setError:(message:string)=>void){
 try{const data=await request();apply(data);setError("");}
 catch(error){setError(String(error));}
}
