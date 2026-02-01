(function () {
  "use strict";
  function renderPost(post) {
    var container = document.getElementById("postContainer");
    var titleEl = document.getElementById("postTitle");
    var metaEl = document.getElementById("postMeta");
    var contentEl = document.getElementById("postContent");
    var imageEl = document.getElementById("postImage");

    var metaContainer = document.getElementById("authorMetaContainer");
    var authorAvatarEl = document.getElementById("authorAvatar");
    var authorNameEl = document.getElementById("authorName");

    if (post.imageUrl) {
      imageEl.src = post.imageUrl;
      imageEl.style.display = "block";
    } else {
      imageEl.style.display = "none";
    }

    titleEl.textContent = post.title;

    var dateStr = new Date(post.createdAt).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

    if (post.user) {
      metaContainer.style.display = "flex";
      authorNameEl.textContent = post.user.firstName
        ? post.user.firstName + " " + (post.user.lastName || "")
        : post.user.username;
      authorAvatarEl.src =
        post.user.avatar ||
        "https://ui-avatars.com/api/?name=" +
          post.user.username +
          "&background=0D8ABC&color=fff&size=128";

      var timeStr = new Date(post.createdAt).toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
      });
      metaEl.innerHTML =
        dateStr + ' <span class="dot-separator"></span> Created at ' + timeStr;
    }

    if (window.DOMPurify) {
      contentEl.innerHTML = DOMPurify.sanitize(post.content, {
        ADD_TAGS: ["img"],
        ADD_ATTR: ["src", "alt", "width", "height"],
      });
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
        Utils.showError("Failed to load story.");
      });
  }

  document.addEventListener("DOMContentLoaded", function () {
    loadPost();
  });
})();
