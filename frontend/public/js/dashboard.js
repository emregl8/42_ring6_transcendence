(function () {
  'use strict';

  function renderPost(post, targetContainer) {
    const container = targetContainer || document.getElementById('postsContainer');

    const postDiv = document.createElement('div');

    postDiv.style.backgroundColor = '#ffffff';

    postDiv.style.border = '1px solid #e0e0e0';

    postDiv.style.borderRadius = '8px';

    postDiv.style.padding = '1.5rem';

    postDiv.style.cursor = 'pointer';

    postDiv.style.transition = 'box-shadow 0.2s';

    postDiv.onmouseover = function () {
      this.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
    };

    postDiv.onmouseout = function () {
      this.style.boxShadow = 'none';
    };

    postDiv.onclick = function () {
      globalThis.location.href = '/post.html?id=' + post.id;
    };

    if (post.imageUrl) {
      const img = document.createElement('img');

      img.src = post.imageUrl;

      img.style.width = '100%';

      img.style.height = '200px';

      img.style.objectFit = 'cover';

      img.style.borderRadius = '4px';

      img.style.marginBottom = '1rem';

      postDiv.appendChild(img);
    }

    const meta = document.createElement('div');

    meta.style.marginBottom = '0.5rem';

    meta.style.fontSize = '0.85rem';

    meta.style.color = '#666';

    const username = post.user ? post.user.username : 'Unknown';

    const date = new Date(post.createdAt).toLocaleDateString();

    meta.textContent = username + ' • ' + date;

    const title = document.createElement('h3');

    title.style.fontSize = '1.4rem';

    title.style.marginBottom = '0.5rem';

    title.style.color = '#333';

    title.textContent = post.title;

    const contentPreview = document.createElement('div');

    contentPreview.style.fontSize = '1rem';

    contentPreview.style.lineHeight = '1.5';

    contentPreview.style.color = '#555';

    const tempDiv = document.createElement('div');

    if (globalThis.DOMPurify) {
      tempDiv.innerHTML = globalThis.DOMPurify.sanitize(post.content, {
        ADD_TAGS: ['img'],

        ADD_ATTR: ['src', 'alt', 'width', 'height'],
      });
    } else {
      tempDiv.textContent = post.content;
    }

    const textContent = tempDiv.textContent || tempDiv.innerText || '';

    if (textContent.length > 140) {
      contentPreview.textContent = textContent.substring(0, 140) + '...';
    } else {
      contentPreview.textContent = textContent;
    }

    postDiv.appendChild(meta);

    postDiv.appendChild(title);

    postDiv.appendChild(contentPreview);

    container.appendChild(postDiv);
  }

  function loadPosts() {
    AuthClient.request('/api/content', {
      headers: { Accept: 'application/json' },
    })

      .then(function (res) {
        if (!res.ok) throw new Error('Failed to load posts');

        return res.json();
      })

      .then(function (posts) {
        const container = document.getElementById('postsContainer');

        container.innerHTML = '';

        posts.forEach(function (p) {
          renderPost(p);
        });
      })

      .catch(function (err) {});
  }

  document.addEventListener('DOMContentLoaded', function () {
    loadPosts();
  });
})();
