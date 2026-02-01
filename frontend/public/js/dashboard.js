(function () {
  "use strict";
  function renderHeaderUser(user) {
    var usernameEl = document.getElementById("headerUsername");
    var avatarEl = document.getElementById("headerAvatar");
    if (usernameEl) usernameEl.textContent = user.username;
    if (avatarEl) {
      avatarEl.src =
        user.avatar ||
        "https://ui-avatars.com/api/?name=" +
          user.username +
          "&background=0D8ABC&color=fff&size=64";
    }
  }

  function renderPost(post) {
    var container = document.getElementById("postsContainer");
    var postDiv = document.createElement("div");
    postDiv.style.backgroundColor = "#ffffff";
    postDiv.style.border = "1px solid #e0e0e0";
    postDiv.style.borderRadius = "8px";
    postDiv.style.padding = "1.5rem";
    postDiv.style.cursor = "pointer";
    postDiv.style.transition = "box-shadow 0.2s";
    postDiv.onmouseover = function () {
      this.style.boxShadow = "0 2px 8px rgba(0,0,0,0.1)";
    };
    postDiv.onmouseout = function () {
      this.style.boxShadow = "none";
    };
    postDiv.onclick = function () {
      window.location.href = "/post.html?id=" + post.id;
    };

    if (post.imageUrl) {
      var img = document.createElement("img");
      img.src = post.imageUrl;
      img.style.width = "100%";
      img.style.height = "200px";
      img.style.objectFit = "cover";
      img.style.borderRadius = "4px";
      img.style.marginBottom = "1rem";
      postDiv.appendChild(img);
    }

    var meta = document.createElement("div");
    meta.style.marginBottom = "0.5rem";
    meta.style.fontSize = "0.85rem";
    meta.style.color = "#666";
    var username = post.user ? post.user.username : "Unknown";
    var date = new Date(post.createdAt).toLocaleDateString();
    meta.textContent = username + " • " + date;
    var title = document.createElement("h3");
    title.style.fontSize = "1.4rem";
    title.style.marginBottom = "0.5rem";
    title.style.color = "#333";
    title.textContent = post.title;
    var contentPreview = document.createElement("div");
    contentPreview.style.fontSize = "1rem";
    contentPreview.style.lineHeight = "1.5";
    contentPreview.style.color = "#555";
    var tempDiv = document.createElement("div");
    if (window.DOMPurify) {
      tempDiv.innerHTML = DOMPurify.sanitize(post.content, {
        ADD_TAGS: ["img"],
        ADD_ATTR: ["src", "alt", "width", "height"],
      });
    } else {
      tempDiv.textContent = post.content;
    }
    var textContent = tempDiv.textContent || tempDiv.innerText || "";
    if (textContent.length > 140) {
      contentPreview.textContent = textContent.substring(0, 140) + "...";
    } else {
      contentPreview.textContent = textContent;
    }
    postDiv.appendChild(meta);
    postDiv.appendChild(title);
    postDiv.appendChild(contentPreview);
    container.appendChild(postDiv);
  }

  function loadPosts() {
    AuthClient.request("/api/content", {
      headers: { Accept: "application/json" },
    })
      .then(function (res) {
        if (!res.ok) throw new Error("Failed to load posts");
        return res.json();
      })
      .then(function (posts) {
        var container = document.getElementById("postsContainer");
        container.innerHTML = "";
        posts.forEach(renderPost);
      })
      .catch(function (err) {});
  }

  function loadUserProfile() {
    AuthClient.request("/api/auth/me", {
      headers: { Accept: "application/json" },
    })
      .then(function (res) {
        if (!res || !res.ok) {
          throw new Error("Profile request failed");
        }

        return res.json();
      })
      .then(function (user) {
        renderHeaderUser(user);
        loadPosts();
        if (AuthClient.startTokenRefresh) {
          AuthClient.startTokenRefresh();
        }
      })
      .catch(function (err) {});
  }
  document.addEventListener("DOMContentLoaded", function () {
    loadUserProfile();
  });
})();
