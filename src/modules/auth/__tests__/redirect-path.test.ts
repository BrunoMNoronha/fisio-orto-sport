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
    ["/login?next=/x", "/"],
    ["/\t/evil.com", "/"],
    ["/\n/evil.com", "/"],
    ["/%09/evil.com", "/%09/evil.com"],
    ["/ /evil.com", "/"],
    ["/../usuarios", "/usuarios"],
    ["", "/"],
    ["/" + "a".repeat(600), "/"],
    [null, "/"],
    [undefined, "/"],
  ])("%p → %p", (input, expected) => {
    expect(safeRedirectPath(input)).toBe(expected);
  });
});
