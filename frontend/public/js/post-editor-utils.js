(function (global) {
  "use strict";

  const PostEditorUtils = {
    setupImageUpload: function () {
      const insertBtn = document.getElementById("insertImageBtn");
      const fileInput = document.getElementById("contentImageInput");
      const coverBtn = document.getElementById("setCoverBtn");
      const coverInput = document.getElementById("postImage");
      const contentDiv = document.getElementById("postContent");

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

            const previewContainer = document.getElementById(
              "coverPreviewContainer",
            );
            const previewImg = document.getElementById("coverPreview");
            if (previewContainer && previewImg) {
              const reader = new FileReader();
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
          const file = this.files[0];
          const formData = new FormData();
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
              const imgTag =
                '<img src="' +
                data.url +
                '" alt="Image" style="max-width: 100%;">';

              contentDiv.focus();
              const selection = globalThis.getSelection();
              if (selection.getRangeAt && selection.rangeCount) {
                let range = selection.getRangeAt(0);
                range.deleteContents();

                const el = document.createElement("div");
                el.innerHTML = imgTag;
                let frag = document.createDocumentFragment(),
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
})(globalThis);
