// 경험치와 날짜 표시 함수의 경계값을 검증합니다.
import { describe, expect, it } from "vitest";
import { formatExp, shortDate } from "./format";

describe("formatExp", () => {
  it("formats null as unavailable", () => expect(formatExp(null)).toBe("—"));
  it("formats large Korean units", () => expect(formatExp(125_000_000)).toBe("1.25억"));
  it("keeps positive sign for gaps", () => expect(formatExp(50_000, true)).toBe("+5만"));
});

describe("shortDate", () => {
  it("uses a Korean month and day", () => expect(shortDate("2026-08-19")).toBe("8월 19일"));
});
