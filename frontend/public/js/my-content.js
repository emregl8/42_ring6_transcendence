(function () {
  "use strict";

  function renderPosts(posts) {
    var container = document.getElementById("postsContainer");
    container.innerHTML = "";

    if (posts.length === 0) {
      container.innerHTML =
        '<div style="color: #666; font-style: italic;">You haven\'t created any content yet.</div>';
      return;
    }

    posts.forEach(function (post) {
      var card = document.createElement("div");
      card.className = "post-card";

      var infoDiv = document.createElement("div");
      infoDiv.className = "post-info";

      var titleLink = document.createElement("a");
      titleLink.href = "/post.html?id=" + post.id;
      titleLink.className = "post-title";
      titleLink.textContent = post.title;

      var date = new Date(post.createdAt).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });

      var meta = document.createElement("div");
      meta.className = "post-meta";
      meta.textContent = "Posted on " + date;

      infoDiv.appendChild(titleLink);
      infoDiv.appendChild(meta);

      var actionsDiv = document.createElement("div");
      actionsDiv.className = "post-actions";

      var editBtn = document.createElement("a");
      editBtn.href = "/editor.html?id=" + post.id;
      editBtn.className = "btn-action btn-edit";
      editBtn.textContent = "Edit";

      var deleteBtn = document.createElement("button");
      deleteBtn.className = "btn-action btn-delete";
      deleteBtn.textContent = "Delete";
      deleteBtn.onclick = function () {
        if (
          confirm(
            "Are you sure you want to delete this post? This action cannot be undone.",
          )
        ) {
          deletePost(post.id);
        }
      };

      actionsDiv.appendChild(editBtn);
      actionsDiv.appendChild(deleteBtn);

      card.appendChild(infoDiv);
      card.appendChild(actionsDiv);

      container.appendChild(card);
    });
  }

  function deletePost(id) {
    AuthClient.request("/api/content/" + id, {
      method: "DELETE",
    })
      .then(function (res) {
        if (!res.ok) throw new Error("Failed to delete post");
        loadMyPosts();
      })
      .catch(function (err) {
        Utils.showError("Failed to delete post.");
      });
  }

  function loadMyPosts() {
    AuthClient.request("/api/content/my-posts")
      .then(function (res) {
        if (!res.ok) throw new Error("Failed to load posts");
        return res.json();
      })
      .then(function (posts) {
        renderPosts(posts);
      })
      .catch(function (err) {
        Utils.showError("Failed to load your content.");
      });
  }

  document.addEventListener("DOMContentLoaded", function () {
    AuthClient.loadUserProfile(function () {
      loadMyPosts();
    });
  });
})();
