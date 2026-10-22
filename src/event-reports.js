import { esc, date } from "./utils.js";
import { locationLabel } from "./event-presentation.js";
export const REPORT_REASONS = [
  "Wrong location",
  "Wrong time",
  "Event cancelled",
  "Misleading or spam",
  "Other",
];
export function validReport(reason, details) {
  return (
    REPORT_REASONS.includes(reason) &&
    typeof details === "string" &&
    details.length <= 500 &&
    (reason !== "Other" || details.trim().length > 0)
  );
}
export function reportError(error) {
  if (error?.code === "P0001")
    return "Please wait before sending more reports. Your earlier reports are still in the review queue.";
  if (error?.code === "P0002")
    return "This event or report is no longer available. Refresh and try again.";
  if (error?.code === "40001")
    return "This event changed on another device. Refresh the reports before cancelling it.";
  if (error?.code === "55000")
    return "This report has already been reviewed. Refresh the queue.";
  if (error?.code === "22023")
    return "Choose a reason and check the length of your details or review note.";
  if (error?.code === "42501")
    return "Sign in with your owner account to review reports.";
  if (["PGRST202", "PGRST205", "42883", "42P01"].includes(error?.code))
    return "Reporting is not available yet. Please try again later.";
  return "Could not send or update this report. Check your connection and try again.";
}
export function createEventReporting({
  getBackend,
  ownerIdentity,
  browserId,
  onEdit,
  onChange,
  notify,
}) {
  const $ = (selector) => document.querySelector(selector);
  const form = $("#reportForm"),
    dialog = $("#reportDialog"),
    queue = $("#reportsDialog"),
    list = $("#reportedEvents"),
    queueStatus = $("#reportsStatus");
  let target = null,
    sending = false,
    reportId = null,
    loading = false,
    generation = 0,
    reports = [],
    timer;
  const draftNotes = new Map();
  form.elements.reason.innerHTML = REPORT_REASONS.map(
    (reason) => `<option>${esc(reason)}</option>`,
  ).join("");
  form.elements.reason.onchange = () => {
    form.elements.details.required = form.elements.reason.value === "Other";
  };
  form.onsubmit = async (event) => {
    event.preventDefault();
    if (sending || !target) return;
    const reason = form.elements.reason.value,
      details = form.elements.details.value;
    if (!validReport(reason, details)) {
      $("#reportStatus").textContent =
        "Choose a reason and add details for Other (up to 500 characters).";
      return;
    }
    if (form.elements.website.value) return;
    const backend = getBackend();
    if (!backend) {
      $("#reportStatus").textContent =
        "Still connecting. Please try again shortly.";
      return;
    }
    sending = true;
    $("#sendReport").disabled = true;
    $("#reportStatus").textContent = "Sending report…";
    try {
      await backend.submitReport({
        id: reportId,
        eventId: target.id,
        browserId,
        reason,
        details,
      });
      dialog.close();
      target = null;
      notify("Report sent to the owner for review. Thank you.");
    } catch (error) {
      $("#reportStatus").textContent = reportError(error);
    } finally {
      sending = false;
      $("#sendReport").disabled = false;
    }
  };
  function render() {
    list.querySelectorAll("[data-report-note]").forEach((field) => {
      draftNotes.set(
        field.closest("[data-report-id]").dataset.reportId,
        field.value,
      );
    });
    list.innerHTML = reports.length
      ? reports
          .map((report) => {
            const event = report.event,
              open = report.status === "open";
            return `<article class="reported-event" data-report-id="${esc(report.id)}"><div class="managed-event-top"><span class="tracking-phase">${esc(report.status)}</span><span class="footnote">${esc(date(report.created_at))} · IST</span></div>
        <h3>${esc(event?.title || report.event_title)}</h3>
        ${event ? `<p>${esc(locationLabel(event))} · Hosted by ${esc(event.host)}</p><p>${esc(date(event.start))} – ${esc(date(event.end))} · ${event.status === "cancelled" ? "Cancelled event" : Date.parse(event.end) <= Date.now() ? "Ended event" : "Published event"}</p>` : "<p>The original event is no longer available.</p>"}
        <p><b>${esc(report.reason)}</b></p>${report.details ? `<p class="report-details">${esc(report.details)}</p>` : ""}
        ${
          open
            ? `<label class="rejection-label">Private review note (optional)<textarea data-report-note maxlength="300" placeholder="What did you check or change?">${esc(draftNotes.get(report.id) || "")}</textarea></label>
        <div class="detail-actions">${event ? `<button class="primary" data-edit-report="${esc(report.id)}">Edit event</button>` : ""}
        ${event && event.status !== "cancelled" ? `<button class="text-button" data-review-report="${esc(report.id)}" data-action="cancel">Cancel event & resolve reports</button>` : ""}
        <button class="text-button" data-review-report="${esc(report.id)}" data-action="resolve">Mark resolved</button>
        <button class="text-button" data-review-report="${esc(report.id)}" data-action="dismiss">Dismiss report</button></div>`
            : `<p class="footnote">Reviewed ${esc(date(report.reviewed_at))}${report.review_note ? ` · ${esc(report.review_note)}` : ""}</p>`
        }</article>`;
          })
          .join("")
      : '<p class="empty">No reports in this view.</p>';
    list.querySelectorAll("[data-edit-report]").forEach(
      (button) =>
        (button.onclick = () => {
          if (!ownerIdentity() || loading) return;
          const report = reports.find(
            (r) => r.id === button.dataset.editReport,
          );
          queue.close();
          onEdit(report.event);
        }),
    );
    list.querySelectorAll("[data-review-report]").forEach(
      (button) =>
        (button.onclick = async () => {
          const account = ownerIdentity();
          if (!account || loading) return;
          const report = reports.find(
            (r) => r.id === button.dataset.reviewReport,
          );
          const note = button
            .closest("article")
            .querySelector("[data-report-note]")
            .value.trim();
          const request = ++generation;
          loading = true;
          $("#reportsFilter").disabled = true;
          $("#refreshReports").disabled = true;
          list.querySelectorAll("button").forEach((b) => (b.disabled = true));
          let succeeded = false;
          try {
            await getBackend().reviewReport(
              report,
              button.dataset.action,
              note,
            );
            if (ownerIdentity() !== account || request !== generation) return;
            notify(
              button.dataset.action === "cancel"
                ? "Event cancelled and its open reports resolved. You can restore the event in Manage all events."
                : "Report reviewed.",
            );
            await onChange();
            succeeded = true;
          } catch (error) {
            if (ownerIdentity() === account && request === generation)
              queueStatus.textContent = reportError(error);
          } finally {
            if (request === generation) {
              loading = false;
              $("#reportsFilter").disabled = false;
              $("#refreshReports").disabled = false;
            }
          }
          if (ownerIdentity() === account && request === generation) {
            if (succeeded) await refresh();
            else render();
          }
        }),
    );
  }
  async function refresh() {
    const account = ownerIdentity(),
      backend = getBackend();
    if (!account || !backend || loading) return;
    const request = ++generation;
    loading = true;
    $("#refreshReports").disabled = true;
    $("#reportsFilter").disabled = true;
    queueStatus.textContent = "Loading reports…";
    list
      .querySelectorAll("button")
      .forEach((button) => (button.disabled = true));
    try {
      const result = await backend.fetchReports($("#reportsFilter").value);
      if (ownerIdentity() !== account || request !== generation) return;
      reports = result;
      queueStatus.textContent = `${reports.length} ${reports.length === 1 ? "report" : "reports"} · Private owner queue`;
      render();
    } catch (error) {
      if (ownerIdentity() === account && request === generation) {
        queueStatus.textContent = reportError(error);
        render();
      }
    } finally {
      if (request === generation) {
        loading = false;
        $("#refreshReports").disabled = false;
        $("#reportsFilter").disabled = false;
      }
    }
  }
  $("#reportsFilter").onchange = refresh;
  $("#refreshReports").onclick = refresh;
  queue.addEventListener("close", () => clearInterval(timer));
  return {
    openReport(event) {
      if (sending) return;
      target = event;
      reportId = crypto.randomUUID();
      form.reset();
      form.elements.details.required = false;
      $("#reportSubject").textContent = event.title;
      $("#reportStatus").textContent = "";
      dialog.showModal();
    },
    openQueue() {
      if (!ownerIdentity()) return;
      queue.showModal();
      refresh();
      clearInterval(timer);
      timer = setInterval(() => {
        if (
          queue.open &&
          !document.hidden &&
          !document.activeElement?.matches("[data-report-note]")
        )
          refresh();
      }, 15000);
    },
    clear() {
      generation++;
      loading = false;
      reports = [];
      draftNotes.clear();
      list.innerHTML = "";
      queueStatus.textContent = "";
      $("#refreshReports").disabled = false;
      $("#reportsFilter").disabled = false;
      queue.close();
      clearInterval(timer);
    },
  };
}
