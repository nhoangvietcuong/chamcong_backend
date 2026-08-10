-- Migration to add offline review columns to attendance table
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS review_status VARCHAR(20) DEFAULT 'NOT_REQUIRED';
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS reviewed_by BIGINT;
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS review_note TEXT;
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS risk_level VARCHAR(20) DEFAULT 'LOW';
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS trust_score NUMERIC(5,2);

-- Drop existing constraints if they exist
ALTER TABLE public.attendance DROP CONSTRAINT IF EXISTS ck_attendance_review_consistency;

-- Add check constraints
ALTER TABLE public.attendance ADD CONSTRAINT ck_attendance_review_consistency
CHECK (
    (
        attendance_status = 'REVIEW_REQUIRED'
        AND review_status = 'PENDING'
    )
    OR (
        attendance_status IN ('COMPLETED', 'NORMAL', 'LATE', 'LEFT_EARLY', 'LATE_AND_LEFT_EARLY', 'OVERTIME', 'IN_PROGRESS')
        AND review_status IN ('NOT_REQUIRED', 'APPROVED')
    )
    OR (
        attendance_status = 'INVALID'
        AND review_status = 'REJECTED'
    )
);
