create table users (
  id serial primary key,
  email text unique not null,
  password_hash text not null,
  created_at timestamptz default now()
);

create table datasets (
  id serial primary key,
  owner_id int not null references users(id) on delete cascade,
  name text not null,
  labels text[] not null default '{Reliable,Misleading,False}',
  created_at timestamptz default now()
);

create table samples (
  id serial primary key,
  dataset_id int not null references datasets(id) on delete cascade,
  text text not null
);

create table annotations (
  id serial primary key,
  sample_id int not null references samples(id) on delete cascade,
  user_id int not null references users(id) on delete cascade,
  label text not null,
  created_at timestamptz default now(),
  unique (sample_id, user_id)
);

-- session store table for connect-pg-simple
create table "session" (
  "sid" varchar not null primary key,
  "sess" json not null,
  "expire" timestamp(6) not null
);
create index "IDX_session_expire" on "session" ("expire");