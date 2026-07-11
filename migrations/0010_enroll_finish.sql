-- M8.2: plan enrollment (single active plan + weekday schedule) and explicit workout finish.
ALTER TABLE plans ADD COLUMN enrolledAt TEXT;
ALTER TABLE plans ADD COLUMN schedule TEXT;
ALTER TABLE sessions ADD COLUMN finishedAt TEXT;
