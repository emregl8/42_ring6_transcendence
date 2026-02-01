(function () {
  "use strict";
  function renderProfile(user) {
    var card = document.getElementById("profileCard");
    var avatarEl = document.getElementById("avatar");
    var usernameEl = document.getElementById("username");
    var emailEl = document.getElementById("email");
    var fullNameEl = document.getElementById("fullName");
    var joinedAtEl = document.getElementById("joinedAt");
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
    var logoutBtn = document.getElementById("logoutBtn");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", AuthClient.logout);
    }
    AuthClient.loadUserProfile(renderProfile);
  });
})();
