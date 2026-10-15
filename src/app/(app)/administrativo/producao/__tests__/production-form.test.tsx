jest.mock("@/modules/administrativo/production-actions",()=>({saveProductionAction:jest.fn()}));
import { render,screen,fireEvent,waitFor } from "@testing-library/react";
import { ProductionForm } from "../production-form";
import { saveProductionAction } from "@/modules/administrativo/production-actions";
it('botão confere com operação explícita e mantém os campos após erro',async()=>{
 (saveProductionAction as jest.Mock).mockResolvedValue({error:'Conflito: recarregue.'});
 render(<ProductionForm id="item" sessionId="sessao" requestId="envio" version={1} state="PENDENTE" coverageId="c" procedureId="p" quantity={2} coverages={[{id:'c',cardNumber:'0001',contractId:'ct',contract:{name:'CONTRATO SINTETICO'}}]} procedures={[{id:'p',code:'0001',name:'PROCEDIMENTO SINTETICO',contractId:'ct'}]} authorizationItems={[]}/>);
 fireEvent.change(screen.getByLabelText('Motivo'),{target:{value:'Conferência sintética'}});
 fireEvent.click(screen.getByRole('button',{name:'Conferir produção'}));
 await waitFor(()=>expect(saveProductionAction).toHaveBeenCalled());
 const form=(saveProductionAction as jest.Mock).mock.calls[0][1] as FormData;
 expect(form.get('operation')).toBe('CONFERIR');expect(form.get('quantity')).toBe('2');
 expect(await screen.findByRole('alert')).toHaveTextContent('Conflito');expect(screen.getByLabelText('Motivo')).toHaveValue('Conferência sintética');
});
