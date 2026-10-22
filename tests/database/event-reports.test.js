import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
const owner = "00000000-0000-4000-8000-000000000001";
const reviewer = "00000000-0000-4000-8000-000000000002";
const eid = (n) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const bid = (n) => `20000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const rid = (n) => `30000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const fixture = `
create role anon nologin;
create role authenticated nologin;
create schema auth;
create schema private;
create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth to anon,authenticated;
create function public.is_organizer() returns boolean language sql stable security definer as $$ select exists(select 1 from auth.users where id=auth.uid()) $$;
create table public.events (
 id uuid primary key,organizer_id uuid references auth.users(id), title text not null,
 category text not null,area text not null,room text not null,host text not null,
 description text not null,link text not null default '',starts_at timestamptz not null,
 ends_at timestamptz not null,longitude double precision not null,latitude double precision not null,
 status text not null default 'published' check(status in ('published','cancelled')),
 check(ends_at>starts_at)
);
alter table public.events enable row level security;
grant select on public.events to anon,authenticated;
grant update(title,category,area,room,host,description,link,starts_at,ends_at,longitude,latitude,status) on public.events to authenticated;
create policy events_edit on public.events for update to authenticated using(organizer_id=auth.uid() and public.is_organizer()) with check(organizer_id=auth.uid() and public.is_organizer());
`;
test("real report SQL enforces submission, private review, cancellation and limits", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(fixture);
  await db.query(
    "insert into auth.users values ($1,'owner@example.test',now()),($2,'reviewer@example.test',now())",
    [owner, reviewer],
  );
  await db.exec(
    await readFile(
      new URL("../../supabase/owner-management.sql", import.meta.url),
      "utf8",
    ),
  );
  await db.exec(
    "insert into private.owner_emails values ('owner@example.test')",
  );
  await db.exec(
    await readFile(
      new URL("../../supabase/event-reports.sql", import.meta.url),
      "utf8",
    ),
  );
  for (let n = 1; n <= 14; n++)
    await db.query(
      `insert into public.events(id,organizer_id,title,category,area,room,host,description,starts_at,ends_at,longitude,latitude,status)
 values($1,$2,$3,'Workshop','Academic block','F101','Test club','Details',now()+($4::text||' minutes')::interval,now()+($5::text||' minutes')::interval,78.5708,17.5448,$6)`,
      [
        eid(n),
        reviewer,
        `Event ${n}`,
        n === 2 ? 30 : n === 3 ? -120 : -30,
        n === 2 ? 90 : n === 3 ? -60 : 60,
        n === 4 ? "cancelled" : "published",
      ],
    );
  async function as(role, id, fn) {
    await db.exec(`set role ${role}`);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      id || "",
    ]);
    try {
      return await fn();
    } finally {
      await db.exec(
        "reset role; select set_config('request.jwt.claim.sub','',false)",
      );
    }
  }
  const send = (
    id,
    browser,
    event,
    reason = "Wrong location",
    details = "It moved to F103.",
  ) =>
    db.query("select public.submit_event_report($1,$2,$3,$4,$5) as id", [
      id,
      browser,
      event,
      reason,
      details,
    ]);
  const review = (id, action, revision = 1, note = "Checked") =>
    db.query("select public.review_event_report($1,$2,$3,$4)", [
      id,
      action,
      revision,
      note,
    ]);
  await t.test(
    "anonymous reports use the actual title, retries deduplicate, and reports do not hide events",
    async () => {
      const first = await as("anon", null, () => send(rid(1), bid(1), eid(1)));
      assert.equal(first.rows[0].id, rid(1));
      assert.equal(
        (await as("anon", null, () => send(rid(1), bid(1), eid(1)))).rows[0].id,
        rid(1),
      );
      assert.equal(
        (await as("anon", null, () => send(rid(2), bid(1), eid(1)))).rows[0].id,
        rid(1),
      );
      const stored = (
        await db.query(
          "select event_title,reporter_hash,status from public.event_reports where id=$1",
          [rid(1)],
        )
      ).rows[0];
      assert.equal(stored.event_title, "Event 1");
      assert.equal(stored.status, "open");
      assert.notEqual(stored.reporter_hash, bid(1));
      assert.equal(
        (
          await db.query(
            "select count(*)::int as count from public.event_reports",
          )
        ).rows[0].count,
        1,
      );
      assert.equal(
        (
          await db.query("select status from public.events where id=$1", [
            eid(1),
          ])
        ).rows[0].status,
        "published",
      );
    },
  );
  await t.test(
    "visitors cannot read or directly change reports and non-owner reviewers cannot review them",
    async () => {
      await assert.rejects(
        as("anon", null, () => db.query("select * from public.event_reports")),
        (e) => e.code === "42501",
      );
      await assert.rejects(
        as("anon", null, () => review(rid(1), "cancel")),
        (e) => e.code === "42501",
      );
      assert.equal(
        (
          await as("authenticated", reviewer, () =>
            db.query("select * from public.event_reports"),
          )
        ).rows.length,
        0,
      );
      await assert.rejects(
        as("authenticated", reviewer, () => review(rid(1), "resolve")),
        (e) => e.code === "42501",
      );
      await assert.rejects(
        as("authenticated", owner, () =>
          db.query("update public.event_reports set status='resolved'"),
        ),
        (e) => e.code === "42501",
      );
      assert.equal(
        (
          await as("authenticated", owner, () =>
            db.query("select id from public.event_reports"),
          )
        ).rows.length,
        1,
      );
    },
  );
  await t.test(
    "invalid details and reports for non-live events are rejected",
    async () => {
      for (const [reason, details] of [
        ["Other", "  "],
        ["Wrong location", "a".repeat(501)],
        ["invalid", "Details"],
      ])
        await assert.rejects(
          as("anon", null, () => send(rid(3), bid(3), eid(1), reason, details)),
          (e) => e.code === "22023",
        );
      for (const event of [eid(2), eid(3), eid(4), eid(999)])
        await assert.rejects(
          as("anon", null, () => send(rid(3), bid(3), event)),
          (e) => e.code === "P0002",
        );
    },
  );
  await t.test(
    "owner cancellation checks revision, cancels the real event and resolves all its open reports atomically",
    async () => {
      await as("anon", null, () => send(rid(4), bid(4), eid(1)));
      await assert.rejects(
        as("authenticated", owner, () => review(rid(1), "cancel", 0)),
        (e) => e.code === "40001",
      );
      assert.equal(
        (
          await db.query(
            "select count(*)::int as count from public.event_reports where status='open'",
          )
        ).rows[0].count,
        2,
      );
      await as("authenticated", owner, () =>
        review(rid(1), "cancel", 1, "Event stopped by organizer"),
      );
      const event = (
        await db.query(
          "select status,revision from public.events where id=$1",
          [eid(1)],
        )
      ).rows[0];
      assert.equal(event.status, "cancelled");
      assert.equal(Number(event.revision), 2);
      const reports = (
        await db.query(
          "select status,reviewed_by,review_note from public.event_reports where event_id=$1",
          [eid(1)],
        )
      ).rows;
      assert.equal(reports.length, 2);
      assert.ok(
        reports.every(
          (r) =>
            r.status === "resolved" &&
            r.reviewed_by === owner &&
            r.review_note === "Event stopped by organizer",
        ),
      );
      assert.equal(
        (
          await as("anon", null, () =>
            db.query("select id from public.events where id=$1", [eid(1)]),
          )
        ).rows.length,
        0,
      );
      await as("authenticated", owner, () =>
        db.query("select public.owner_set_event_status($1,2,'published')", [
          eid(1),
        ]),
      );
      assert.equal(
        (
          await db.query("select status from public.events where id=$1", [
            eid(1),
          ])
        ).rows[0].status,
        "published",
      );
    },
  );
  await t.test(
    "resolving and dismissing keep an event published and preserve review history",
    async () => {
      await as("anon", null, () => send(rid(5), bid(5), eid(5)));
      await as("anon", null, () => send(rid(6), bid(6), eid(6)));
      await as("authenticated", owner, () => review(rid(5), "resolve", null));
      await as("authenticated", owner, () => review(rid(6), "dismiss", null));
      await as("authenticated", owner, () => review(rid(5), "resolve", null));
      await assert.rejects(
        as("authenticated", owner, () => review(rid(5), "dismiss", null)),
        (e) => e.code === "55000",
      );
      assert.equal(
        (
          await db.query(
            "select status from public.event_reports where id=$1",
            [rid(6)],
          )
        ).rows[0].status,
        "dismissed",
      );
      assert.ok(
        (
          await db.query(
            "select status from public.events where id in ($1,$2)",
            [eid(5), eid(6)],
          )
        ).rows.every((e) => e.status === "published"),
      );
    },
  );
  await t.test(
    "per-browser limits stop extra reports without stopping idempotent retries",
    async () => {
      for (let n = 7; n <= 11; n++)
        await as("anon", null, () => send(rid(n), bid(20), eid(n)));
      await assert.rejects(
        as("anon", null, () => send(rid(12), bid(20), eid(12))),
        (e) => e.code === "P0001",
      );
      assert.equal(
        (await as("anon", null, () => send(rid(7), bid(20), eid(7)))).rows[0]
          .id,
        rid(7),
      );
    },
  );
  await t.test(
    "a deleted event leaves a readable report snapshot that can still be resolved",
    async () => {
      await as("anon", null, () => send(rid(13), bid(13), eid(13)));
      await db.query("delete from public.events where id=$1", [eid(13)]);
      const report = (
        await db.query(
          "select event_id,event_title from public.event_reports where id=$1",
          [rid(13)],
        )
      ).rows[0];
      assert.equal(report.event_id, null);
      assert.equal(report.event_title, "Event 13");
      await assert.rejects(
        as("authenticated", owner, () => review(rid(13), "cancel")),
        (e) => e.code === "P0002",
      );
      await as("authenticated", owner, () => review(rid(13), "resolve", null));
    },
  );
});
