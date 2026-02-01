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
        document.getElementById("postContent").innerHTML = post.content;

        if (post.imageUrl) {
          var previewContainer = document.getElementById(
            "coverPreviewContainer",
          );
          var previewImg = document.getElementById("coverPreview");
          if (previewContainer && previewImg) {
            previewImg.src = post.imageUrl;
            previewContainer.style.display = "block";
          }
        }
      })
      .catch(function (err) {
        Utils.showError(
          "Failed to load content. It may have been deleted or you do not have permission.",
        );
      });
  }

  function savePost() {
    var titleInput = document.getElementById("postTitle");
    var contentInput = document.getElementById("postContent");
    var imageInput = document.getElementById("postImage");
    var saveBtn = document.getElementById("updatePostBtn");
    var title = titleInput.value.trim();
    var content = contentInput.innerHTML.trim();
    if (!title || !content || content === "<br>") {
      Utils.showError("Title and content are required.");
      return;
    }

    var formData = new FormData();
    formData.append("title", title);
    formData.append("content", content);
    if (imageInput.files.length > 0) {
      formData.append("image", imageInput.files[0]);
    }

    saveBtn.disabled = true;
    saveBtn.textContent = "Saving...";
    AuthClient.request("/api/content/" + postId, {
      method: "PATCH",
      headers: {
        Accept: "application/json",
      },
      body: formData,
    })
      .then(function (res) {
        if (!res.ok) throw new Error("Failed to update post");
        return res.json();
      })
      .then(function (post) {
        window.location.href = "/my-content.html";
      })
      .catch(function (err) {
        Utils.showError(err.message || "Failed to update content");
        saveBtn.disabled = false;
        saveBtn.textContent = "Save Changes";
      });
  }

  document.addEventListener("DOMContentLoaded", function () {
    var saveBtn = document.getElementById("updatePostBtn");
    if (saveBtn) {
      saveBtn.addEventListener("click", savePost);
    }
    if (window.PostEditorUtils) {
      window.PostEditorUtils.setupImageUpload();
    }
    loadPost();
  });
})();
