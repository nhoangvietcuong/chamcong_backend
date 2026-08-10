-- Migration: Multi-Location Assignments and Shift Selection

-- 1. Create junction table assignment_locations
CREATE TABLE IF NOT EXISTS public.assignment_locations (
    assignment_id BIGINT NOT NULL REFERENCES public.employee_work_assignments(assignment_id) ON DELETE CASCADE,
    location_id   BIGINT NOT NULL REFERENCES public.work_locations(location_id) ON DELETE CASCADE,
    PRIMARY KEY (assignment_id, location_id)
);

CREATE INDEX IF NOT EXISTS idx_assignment_locations_loc ON public.assignment_locations(location_id);

-- 2. Migrate existing assignments to the junction table
INSERT INTO public.assignment_locations (assignment_id, location_id)
SELECT assignment_id, location_id 
FROM public.employee_work_assignments
ON CONFLICT (assignment_id, location_id) DO NOTHING;

-- 3. Make location_id nullable in employee_work_assignments for backward compatibility/future multi-locations
ALTER TABLE public.employee_work_assignments ALTER COLUMN location_id DROP NOT NULL;

-- 4. Add matched_location_id to attendance
ALTER TABLE public.attendance 
ADD COLUMN IF NOT EXISTS matched_location_id BIGINT REFERENCES public.work_locations(location_id) ON DELETE SET NULL;

-- 5. Add display_order to work_shifts
ALTER TABLE public.work_shifts 
ADD COLUMN IF NOT EXISTS display_order INTEGER NOT NULL DEFAULT 0;

-- 6. Ensure shift_code is UNIQUE
ALTER TABLE public.work_shifts 
DROP CONSTRAINT IF EXISTS uq_work_shifts_code,
ADD CONSTRAINT uq_work_shifts_code UNIQUE (shift_code);

-- 7. Insert the 2 required work shifts (Ca 1 & Ca 2)
INSERT INTO public.work_shifts (shift_code, shift_name, start_time, end_time, late_grace_minutes, early_leave_grace_minutes, minimum_work_minutes, is_active, display_order)
VALUES 
('CA_1', 'Ca 1 (08:00 - 17:30)', '08:00:00', '17:30:00', 10, 10, 480, 1, 1),
('CA_2', 'Ca 2 (13:30 - 21:30)', '13:30:00', '21:30:00', 10, 10, 480, 1, 2)
ON CONFLICT (shift_code) DO UPDATE 
SET shift_name = EXCLUDED.shift_name,
    start_time = EXCLUDED.start_time,
    end_time = EXCLUDED.end_time,
    late_grace_minutes = EXCLUDED.late_grace_minutes,
    early_leave_grace_minutes = EXCLUDED.early_leave_grace_minutes,
    minimum_work_minutes = EXCLUDED.minimum_work_minutes,
    is_active = 1,
    display_order = EXCLUDED.display_order;

DELETE FROM public.work_shifts WHERE shift_code NOT IN ('CA_1', 'CA_2');
