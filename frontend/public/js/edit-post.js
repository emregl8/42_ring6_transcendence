(function () {
  "use strict";
  var postId = null;

  function loadPost() {
    var urlParams = new URLSearchParams(window.location.search);
    postId = urlParams.get("id");
    if (!postId) {
      Utils.showError("Post ID missing.");
      return;
    }
    AuthClient.request("/api/content/" + postId, {
      headers: { Accept: "application/json" },
    })
      .then(function (res) {
        if (!res.ok) throw new Error("Failed to load post");
        return res.json();
      })
      .then(function (post) {
        document.getElementById("postTitle").value = post.title;
        document.getElementById("postContent").value = post.content;
        var textarea = document.getElementById("postContent");
        Utils.autoResize(textarea);
      })
      .catch(function (err) {
        console.error("Load post error:", err);
        Utils.showError(
          "Failed to load content. It may have been deleted or you do not have permission.",
        );
      });
  }

  function savePost() {
    var titleInput = document.getElementById("postTitle");
    var contentInput = document.getElementById("postContent");
    var saveBtn = document.getElementById("saveBtn");
    var title = titleInput.value.trim();
    var content = contentInput.value.trim();
    if (!title || !content) {
      Utils.showError("Title and content are required.");
      return;
    }
    saveBtn.disabled = true;
    saveBtn.textContent = "Saving...";
    AuthClient.request("/api/content/" + postId, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ title: title, content: content }),
    })
      .then(function (res) {
        if (!res.ok) throw new Error("Failed to update post");
        return res.json();
      })
      .then(function (post) {
        window.location.href = "/profile";
      })
      .catch(function (err) {
        console.error("Update post error:", err);
        Utils.showError(err.message || "Failed to update content");
        saveBtn.disabled = false;
        saveBtn.textContent = "Save Changes";
      });
  }

  document.addEventListener("DOMContentLoaded", function () {
    var saveBtn = document.getElementById("saveBtn");
    if (saveBtn) {
      saveBtn.addEventListener("click", savePost);
    }
    var textarea = document.getElementById("postContent");
    textarea.addEventListener("input", function () {
      Utils.autoResize(this);
    });
    loadPost();
  });
})();
