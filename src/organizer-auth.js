export function createOrganizerAuth({
  getClient,
  getUser,
  isReviewer,
  notify,
}) {
  const $ = (selector) => document.querySelector(selector);
  let mode = "password",
    busy = false,
    recovery = false;
  const dialog = $("#authDialog"),
    passwordDialog = $("#passwordDialog");
  function setMode(next) {
    mode = next;
    $("#organizerPasswordField").hidden = mode !== "password";
    $("#organizerPassword").disabled = mode !== "password";
    $("#organizerPassword").required = mode === "password";
    $("#organizerPassword").value = "";
    $("#forgotPassword").hidden = mode !== "password";
    $("#authSubmit").textContent =
      mode === "password" ? "Sign in" : "Email me a sign-in link";
    document
      .querySelectorAll("[data-auth-mode]")
      .forEach((button) =>
        button.setAttribute(
          "aria-pressed",
          String(button.dataset.authMode === mode),
        ),
      );
    $("#authStatus").textContent = "";
  }
  function openPassword() {
    if (!getUser() || (!isReviewer() && !recovery)) return;
    dialog.close();
    $("#passwordForm").reset();
    $("#passwordStatus").textContent = "";
    if (!passwordDialog.open) passwordDialog.showModal();
  }
  document.querySelectorAll("[data-auth-mode]").forEach(
    (button) =>
      (button.onclick = () => {
        if (!busy) setMode(button.dataset.authMode);
      }),
  );
  dialog.addEventListener("close", () => {
    $("#organizerPassword").value = "";
  });
  passwordDialog.addEventListener("close", () => $("#passwordForm").reset());
  $("#setPassword").onclick = openPassword;
  $("#authForm").onsubmit = async (event) => {
    event.preventDefault();
    if (busy) return;
    const client = getClient();
    if (!client) {
      $("#authStatus").textContent =
        "Still connecting. Please try again shortly.";
      return;
    }
    busy = true;
    $("#authSubmit").disabled = true;
    try {
      const email = $("#organizerEmail").value.trim();
      const result =
        mode === "password"
          ? await client.auth.signInWithPassword({
              email,
              password: $("#organizerPassword").value,
            })
          : await client.auth.signInWithOtp({
              email,
              options: { emailRedirectTo: new URL("./", location.href).href },
            });
      if (result.error) {
        $("#authStatus").textContent =
          mode === "password"
            ? "Could not sign in. Check your email and password, or use an email link."
            : "Could not send the sign-in email. Please try again later.";
        return;
      }
      if (mode === "password") {
        dialog.close();
        notify("Signed in.");
      } else
        $("#authStatus").textContent =
          "Check your email for a sign-in link. Open it in this browser. After signing in, choose Set password for future logins.";
    } catch {
      $("#authStatus").textContent = "Could not connect. Please try again.";
    } finally {
      busy = false;
      $("#authSubmit").disabled = false;
      $("#organizerPassword").value = "";
    }
  };
  $("#forgotPassword").onclick = async () => {
    if (busy || !$("#organizerEmail").reportValidity()) return;
    const client = getClient();
    if (!client) return;
    busy = true;
    $("#forgotPassword").disabled = true;
    try {
      const { error } = await client.auth.resetPasswordForEmail(
        $("#organizerEmail").value.trim(),
        { redirectTo: new URL("./", location.href).href },
      );
      $("#authStatus").textContent = error
        ? "Could not send a reset email. Please try again later."
        : "If an account exists for that email, check its inbox for a password-reset link.";
    } catch {
      $("#authStatus").textContent = "Could not connect. Please try again.";
    } finally {
      busy = false;
      $("#forgotPassword").disabled = false;
    }
  };
  $("#passwordForm").onsubmit = async (event) => {
    event.preventDefault();
    const client = getClient(),
      button = $("#passwordSubmit");
    if (button.disabled) return;
    if (!client || !getUser() || (!isReviewer() && !recovery)) {
      $("#passwordStatus").textContent =
        "Sign in again before setting a password.";
      return;
    }
    const password = $("#newOrganizerPassword").value;
    if (password !== $("#confirmOrganizerPassword").value) {
      $("#passwordStatus").textContent = "The passwords do not match.";
      return;
    }
    if (password.length < 8) {
      $("#passwordStatus").textContent = "Use at least 8 characters.";
      return;
    }
    button.disabled = true;
    try {
      const { error } = await client.auth.updateUser({ password });
      if (error) {
        $("#passwordStatus").textContent =
          "Could not update your password. Try a stronger password, or sign in again using an email link.";
        return;
      }
      recovery = false;
      passwordDialog.close();
      notify(
        "Password saved. You can now sign in with your email and password.",
      );
    } catch {
      $("#passwordStatus").textContent = "Could not connect. Please try again.";
    } finally {
      button.disabled = false;
      $("#passwordForm").reset();
    }
  };
  setMode("password");
  return {
    open() {
      setMode("password");
      dialog.showModal();
    },
    accountChanged(event, session) {
      $("#setPassword").hidden = !session?.user || !isReviewer();
      if (!session?.user) {
        recovery = false;
        passwordDialog.close();
      } else if (event === "PASSWORD_RECOVERY") {
        recovery = true;
        openPassword();
      }
    },
  };
}
