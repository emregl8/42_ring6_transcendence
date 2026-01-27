(function () {
  "use strict";
  function renderPost(post) {
    var container = document.getElementById("postContainer");
    var titleEl = document.getElementById("postTitle");
    var metaEl = document.getElementById("postMeta");
    var contentEl = document.getElementById("postContent");
    titleEl.textContent = post.title;
    var username = post.user ? post.user.username : "Unknown";
    var date = new Date(post.createdAt).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    metaEl.textContent = "Written by " + username + " on " + date;
    if (window.DOMPurify) {
      contentEl.innerHTML = DOMPurify.sanitize(post.content);
    } else {
      contentEl.textContent = post.content;
    }
    container.style.display = "block";
  }

  function loadPost() {
    var urlParams = new URLSearchParams(window.location.search);
    var id = urlParams.get("id");
    if (!id) {
      Utils.showError("Post ID is missing.");
      return;
    }
    AuthClient.request("/api/content/" + id, {
      headers: { Accept: "application/json" },
    })
      .then(function (res) {
        if (!res.ok) throw new Error("Failed to load post");
        return res.json();
      })
      .then(function (post) {
        renderPost(post);
      })
      .catch(function (err) {
        console.error("Load post error:", err);
        Utils.showError("Failed to load story.");
      });
  }

  document.addEventListener("DOMContentLoaded", function () {
    loadPost();
  });
})();
