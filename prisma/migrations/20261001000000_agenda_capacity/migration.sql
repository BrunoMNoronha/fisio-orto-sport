BEGIN;
ALTER TABLE "ClinicSettings" ADD COLUMN "maxSimultaneousAppointments" INTEGER NOT NULL DEFAULT 3;
ALTER TABLE "ClinicSettings" ADD CONSTRAINT "ClinicSettings_capacity_positive" CHECK ("maxSimultaneousAppointments" >= 1);
ALTER TABLE "Appointment" DROP CONSTRAINT "Appointment_no_overlap";

-- Locks antes de locks de linha: configurações exclusivas, agenda compartilhada.
-- A configuração e as escritas da agenda têm uma ordem total de confirmação.
CREATE FUNCTION agenda_capacity_settings_lock() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('agenda:capacity', 0));
  RETURN NULL;
END $$;
CREATE TRIGGER "ClinicSettings_capacity_lock" BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE
ON "ClinicSettings" FOR EACH STATEMENT EXECUTE FUNCTION agenda_capacity_settings_lock();

CREATE FUNCTION agenda_capacity_statement_lock() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- O SELECT da função VOLATILE usa snapshot novo após aguardar o advisory lock.
  -- Não aceitar escritores com snapshot fixo que poderiam consultar ocupação antiga.
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'A agenda exige isolamento READ COMMITTED' USING ERRCODE = '25000';
  END IF;
  PERFORM pg_advisory_xact_lock_shared(hashtextextended('agenda:capacity', 0));
  RETURN NULL;
END $$;
CREATE TRIGGER "Appointment_capacity_lock" BEFORE INSERT OR UPDATE OR DELETE
ON "Appointment" FOR EACH STATEMENT EXECUTE FUNCTION agenda_capacity_statement_lock();

CREATE FUNCTION agenda_check_capacity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE capacity integer; occupied integer;
BEGIN
  IF NEW.status <> 'AGENDADO' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF (NEW."professionalId", NEW."startsAt", NEW."endsAt", NEW.status)
       IS NOT DISTINCT FROM (OLD."professionalId", OLD."startsAt", OLD."endsAt", OLD.status)
    THEN RETURN NEW; END IF;
  END IF;
  -- Mesmo lock do serviço, inclusive para SQL direto, seed e ferramentas administrativas.
  IF TG_OP = 'UPDATE' AND OLD."professionalId" <> NEW."professionalId" THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('agenda:' || id, 0))
    FROM unnest(ARRAY[OLD."professionalId", NEW."professionalId"]) AS id ORDER BY id;
  ELSE
    PERFORM pg_advisory_xact_lock(hashtextextended('agenda:' || NEW."professionalId", 0));
  END IF;
  SELECT COALESCE((SELECT "maxSimultaneousAppointments" FROM "ClinicSettings" WHERE id = 1), 3) INTO capacity;
  WITH events AS (
    SELECT greatest(a."startsAt", NEW."startsAt") AS at, 1 AS delta
    FROM "Appointment" a WHERE a."professionalId" = NEW."professionalId" AND a.status = 'AGENDADO'
      AND a.id <> NEW.id AND a."startsAt" < NEW."endsAt" AND a."endsAt" > NEW."startsAt"
    UNION ALL
    SELECT least(a."endsAt", NEW."endsAt"), -1
    FROM "Appointment" a WHERE a."professionalId" = NEW."professionalId" AND a.status = 'AGENDADO'
      AND a.id <> NEW.id AND a."startsAt" < NEW."endsAt" AND a."endsAt" > NEW."startsAt"
  ), counts AS (
    SELECT sum(sum(delta)) OVER (ORDER BY at) AS n FROM events GROUP BY at
  ) SELECT COALESCE(max(n), 0) INTO occupied FROM counts;
  IF occupied >= capacity THEN
    RAISE EXCEPTION 'Appointment_capacity: limite de agendamentos simultâneos atingido'
      USING ERRCODE = '23P01', CONSTRAINT = 'Appointment_capacity';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "Appointment_capacity" BEFORE INSERT OR UPDATE ON "Appointment"
FOR EACH ROW EXECUTE FUNCTION agenda_check_capacity();
COMMIT;
