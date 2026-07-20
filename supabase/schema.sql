create table if not exists toast_labor_shifts (
  id            uuid default gen_random_uuid() primary key,
  toast_entry_id text unique not null,
  store_id      text,
  employee_id   text,
  employee_name text,
  job_title     text,
  clock_in      timestamptz,
  clock_out     timestamptz,
  hours         numeric,
  raw_data      jsonb,
  synced_at     timestamptz default now()
);

create index if not exists idx_labor_store   on toast_labor_shifts (store_id);
create index if not exists idx_labor_clockin on toast_labor_shifts (clock_in);
