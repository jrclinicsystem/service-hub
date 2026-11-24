import { describe, expect, test } from "vitest";
import { categorySlug, validateCategoryName } from "./category";

const existing = [{ id: "odontologia", name: "Odontologia" }];

describe("nova especialidade", () => {
  test("nome é obrigatório", () => {
    expect(validateCategoryName("   ", existing)).toBe("Informe o nome da especialidade.");
  });
  test("duplicidade ignora acentos, maiúsculas e espaços", () => {
    expect(validateCategoryName("  ODONTOLOGÍA ", existing)).toBe("Já existe uma especialidade com esse nome.");
  });
  test("nome novo é aceito e gera identificador estável", () => {
    expect(validateCategoryName("Estética Facial", existing)).toBeNull();
    expect(categorySlug("Estética  Facial")).toBe("estetica-facial");
  });
});
