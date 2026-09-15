// 공개 주소 이전 시 설정 전달 URL과 잘못된 입력 처리를 검증합니다.
import {describe,expect,it} from "vitest";
import {decodeMigration,migrationUrl} from "./originMigration";

describe("정식 도메인 설정 이전",()=>{
 it("대표와 즐겨찾기를 서버에 보내지 않는 URL 조각으로 옮김",()=>{const url=migrationUrl(new URL("https://app.guildmate.workers.dev/#favorites"),{primary:"엘크라우치",favorites:["친구"]}),parsed=new URL(url);expect(parsed.origin).toBe("https://guildfollow.com");expect(parsed.search).toBe("");expect(decodeMigration(parsed.hash)).toEqual({profile:{primary:"엘크라우치",favorites:["친구"]},view:"favorites"});});
 it("일반 해시와 손상된 데이터는 무시",()=>{expect(decodeMigration("#guild")).toBeNull();expect(decodeMigration("#profile-transfer=%ED")).toBeNull();});
});
