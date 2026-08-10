CREATE TABLE IF NOT EXISTS public.employee_webauthn_credentials (
    credential_id           VARCHAR(255) PRIMARY KEY,
    employee_id             BIGINT NOT NULL,
    credential_public_key   TEXT NOT NULL,
    credential_counter      BIGINT NOT NULL DEFAULT 0,
    credential_device_name  VARCHAR(255),
    credential_type         VARCHAR(50) NOT NULL DEFAULT 'public-key',
    transports              JSONB,
    aaguid                  VARCHAR(50),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at              TIMESTAMPTZ,

    CONSTRAINT fk_webauthn_credentials_employee
        FOREIGN KEY (employee_id)
        REFERENCES public.employees(employee_id)
);

DROP TRIGGER IF EXISTS trg_webauthn_credentials_updated_at ON public.employee_webauthn_credentials;

CREATE TRIGGER trg_webauthn_credentials_updated_at
BEFORE UPDATE ON public.employee_webauthn_credentials
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();
