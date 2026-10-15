-- FIN-03: filtro por data efetiva e paginação estável do relatório global de recebimentos.
-- O índice existente começa por chargeId e atende o histórico de uma cobrança, não essa leitura.
CREATE INDEX "Payment_receivedOn_createdAt_id_idx"
  ON "Payment" ("receivedOn" DESC, "createdAt" DESC, "id" DESC);
