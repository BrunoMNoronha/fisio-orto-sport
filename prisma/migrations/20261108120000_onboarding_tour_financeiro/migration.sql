-- Tour de apresentação do financeiro na página inicial: instante em que cada usuário concluiu ou
-- pulou a apresentação. Nulo = ainda não viu. Aditiva: nenhuma linha existente muda de valor.
ALTER TABLE "User" ADD COLUMN "financeTourSeenAt" TIMESTAMP(3);
