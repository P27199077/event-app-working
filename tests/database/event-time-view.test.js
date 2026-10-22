import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("selected-time SQL exposes only approved active events and keeps public table rules intact", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create table public.events (
      id uuid primary key, organizer_id uuid, title text, category text, area text, room text,
      host text, description text, link text, starts_at timestamptz, ends_at timestamptz,
      longitude double precision, latitude double precision, status text, revision bigint default 1
    );
    alter table public.events enable row level security;
    grant select on public.events to anon,authenticated;
    create policy live_only on public.events for select using (status='published' and starts_at <= now() and ends_at > now());
    create table public.event_requests(title text, review_status text);
    revoke all on public.event_requests from anon,authenticated;
    insert into public.event_requests values ('Private request','pending');
    insert into public.events values
    ('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','First event','Workshop','Academic block','F101','Club','Details','','2030-01-01 10:00+05:30','2030-01-01 11:00+05:30',78.57,17.54,'published',1),
    ('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','Second event','Workshop','Academic block','F102','Club','Details','','2030-01-01 10:30+05:30','2030-01-01 11:30+05:30',78.57,17.54,'published',2),
    ('10000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000001','Cancelled event','Workshop','Academic block','F103','Club','Details','','2030-01-01 10:00+05:30','2030-01-01 12:00+05:30',78.57,17.54,'cancelled',1);
  `);
  const sql = await readFile(
    new URL("../../supabase/event-time-view.sql", import.meta.url),
    "utf8",
  );
  await db.exec(sql);
  await db.exec(sql); // Running the upgrade again preserves data and permissions.
  await db.exec("set role anon");
  const query = (at, size = 500, offset = 0) =>
    db.query("select * from public.events_at_time($1,$2,$3)", [
      at,
      size,
      offset,
    ]);
  await t.test(
    "returns both overlapping events, with organizer IDs omitted for visitors",
    async () => {
      const { rows } = await query("2030-01-01T10:45:00+05:30");
      assert.deepEqual(
        rows.map((row) => row.title),
        ["First event", "Second event"],
      );
      assert.ok(rows.every((row) => row.organizer_id === null));
      assert.equal(
        (await db.query("select * from public.events")).rows.length,
        0,
      );
      await assert.rejects(
        db.query("select * from public.event_requests"),
        (error) => error.code === "42501",
      );
      await assert.rejects(
        db.query("update public.events set title='Changed'"),
        (error) => error.code === "42501",
      );
    },
  );
  await t.test(
    "honors starts inclusive, ends exclusive, offsets and equivalent timezones",
    async () => {
      assert.equal((await query("2030-01-01T09:59:59+05:30")).rows.length, 0);
      assert.deepEqual(
        (await query("2030-01-01T10:00:00+05:30")).rows.map((row) => row.title),
        ["First event"],
      );
      assert.deepEqual(
        (await query("2030-01-01T11:00:00+05:30")).rows.map((row) => row.title),
        ["Second event"],
      );
      assert.equal((await query("2030-01-01T11:30:00+05:30")).rows.length, 0);
      assert.deepEqual(
        (await query("2030-01-01T05:15:00Z", 1, 1)).rows.map(
          (row) => row.title,
        ),
        ["Second event"],
      );
    },
  );
  await t.test("rejects invalid times and unbounded page sizes", async () => {
    for (const args of [
      [null],
      ["infinity"],
      ["-infinity"],
      ["2030-01-01", 0],
      ["2030-01-01", 501],
      ["2030-01-01", 500, -1],
    ])
      await assert.rejects(query(...args), (error) => error.code === "22023");
  });
  await t.test(
    "signed-in visitors only get their own creator ID and cancelled events stay excluded",
    async () => {
      await db.exec(
        "reset role; set role authenticated; select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000001',false)",
      );
      const { rows } = await query("2030-01-01T10:45:00+05:30");
      assert.equal(rows.length, 2);
      assert.equal(
        rows[0].organizer_id,
        "20000000-0000-4000-8000-000000000001",
      );
      assert.equal(rows[1].organizer_id, null);
    },
  );
});
