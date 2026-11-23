-- รันใน Supabase > SQL Editor

create table items (
  id bigint generated always as identity primary key,
  name text not null,
  unit text not null default 'ชิ้น',
  stock int not null default 0 check (stock >= 0),
  active boolean not null default true
);

create table requests (
  id bigint generated always as identity primary key,
  item_id bigint not null references items(id),
  qty int not null check (qty > 0),
  employee_code text not null default split_part(coalesce(auth.jwt()->>'email',''), '@', 1),
  user_id uuid not null default auth.uid(),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now()
);

create or replace function is_admin() returns boolean
language sql stable as $$ select coalesce(auth.jwt()->>'email','') = 'hr@local.com' $$;

alter table items enable row level security;
alter table requests enable row level security;

create policy "items read" on items for select to authenticated using (true);
create policy "items admin write" on items for all to authenticated using (is_admin()) with check (is_admin());

create policy "req read own or admin" on requests for select to authenticated using (user_id = auth.uid() or is_admin());
create policy "req insert own" on requests for insert to authenticated with check (user_id = auth.uid() and status = 'pending');

-- อนุมัติ/ปฏิเสธ + ตัดสต็อกในขั้นตอนเดียว
create or replace function decide_request(req_id bigint, approve boolean) returns void
language plpgsql security definer set search_path = public as $$
declare r requests;
begin
  if not is_admin() then raise exception 'ไม่มีสิทธิ์'; end if;
  select * into r from requests where id = req_id and status = 'pending' for update;
  if not found then raise exception 'ไม่พบคำขอที่รออนุมัติ'; end if;
  if approve then
    update items set stock = stock - r.qty where id = r.item_id and stock >= r.qty;
    if not found then raise exception 'สต็อกไม่พอ'; end if;
    update requests set status = 'approved' where id = req_id;
  else
    update requests set status = 'rejected' where id = req_id;
  end if;
end $$;

-- ตัวอย่างของใช้
insert into items (name, unit, stock) values
 ('น้ำยาล้างจาน','ขวด',20), ('ถุงขยะ (ม้วน)','ม้วน',50), ('ไม้ถูพื้น','อัน',10), ('ผ้าไมโครไฟเบอร์','ผืน',30);

-- สิทธิ์ระดับตาราง (RLS ด้านบนยังคุมว่าเห็น/แก้แถวไหนได้)
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on items, requests to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on function decide_request(bigint, boolean) to authenticated;
