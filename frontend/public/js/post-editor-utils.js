(function (global) {
  "use strict";

  var PostEditorUtils = {
    setupImageUpload: function () {
      var insertBtn = document.getElementById("insertImageBtn");
      var fileInput = document.getElementById("contentImageInput");
      var coverBtn = document.getElementById("setCoverBtn");
      var coverInput = document.getElementById("postImage");
      var contentDiv = document.getElementById("postContent");

      if (coverBtn && coverInput) {
        coverBtn.addEventListener("click", function (e) {
          e.preventDefault();
          coverInput.click();
        });

        coverInput.addEventListener("change", function () {
          if (this.files && this.files[0]) {
            coverBtn.textContent =
              "🖼️ Cover Set: " + this.files[0].name.substring(0, 10) + "...";
            coverBtn.classList.add("active");

            var previewContainer = document.getElementById(
              "coverPreviewContainer",
            );
            var previewImg = document.getElementById("coverPreview");
            if (previewContainer && previewImg) {
              var reader = new FileReader();
              reader.onload = function (e) {
                previewImg.src = e.target.result;
                previewContainer.style.display = "block";
              };
              reader.readAsDataURL(this.files[0]);
            }
          }
        });
      }

      if (!insertBtn || !fileInput) return;

      insertBtn.addEventListener("click", function (e) {
        e.preventDefault();
        fileInput.click();
      });

      fileInput.addEventListener("change", function () {
        if (this.files && this.files[0]) {
          var file = this.files[0];
          var formData = new FormData();
          formData.append("file", file);

          insertBtn.textContent = "Uploading...";
          insertBtn.disabled = true;

          AuthClient.request("/api/content/upload", {
            method: "POST",
            headers: { Accept: "application/json" },
            body: formData,
          })
            .then(function (res) {
              if (!res.ok) throw new Error("Upload failed");
              return res.json();
            })
            .then(function (data) {
              var imgTag =
                '<img src="' +
                data.url +
                '" alt="Image" style="max-width: 100%;">';

              contentDiv.focus();
              var selection = window.getSelection();
              if (selection.getRangeAt && selection.rangeCount) {
                var range = selection.getRangeAt(0);
                range.deleteContents();

                var el = document.createElement("div");
                el.innerHTML = imgTag;
                var frag = document.createDocumentFragment(),
                  node,
                  lastNode;
                while ((node = el.firstChild)) {
                  lastNode = frag.appendChild(node);
                }
                range.insertNode(frag);

                if (lastNode) {
                  range = range.cloneRange();
                  range.setStartAfter(lastNode);
                  range.collapse(true);
                  selection.removeAllRanges();
                  selection.addRange(range);
                }
              } else {
                contentDiv.innerHTML += imgTag;
              }
            })
            .catch(function (err) {
              Utils.showError("Failed to upload image.");
            })
            .finally(function () {
              insertBtn.textContent = "📷 Insert Image to Body";
              insertBtn.disabled = false;
              fileInput.value = "";
            });
        }
      });
    },
  };

  global.PostEditorUtils = PostEditorUtils;
})(window);
