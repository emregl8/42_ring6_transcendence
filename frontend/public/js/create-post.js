(function () {
  "use strict";
  function createPost() {
    var titleInput = document.getElementById("postTitle");
    var contentInput = document.getElementById("postContent");
    var imageInput = document.getElementById("postImage");
    var publishBtn = document.getElementById("publishBtn");
    var title = titleInput.value.trim();
    var content = contentInput.innerHTML.trim();

    if (!title) {
      Utils.showError("Please enter a title.");
      return;
    }
    if (!content || content === "<br>") {
      Utils.showError("Please write some content.");
      return;
    }

    var formData = new FormData();
    formData.append("title", title);
    formData.append("content", content);
    if (imageInput.files.length > 0) {
      formData.append("image", imageInput.files[0]);
    }

    publishBtn.disabled = true;
    publishBtn.textContent = "Sharing...";
    AuthClient.request("/api/content", {
      method: "POST",
      headers: {
        Accept: "application/json",
      },
      body: formData,
    })
      .then(function (res) {
        if (!res.ok) {
          if (res.status === 429) {
            throw new Error("You are posting too fast. Please wait a minute.");
          }
          throw new Error("Failed to create post");
        }
        return res.json();
      })
      .then(function (post) {
        window.location.href = "/dashboard.html";
      })
      .catch(function (err) {
        Utils.showError(err.message || "Failed to share content");
        publishBtn.disabled = false;
        publishBtn.textContent = "Share Knowledge";
      });
  }

  document.addEventListener("DOMContentLoaded", function () {
    var publishBtn = document.getElementById("publishBtn");
    if (publishBtn) {
      publishBtn.addEventListener("click", createPost);
    }
    if (window.PostEditorUtils) {
      window.PostEditorUtils.setupImageUpload();
    }
  });
})();
