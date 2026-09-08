// 공개 배포 시 로컬 주소 혼입과 개인 키 출처 통합을 차단하는지 검증합니다.
import {it,expect} from "vitest";
import {webOrigins} from "../../scripts/web-origins";
it("로컬 기본 설정 유지",()=>expect(webOrigins({}).dashboardOrigin).toBe("http://127.0.0.1:3100"));
it("서버 공개 주소를 빌드에 사용",()=>expect(webOrigins({PUBLIC_ORIGIN:"https://maple.example",WEB_DIRECT_ORIGIN:"https://personal.example"}).dashboardOrigin).toBe("https://maple.example"));
it.each([
 {PUBLIC_ORIGIN:"https://maple.example"},
 {PUBLIC_ORIGIN:"https://maple.example",WEB_DASHBOARD_ORIGIN:"https://other.example",WEB_DIRECT_ORIGIN:"https://personal.example"},
 {WEB_DASHBOARD_ORIGIN:"https://maple.example",WEB_DIRECT_ORIGIN:"https://maple.example"},
 {PUBLIC_ORIGIN:"http://maple.example",WEB_DIRECT_ORIGIN:"https://personal.example"},
 {PUBLIC_ORIGIN:"https://maple.example/path",WEB_DIRECT_ORIGIN:"https://personal.example"},
])("잘못된 공개 설정 거부 %#",env=>expect(()=>webOrigins(env)).toThrow());
