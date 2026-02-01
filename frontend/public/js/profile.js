(function () {
  "use strict";
  function renderProfile(user) {
    var card = document.getElementById("profileCard");
    var avatarEl = document.getElementById("avatar");
    var usernameEl = document.getElementById("username");
    var emailEl = document.getElementById("email");
    var fullNameEl = document.getElementById("fullName");
    var intraIdEl = document.getElementById("intraId");
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
    intraIdEl.textContent = user.intra42Id || "N/A";
    joinedAtEl.textContent = new Date(user.createdAt).toLocaleDateString();
    card.style.display = "block";
    loadMyPosts();
  }

  function renderMyPost(post) {
    var container = document.getElementById("myPostsList");
    var postDiv = document.createElement("div");
    postDiv.style.backgroundColor = "#ffffff";
    postDiv.style.border = "1px solid #e0e0e0";
    postDiv.style.borderRadius = "8px";
    postDiv.style.padding = "1.5rem";
    postDiv.style.display = "flex";
    postDiv.style.justifyContent = "space-between";
    postDiv.style.alignItems = "center";
    var infoDiv = document.createElement("div");
    var title = document.createElement("h4");
    title.style.fontSize = "1.2rem";
    title.style.marginBottom = "0.5rem";
    title.textContent = post.title;
    var date = document.createElement("div");
    date.style.color = "#666";
    date.style.fontSize = "0.85rem";
    date.textContent =
      "Published on " + new Date(post.createdAt).toLocaleDateString();
    infoDiv.appendChild(title);
    infoDiv.appendChild(date);
    var actionsDiv = document.createElement("div");
    var editLink = document.createElement("a");
    editLink.href = "/edit-post.html?id=" + post.id;
    editLink.textContent = "Edit";
    editLink.style.textDecoration = "none";
    editLink.style.color = "#333";
    editLink.style.border = "1px solid #ccc";
    editLink.style.padding = "0.5rem 1rem";
    editLink.style.borderRadius = "4px";
    editLink.style.fontSize = "0.9rem";
    editLink.style.fontWeight = "500";
    actionsDiv.appendChild(editLink);
    postDiv.appendChild(infoDiv);
    postDiv.appendChild(actionsDiv);
    container.appendChild(postDiv);
  }

  function loadMyPosts() {
    AuthClient.request("/api/content/my-posts", {
      headers: { Accept: "application/json" },
    })
      .then(function (res) {
        if (!res.ok) throw new Error("Failed to load my posts");
        return res.json();
      })
      .then(function (posts) {
        var container = document.getElementById("myPostsList");
        var section = document.getElementById("myContentSection");
        container.innerHTML = "";
        if (posts.length > 0) {
          posts.forEach(renderMyPost);
          section.style.display = "block";
        }
      })
      .catch(function (err) {});
  }

  function loadProfile() {
    AuthClient.request("/api/auth/me", {
      headers: { Accept: "application/json" },
    })
      .then(function (res) {
        if (!res.ok) {
          return res.text().then(function (text) {
            throw new Error(
              "Profile request failed: " + res.status + " - " + text,
            );
          });
        }
        return res.json();
      })
      .then(function (user) {
        renderProfile(user);
        if (AuthClient.startTokenRefresh) {
          AuthClient.startTokenRefresh();
        }
      })
      .catch(function (err) {
        Utils.showError("Failed to load profile details.");
      });
  }

  document.addEventListener("DOMContentLoaded", function () {
    var logoutBtn = document.getElementById("logoutBtn");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", AuthClient.logout);
    }
    loadProfile();
  });
})();
