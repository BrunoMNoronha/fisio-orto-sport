/** @jest-environment node */
jest.mock("server-only", () => ({}));

import { CONFLICT_MESSAGE } from "../rules";
import { RETRY_LATER, ruleFailure } from "../service";

describe("ruleFailure", () => {
  it("traduz sobreposição e deadlock em mensagens; o resto propaga", () => {
    expect(ruleFailure({ message: 'violates exclusion constraint "Appointment_no_overlap"' })).toEqual({
      fieldErrors: { startTime: [CONFLICT_MESSAGE] },
    });
    const deadlock = Object.assign(new Error("Transaction failed due to a write conflict or a deadlock"), { code: "P2034" });
    expect(ruleFailure(deadlock)).toBe(RETRY_LATER);
    expect(ruleFailure(new Error("x"))).toBeNull();
  });
});
