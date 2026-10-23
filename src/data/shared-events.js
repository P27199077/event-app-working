import { createClient } from "../../public/vendor/supabase.js";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "../config.js";
export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
import { fromRow, toRow } from "./event-record.js?features=2";
export { friendlyError } from "./event-record.js?features=2";
export async function fetchEvents(userId) {
  // Page through the API limit so a busy fest does not silently lose pins.
  const rows = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase
      .from("events")
      .select("*")
      .eq("status", "published")
      .gt("ends_at", new Date().toISOString())
      .order("starts_at")
      .order("id")
      .range(offset, offset + 499);
    if (error) throw error;
    rows.push(...data);
    if (data.length < 500) break;
  }
  return rows.map((row) => fromRow(row, userId));
}
export async function fetchEventsAtTime(instant, userId) {
  const rows = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase.rpc("events_at_time", {
      view_time: instant,
      page_size: 500,
      page_offset: offset,
    });
    if (error) throw error;
    rows.push(...data);
    if (data.length < 500) break;
  }
  return rows.map((row) => fromRow(row, userId));
}
export async function fetchSchedule(
  userId,
  instant = new Date().toISOString(),
) {
  const rows = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase.rpc("event_schedule", {
      from_time: instant,
      page_size: 500,
      page_offset: offset,
    });
    if (error) throw error;
    rows.push(...data);
    if (data.length < 500) break;
  }
  return rows.map((row) => fromRow(row, userId));
}
export async function createEvent(event, userId) {
  const { data, error } = await supabase
    .from("events")
    .insert(toRow(event))
    .select()
    .single();
  if (error) throw error;
  return fromRow(data, userId);
}
export async function cancelEvent(id) {
  const { data, error } = await supabase
    .from("events")
    .update({ status: "cancelled" })
    .eq("id", id)
    .select("id");
  if (error) throw error;
  if (!data.length) throw { code: "42501" };
}

export async function submitRequest(
  event,
  requestId,
  browserId,
  trackingToken,
) {
  const { data, error } = await supabase.rpc("submit_tracked_event_request", {
    request_id: requestId,
    browser_id: browserId,
    tracking_token: trackingToken,
    event_data: toRow(event),
  });
  if (error) throw error;
  return data;
}
export async function fetchRequests() {
  const { data, error } = await supabase
    .from("event_requests")
    .select("*")
    .eq("review_status", "pending")
    .order("created_at");
  if (error) throw error;
  return data.map((row) => ({ ...fromRow(row), created: row.created_at }));
}
export async function reviewRequest(id, approve, reason) {
  const { data, error } = await supabase.rpc(
    "review_event_request_with_reason",
    {
      request_id: id,
      approve,
      reason: approve ? null : reason,
    },
  );
  if (error) throw error;
  return data;
}

export async function fetchManagedEvents(userId) {
  const rows = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase
      .from("events")
      .select("*")
      .order("starts_at", { ascending: false })
      .order("id")
      .range(offset, offset + 499);
    if (error) throw error;
    rows.push(...data);
    if (data.length < 500) break;
  }
  return rows.map((row) => fromRow(row, userId));
}
export async function editEvent(event, userId) {
  const { data, error } = await supabase.rpc("owner_edit_event", {
    event_id: event.id,
    expected_revision: event.revision,
    event_data: toRow(event),
  });
  if (error) throw error;
  return fromRow(data, userId);
}
export async function setEventStatus(event, status) {
  const { data, error } = await supabase.rpc("owner_set_event_status", {
    event_id: event.id,
    expected_revision: event.revision,
    next_status: status,
  });
  if (error) throw error;
  return data;
}

export async function trackRequest(entry) {
  const { data, error } = await supabase.rpc("track_event_request", {
    request_id: entry.id,
    tracking_token: entry.token,
  });
  if (error) throw error;
  return data;
}

export async function submitReport(report) {
  const { data, error } = await supabase.rpc("submit_event_report", {
    report_id: report.id,
    browser_id: report.browserId,
    reported_event_id: report.eventId,
    report_reason: report.reason,
    report_details: report.details,
  });
  if (error) throw error;
  return data;
}
export async function fetchReports(status = "open") {
  const rows = [];
  for (let offset = 0; ; offset += 500) {
    let query = supabase
      .from("event_reports")
      .select(
        "id,event_id,event_title,reason,details,status,created_at,reviewed_at,review_note,event:events(id,title,category,area,room,host,description,link,starts_at,ends_at,longitude,latitude,status,revision)",
      );
    if (status !== "all") query = query.eq("status", status);
    const { data, error } = await query
      .order("created_at", { ascending: false })
      .order("id")
      .range(offset, offset + 499);
    if (error) throw error;
    rows.push(...data);
    if (data.length < 500) break;
  }
  return [
    ...new Map(
      rows.map((row) => [
        row.id,
        { ...row, event: row.event ? fromRow(row.event) : null },
      ]),
    ).values(),
  ];
}
export async function reviewReport(report, action, note) {
  const { data, error } = await supabase.rpc("review_event_report", {
    report_id: report.id,
    review_action: action,
    expected_event_revision: report.event?.revision ?? null,
    note,
  });
  if (error) throw error;
  return data;
}
