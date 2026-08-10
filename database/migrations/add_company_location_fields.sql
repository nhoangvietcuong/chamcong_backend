-- Migration: Add company location fields to work_locations and attendance tables
ALTER TABLE public.work_locations 
ADD COLUMN IF NOT EXISTS is_company_location BOOLEAN DEFAULT FALSE;

ALTER TABLE public.attendance 
ADD COLUMN IF NOT EXISTS actual_check_in_location_id BIGINT;

-- Add foreign key constraint for actual_check_in_location_id referencing work_locations
ALTER TABLE public.attendance
DROP CONSTRAINT IF EXISTS fk_attendance_actual_location,
ADD CONSTRAINT fk_attendance_actual_location
FOREIGN KEY (actual_check_in_location_id)
REFERENCES public.work_locations(location_id);
