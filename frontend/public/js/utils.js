(function () {
  "use strict";

  function getCookie(name) {
    const match = document.cookie.match(
      new RegExp("(^| )" + name + "=([^;]+)"),
    );
    if (match) return match[2];
  }

  function showError(message) {
    const errorMessage = document.getElementById("errorMessage");
    if (!errorMessage) return;
    errorMessage.textContent = message;
    errorMessage.style.display = "block";
  }

  function autoResize(element) {
    if (!element) return;
    element.style.height = "auto";
    element.style.height = element.scrollHeight + "px";
  }

  globalThis.Utils = Object.freeze({
    getCookie: getCookie,
    showError: showError,
    autoResize: autoResize,
  });
})();
