(function () {
  "use strict";

  var currentPostId = null;
  var currentUser = null;

  function renderPost(post) {
    var container = document.getElementById("postContainer");
    var titleEl = document.getElementById("postTitle");
    var metaEl = document.getElementById("postMeta");
    var contentEl = document.getElementById("postContent");
    var imageEl = document.getElementById("postImage");

    var metaContainer = document.getElementById("authorMetaContainer");
    var authorAvatarEl = document.getElementById("authorAvatar");
    var authorNameEl = document.getElementById("authorName");

    var likeBtn = document.getElementById("likeBtn");
    var likeCountEl = document.getElementById("likeCount");
    var commentCountEl = document.getElementById("commentCount");

    currentPostId = post.id;

    if (post.imageUrl) {
      imageEl.src = post.imageUrl;
      imageEl.style.display = "block";
    } else {
      imageEl.style.display = "none";
    }

    titleEl.textContent = post.title;

    var dateStr = new Date(post.createdAt).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

    if (post.user) {
      metaContainer.style.display = "flex";
      authorNameEl.textContent = post.user.firstName
        ? post.user.firstName + " " + (post.user.lastName || "")
        : post.user.username;
      authorAvatarEl.src =
        post.user.avatar ||
        "https://ui-avatars.com/api/?name=" +
          post.user.username +
          "&background=0D8ABC&color=fff&size=128";

      var timeStr = new Date(post.createdAt).toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
      });
      metaEl.innerHTML =
        dateStr + ' <span class="dot-separator"></span> Created at ' + timeStr;
    }

    if (window.DOMPurify) {
      contentEl.innerHTML = DOMPurify.sanitize(post.content, {
        ADD_TAGS: ["img"],
        ADD_ATTR: ["src", "alt", "width", "height"],
      });
    } else {
      contentEl.textContent = post.content;
    }

    likeCountEl.textContent = post.likeCount || 0;
    commentCountEl.textContent = post.comments ? post.comments.length : 0;

    if (post.isLiked) {
      likeBtn.classList.add("liked");
      likeBtn.querySelector("svg").style.fill = "#dc3545";
    } else {
      likeBtn.classList.remove("liked");
      likeBtn.querySelector("svg").style.fill = "currentColor";
    }

    renderComments(post.comments || []);
    container.style.display = "block";
  }

  function renderComments(comments) {
    var list = document.getElementById("commentList");
    list.innerHTML = "";

    comments.forEach(function (comment) {
      var item = document.createElement("div");
      item.className = "comment-item";

      var header = document.createElement("div");
      header.className = "comment-header";

      var avatar = document.createElement("img");
      avatar.className = "comment-avatar";
      avatar.src = comment.user.avatar || "/img/default-avatar.png";

      var author = document.createElement("span");
      author.className = "comment-author";
      author.textContent = comment.user.username;

      var dateObj = new Date(comment.createdAt);
      var dateStr = dateObj.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
      var timeStr = dateObj.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
      });

      var date = document.createElement("span");
      date.className = "comment-date";
      date.textContent = dateStr + " at " + timeStr;

      header.appendChild(avatar);
      header.appendChild(author);
      header.appendChild(date);

      if (
        currentUser &&
        (comment.user.id === currentUser.id ||
          (currentPostId && currentUser.id === comment.postId))
      ) {
        var delBtn = document.createElement("button");
        delBtn.className = "comment-delete";
        delBtn.textContent = "Delete";
        delBtn.onclick = function () {
          deleteComment(comment.id);
        };
        header.appendChild(delBtn);
      }

      var body = document.createElement("div");
      body.className = "comment-body";
      body.textContent = comment.content;

      item.appendChild(header);
      item.appendChild(body);
      list.appendChild(item);
    });
  }

  function toggleLike() {
    if (!currentPostId) return;
    var likeBtn = document.getElementById("likeBtn");
    var likeCountEl = document.getElementById("likeCount");

    AuthClient.request("/api/content/" + currentPostId + "/like", {
      method: "POST",
    })
      .then(function (res) {
        if (!res.ok) throw new Error("Failed to like");
        return res.json();
      })
      .then(function (data) {
        likeCountEl.textContent = data.count;
        if (data.liked) {
          likeBtn.classList.add("liked");
          likeBtn.querySelector("svg").style.fill = "#dc3545";
        } else {
          likeBtn.classList.remove("liked");
          likeBtn.querySelector("svg").style.fill = "currentColor";
        }
      })
      .catch(function (err) {
        console.error(err);
      });
  }

  function postComment() {
    var input = document.getElementById("commentInput");
    var content = input.value.trim();
    if (!content) return;

    AuthClient.request("/api/content/" + currentPostId + "/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: content }),
    })
      .then(function (res) {
        if (!res.ok) throw new Error("Failed to post comment");
        return res.json();
      })
      .then(function (comment) {
        input.value = "";
        loadPost();
      })
      .catch(function (err) {
        Utils.showError("Failed to post comment.");
      });
  }

  function deleteComment(id) {
    if (!confirm("Delete this comment?")) return;
    AuthClient.request("/api/content/comments/" + id, {
      method: "DELETE",
    })
      .then(function (res) {
        if (!res.ok) throw new Error("Failed to delete");
        loadPost();
      })
      .catch(function (err) {
        Utils.showError("Failed to delete comment.");
      });
  }

  function loadPost() {
    var urlParams = new URLSearchParams(window.location.search);
    var id = urlParams.get("id");
    if (!id) {
      if (currentPostId) id = currentPostId;
      else {
        Utils.showError("Post ID is missing.");
        return;
      }
    }

    AuthClient.loadUserProfile(function (user) {
      currentUser = user;
      AuthClient.request("/api/content/" + id, {
        headers: { Accept: "application/json" },
      })
        .then(function (res) {
          if (!res.ok) throw new Error("Failed to load post");
          return res.json();
        })
        .then(function (post) {
          renderPost(post);
        })
        .catch(function (err) {
          Utils.showError("Failed to load story.");
        });
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    loadPost();

    var likeBtn = document.getElementById("likeBtn");
    if (likeBtn) likeBtn.addEventListener("click", toggleLike);

    var postCommentBtn = document.getElementById("postCommentBtn");
    if (postCommentBtn) postCommentBtn.addEventListener("click", postComment);
  });
})();
