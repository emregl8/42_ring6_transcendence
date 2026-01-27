(function () {
  "use strict";

  function getCookie(name) {
    var match = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
    if (match) return match[2];
  }

  function showError(message) {
    var errorMessage = document.getElementById("errorMessage");
    if (!errorMessage) return;
    errorMessage.textContent = message;
    errorMessage.style.display = "block";
  }

  function autoResize(element) {
    if (!element) return;
    element.style.height = "auto";
    element.style.height = element.scrollHeight + "px";
  }

  window.Utils = Object.freeze({
    getCookie: getCookie,
    showError: showError,
    autoResize: autoResize,
  });
})();
