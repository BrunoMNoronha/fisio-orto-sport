/** @jest-environment node */
import { safeRedirectPath } from "../redirect-path";

describe("safeRedirectPath", () => {
  it.each([
    ["/usuarios", "/usuarios"],
    ["/usuarios?x=1", "/usuarios?x=1"],
    ["https://malicioso.com", "/"],
    ["//malicioso.com", "/"],
    ["/\\malicioso.com", "/"],
    ["/login", "/"],
    [null, "/"],
    [undefined, "/"],
  ])("%p → %p", (input, expected) => {
    expect(safeRedirectPath(input)).toBe(expected);
  });
});
