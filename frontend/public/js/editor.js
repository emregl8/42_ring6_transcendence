(function () {
  'use strict';
  let postId = new URLSearchParams(globalThis.location.search).get('id');
  let isEdit = !!postId;

  function loadPost() {
    if (!isEdit) return;
    AuthClient.request('/api/content/' + postId)
      .then(function (res) {
        if (!res.ok) throw new Error('Failed to load post');
        return res.json();
      })
      .then(function (post) {
        document.getElementById('postTitle').value = post.title;
        document.getElementById('postContent').innerHTML = post.content;
        document.getElementById('submitPostBtn').textContent = 'Save Changes';
        if (post.imageUrl) {
          let previewContainer = document.getElementById('coverPreviewContainer');
          let previewImg = document.getElementById('coverPreview');
          if (previewContainer && previewImg) {
            previewImg.src = post.imageUrl;
            previewContainer.style.display = 'block';
          }
        }
      })
      .catch(function (err) {
        Utils.showError('Failed to load content.');
      });
  }

  function submitPost() {
    let title = document.getElementById('postTitle').value.trim();
    let content = document.getElementById('postContent').innerHTML.trim();
    let imageInput = document.getElementById('postImage');
    let submitBtn = document.getElementById('submitPostBtn');

    if (!title || !content || content === '<br>') {
      Utils.showError('Title and content are required.');
      return;
    }

    let formData = new FormData();
    formData.append('title', title);
    formData.append('content', content);
    if (imageInput.files.length > 0) {
      formData.append('image', imageInput.files[0]);
    }

    submitBtn.disabled = true;
    submitBtn.textContent = isEdit ? 'Saving...' : 'Sharing...';

    let url = isEdit ? '/api/content/' + postId : '/api/content';
    let method = isEdit ? 'PATCH' : 'POST';

    AuthClient.request(url, {
      method: method,
      body: formData,
    })
      .then(function (res) {
        if (!res.ok) throw new Error('Failed to ' + (isEdit ? 'update' : 'create') + ' post');
        globalThis.location.href = isEdit ? '/my-content.html' : '/dashboard.html';
      })
      .catch(function (err) {
        Utils.showError(err.message);
        submitBtn.disabled = false;
        submitBtn.textContent = isEdit ? 'Save Changes' : 'Publish';
      });
  }

  document.addEventListener('DOMContentLoaded', function () {
    let submitBtn = document.getElementById('submitPostBtn');
    if (submitBtn) submitBtn.addEventListener('click', submitPost);
    if (globalThis.PostEditorUtils) globalThis.PostEditorUtils.setupImageUpload();
    loadPost();
  });
})();
