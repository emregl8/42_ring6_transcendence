(function () {
  "use strict";
  function createPost() {
    var titleInput = document.getElementById("postTitle");
    var contentInput = document.getElementById("postContent");
    var publishBtn = document.getElementById("publishBtn");
    var title = titleInput.value.trim();
    var content = contentInput.value.trim();

    if (!title) {
      Utils.showError("Please enter a title.");
      return;
    }
    if (!content) {
      Utils.showError("Please write some content.");
      return;
    }

    publishBtn.disabled = true;
    publishBtn.textContent = "Sharing...";
    AuthClient.request("/api/content", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ title: title, content: content }),
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
        console.error("Create post error:", err);
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
    var textarea = document.getElementById("postContent");
    textarea.addEventListener("input", function () {
      Utils.autoResize(this);
    });
  });
})();
