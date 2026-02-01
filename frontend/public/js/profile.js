(function () {
  "use strict";
  function renderProfile(user) {
    const card = document.getElementById("profileCard");
    const avatarEl = document.getElementById("avatar");
    const usernameEl = document.getElementById("username");
    const emailEl = document.getElementById("email");
    const fullNameEl = document.getElementById("fullName");
    const joinedAtEl = document.getElementById("joinedAt");
    avatarEl.src =
      user.avatar ||
      "https://ui-avatars.com/api/?name=" +
        user.username +
        "&background=0D8ABC&color=fff&size=128";
    usernameEl.textContent = user.username;
    emailEl.textContent = user.email;
    fullNameEl.textContent =
      (user.firstName || "") + " " + (user.lastName || "");
    joinedAtEl.textContent = new Date(user.createdAt).toLocaleDateString();
    card.style.display = "block";
  }

  document.addEventListener("DOMContentLoaded", function () {
    const logoutBtn = document.getElementById("logoutBtn");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", AuthClient.logout);
    }
    AuthClient.loadUserProfile(renderProfile);
  });
})();
