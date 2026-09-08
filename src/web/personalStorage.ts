// 브라우저 저장 차단 시에도 개인 키의 메모리 조회를 허용합니다.
export function readPersonal(name:string){try{return localStorage.getItem(name);}catch{return null;}}
export function writePersonal(name:string,value:string|null){
 try{if(value===null)localStorage.removeItem(name);else localStorage.setItem(name,value);return true;}
 catch{return false;}
}
