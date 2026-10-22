import { esc, safeLink, date } from "./utils.js";
export function createReviewQueue({ backend, isReviewer, onReview }) {
  const dialog = document.querySelector("#reviewDialog");
  const list = document.querySelector("#reviewRequests");
  const status = document.querySelector("#reviewStatus");
  let loading = false;
  async function refresh() {
    if (!isReviewer()) {
      list.innerHTML = "";
      dialog.close();
      return;
    }
    if (loading) return;
    loading = true;
    status.textContent = "Loading requests…";
    try {
      const requests = await backend.fetchRequests();
      if (!isReviewer()) {
        list.innerHTML = "";
        return;
      }
      status.textContent = requests.length
        ? `${requests.length} pending requests`
        : "No requests waiting for review.";
      list.innerHTML = requests
        .map(
          (event) =>
            `<article class="review-request"><span class="tag">${esc(event.category)}</span><h3>${esc(event.title)}</h3><p>${esc(date(event.start))} – ${esc(date(event.end))}</p><p><b>${esc(event.area)} · ${esc(event.room)}</b></p><p>Hosted by ${esc(event.host)}</p><p>${esc(event.description)}</p>${safeLink(event.link) ? `<a href="${esc(safeLink(event.link))}" target="_blank" rel="noopener noreferrer">Event link ↗</a>` : ""}<p>${new Date(event.end) <= new Date() ? "This event has ended. Reject it to clear the queue." : "Approve only if the details and location are correct."}</p><label class="rejection-label">Reason if rejecting<textarea data-rejection-reason maxlength="300" placeholder="Explain what needs to change. This is shown to the submitter."></textarea></label><div class="detail-actions"><button class="primary" data-approve="${event.id}" ${new Date(event.end) <= new Date() ? "disabled" : ""}>Approve event</button><button class="text-button" data-reject="${event.id}">Reject</button></div></article>`,
        )
        .join("");
      list.querySelectorAll("[data-approve],[data-reject]").forEach(
        (button) =>
          (button.onclick = async () => {
            if (!isReviewer()) return;
            const approve = Boolean(button.dataset.approve),
              id = button.dataset.approve || button.dataset.reject;
            const reasonField = button
              .closest("article")
              .querySelector("[data-rejection-reason]");
            const reason = reasonField.value.trim();
            if (!approve && !reason) {
              status.textContent = "Add a short rejection reason first.";
              reasonField.focus();
              return;
            }
            list.querySelectorAll("button").forEach((b) => (b.disabled = true));
            try {
              await backend.reviewRequest(id, approve, reason);
              await refresh();
              onReview();
            } catch (error) {
              status.textContent =
                error.code === "22023"
                  ? approve
                    ? "This event has ended. Reject it instead."
                    : "Add a rejection reason of up to 300 characters."
                  : backend.friendlyError(error);
              list
                .querySelectorAll("button")
                .forEach((b) => (b.disabled = false));
            }
          }),
      );
    } catch (error) {
      status.textContent = backend.friendlyError(error);
    } finally {
      loading = false;
    }
  }
  return {
    open: () => {
      if (isReviewer()) {
        dialog.showModal();
        refresh();
      }
    },
    refresh,
    clear: () => {
      list.innerHTML = "";
      dialog.close();
    },
  };
}
