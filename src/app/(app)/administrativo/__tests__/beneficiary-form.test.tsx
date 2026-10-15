jest.mock("@/modules/administrativo/beneficiary-actions",()=>({saveCoverage:jest.fn(),saveAuthorization:jest.fn(),saveAuthorizationItem:jest.fn(),saveProcedureRule:jest.fn()}));
import {render,screen,fireEvent} from "@testing-library/react";
import {saveCoverage} from "@/modules/administrativo/beneficiary-actions";
import {BeneficiaryForm} from "../beneficiary-form";
it("mantém carteira/data e associa erro ao campo sem perder contexto",async()=>{
  (saveCoverage as jest.Mock).mockResolvedValue({error:"Corrija",fieldErrors:{cardNumber:["Informe a carteira"]}});
  render(<BeneficiaryForm kind="coverage" id="c" requestId="r" version={1} hidden={{patientId:"p",contractId:"ct"}} initial={{beneficiaryName:"Teste",active:"true"}} cancelHref="/" />);
  fireEvent.change(screen.getByLabelText("Carteirinha *"),{target:{value:"000123"}});
  fireEvent.input(screen.getByLabelText("Início da cobertura *"),{target:{value:"2026-01-01"}});
  fireEvent.change(screen.getByLabelText("Motivo do registro ou alteração *"),{target:{value:"Registro"}});
  fireEvent.submit(screen.getByRole("button",{name:"Salvar"}).closest("form")!);
  expect(await screen.findByRole("alert")).toHaveTextContent("Corrija");
  expect(screen.getByLabelText("Carteirinha *")).toHaveValue("000123");
  expect(screen.getByLabelText("Início da cobertura *")).toHaveValue("2026-01-01");
  const fd=(saveCoverage as jest.Mock).mock.calls[0][1] as FormData;expect(fd.get("patientId")).toBe("p");expect(fd.get("expectedVersion")).toBe("1");
  expect(screen.getByLabelText("Carteirinha *")).toHaveAttribute("aria-describedby","coverage-c-cardNumber-error");
});
it("cada formulário associa motivo ao seu próprio campo quando há dois na mesma página",()=>{
  render(<><BeneficiaryForm kind="item" id="i" requestId="ri" version={0} hidden={{}} initial={{}} cancelHref="/" />
    <BeneficiaryForm kind="rule" id="r" requestId="rr" version={0} hidden={{}} initial={{}} cancelHref="/" /></>);
  const reasons=screen.getAllByLabelText("Motivo do registro ou alteração *");
  expect(reasons).toHaveLength(2);expect(reasons[0].id).not.toBe(reasons[1].id);
});
it("mantém seleção nativa da regra ao preencher o motivo",()=>{
  render(<BeneficiaryForm kind="rule" id="r" requestId="rr" version={1} hidden={{}} initial={{mode:"EXIGIDA"}} cancelHref="/" />);
  fireEvent.input(screen.getByLabelText("Exigência de autorização"),{target:{value:"DISPENSADA"}});
  fireEvent.change(screen.getByLabelText("Motivo do registro ou alteração *"),{target:{value:"Dispensa confirmada"}});
  expect(screen.getByLabelText("Exigência de autorização")).toHaveValue("DISPENSADA");
});
