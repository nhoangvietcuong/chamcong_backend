-- Migration: Allow 'NO_GPS' in ck_attendance_risk and ck_logs_risk constraints
ALTER TABLE public.attendance DROP CONSTRAINT IF EXISTS ck_attendance_risk;
ALTER TABLE public.attendance ADD CONSTRAINT ck_attendance_risk CHECK (
  risk_level IS NULL OR risk_level IN ('LOW', 'MEDIUM', 'HIGH', 'NO_GPS')
);

ALTER TABLE public.attendance_location_logs DROP CONSTRAINT IF EXISTS ck_logs_risk;
ALTER TABLE public.attendance_location_logs ADD CONSTRAINT ck_logs_risk CHECK (
  risk_level IS NULL OR risk_level IN ('LOW', 'MEDIUM', 'HIGH', 'NO_GPS')
);

