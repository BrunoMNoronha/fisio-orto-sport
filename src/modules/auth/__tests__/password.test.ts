/** @jest-environment node */
import { hashPassword, verifyPassword } from "../password";

describe("hash de senha (scrypt)", () => {
  it("verifica a senha correta e recusa a errada", async () => {
    const hash = await hashPassword("senha-forte-123");
    expect(hash).toMatch(/^scrypt\$32768\$8\$1\$/);
    await expect(verifyPassword("senha-forte-123", hash)).resolves.toBe(true);
    await expect(verifyPassword("senha-errada", hash)).resolves.toBe(false);
  });

  it("gera salts diferentes para a mesma senha", async () => {
    expect(await hashPassword("abcdefgh")).not.toBe(await hashPassword("abcdefgh"));
  });

  it("recusa hash malformado ou com parâmetros abusivos", async () => {
    await expect(verifyPassword("x", "texto-qualquer")).resolves.toBe(false);
    await expect(verifyPassword("x", "scrypt$99999999999$8$1$AAAA$AAAA")).resolves.toBe(false);
  });
});
