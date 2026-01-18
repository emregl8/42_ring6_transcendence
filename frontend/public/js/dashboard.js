(function () {
  "use strict";

  function showError(message) {
    var errorMessage = document.getElementById("errorMessage");
    if (!errorMessage) return;

    errorMessage.textContent = message;
    errorMessage.style.display = "block";
  }

  function renderUserInfo(user) {
    var welcomeMessage = document.getElementById("welcomeMessage");
    var userInfo = document.getElementById("userInfo");

    if (!welcomeMessage || !userInfo) return;

    if (typeof user.username !== "string") {
      throw new Error("Invalid user payload");
    }

    welcomeMessage.textContent = "Welcome, " + user.username + "!";

    while (userInfo.firstChild) {
      userInfo.removeChild(userInfo.firstChild);
    }

    var fields = [
      { label: "Username", value: user.username },
      { label: "Email", value: user.email },
      {
        label: "Name",
        value: (user.firstName || "") + " " + (user.lastName || ""),
      },
      { label: "42 ID", value: user.intra42Id },
    ];

    fields.forEach(function (field) {
      var div = document.createElement("div");
      var strong = document.createElement("strong");

      strong.textContent = field.label + ": ";
      div.appendChild(strong);
      div.appendChild(document.createTextNode(field.value || "N/A"));

      userInfo.appendChild(div);
    });
  }

  function loadUserProfile() {
    var controller =
      typeof AbortController !== "undefined" ? new AbortController() : null;

    var timeoutId = setTimeout(function () {
      if (controller) controller.abort();
      showError("Request timed out. Please refresh the page.");
    }, 10000);

    AuthClient.request("/api/auth/me", {
      headers: { Accept: "application/json" },
      signal: controller ? controller.signal : undefined,
    })
      .then(function (res) {
        clearTimeout(timeoutId);

        if (!res || !res.ok) {
          throw new Error("Profile request failed");
        }

        return res.json();
      })
      .then(function (user) {
        if (!user || typeof user !== "object") {
          throw new Error("Invalid user data");
        }

        renderUserInfo(user);

        if (AuthClient.startTokenRefresh) {
          AuthClient.startTokenRefresh();
        }
      })
      .catch(function (err) {
        clearTimeout(timeoutId);
        console.error("User profile load error:", err);
        showError(
          "Failed to load user information. Please try refreshing the page."
        );
      });
  }

  document.addEventListener("DOMContentLoaded", function () {
    var logoutBtn = document.getElementById("logoutBtn");

    if (logoutBtn && AuthClient.logout) {
      logoutBtn.addEventListener("click", AuthClient.logout);
    }

    loadUserProfile();
  });
})();
