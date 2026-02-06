(function (global) {
  'use strict';

  const PostEditorUtils = {
    setupImageUpload: function () {
      this.handleCoverImageSetup();
      this.handleContentImageSetup();
    },

    handleCoverImageSetup: function () {
      const coverBtn = document.getElementById('setCoverBtn');
      const coverInput = document.getElementById('postImage');
      if (!coverBtn || !coverInput) return;

      coverBtn.addEventListener('click', (e) => {
        e.preventDefault();
        coverInput.click();
      });

      coverInput.addEventListener('change', () => {
        const file = coverInput.files?.[0];
        if (!file) return;

        coverBtn.textContent = '🖼️ Cover Set: ' + file.name.substring(0, 10) + '...';
        coverBtn.classList.add('active');

        const previewContainer = document.getElementById('coverPreviewContainer');
        const previewImg = document.getElementById('coverPreview');
        if (previewContainer && previewImg) {
          const reader = new FileReader();
          reader.onload = (e) => {
            previewImg.src = e.target.result;
            previewContainer.style.display = 'block';
          };
          reader.readAsDataURL(file);
        }
      });
    },

    handleContentImageSetup: function () {
      const insertBtn = document.getElementById('insertImageBtn');
      const fileInput = document.getElementById('contentImageInput');
      const contentDiv = document.getElementById('postContent');

      if (!insertBtn || !fileInput || !contentDiv) return;

      insertBtn.addEventListener('click', (e) => {
        e.preventDefault();
        fileInput.click();
      });

      fileInput.addEventListener('change', async () => {
        const file = fileInput.files?.[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);

        insertBtn.textContent = 'Uploading...';
        insertBtn.disabled = true;

        try {
          const res = await AuthClient.request('/api/content/upload', {
            method: 'POST',
            headers: { Accept: 'application/json' },
            body: formData,
          });

          if (!res.ok) throw new Error('Upload failed');
          const data = await res.json();
          this.insertImageToContent(data.url, contentDiv);
        } catch (err) {
          Utils.showError('Failed to upload image.');
        } finally {
          insertBtn.textContent = '📷 Insert Image to Body';
          insertBtn.disabled = false;
          fileInput.value = '';
        }
      });
    },

    insertImageToContent: function (imageUrl, contentDiv) {
      const imgTag = '<img src="' + imageUrl + '" alt="Image" style="max-width: 100%;">';
      contentDiv.focus();
      const selection = globalThis.getSelection();

      if (!selection.getRangeAt || !selection.rangeCount) {
        contentDiv.innerHTML += imgTag;
        return;
      }

      let range = selection.getRangeAt(0);
      range.deleteContents();

      const el = document.createElement('div');
      el.innerHTML = imgTag;

      const frag = document.createDocumentFragment();
      let node, lastNode;
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
    },
  };

  global.PostEditorUtils = PostEditorUtils;
})(globalThis);
