-- Migration to add Web Push Notifications support
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  subscription_id SERIAL PRIMARY KEY,
  employee_id INT REFERENCES public.employees(employee_id) ON DELETE CASCADE,
  subscription_json JSONB NOT NULL,
  device_name VARCHAR(100),
  browser VARCHAR(50),
  is_active BOOLEAN DEFAULT TRUE,
  last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.notification_history (
  history_id SERIAL PRIMARY KEY,
  employee_id INT REFERENCES public.employees(employee_id) ON DELETE CASCADE,
  notification_type VARCHAR(50) NOT NULL, -- 'SHIFT_REMINDER', 'GPS_GEOFENCE'
  target_date DATE NOT NULL,
  sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_emp_type_date UNIQUE (employee_id, notification_type, target_date)
);
