(function () {
  "use strict";
  var refreshPromise = null;
  var MAX_RETRY = 1;

  function refreshOnce() {
    if (!refreshPromise) {
      refreshPromise = TokenManager.refresh()
        .catch(function (err) {
          return false;
        })
        .finally(function () {
          refreshPromise = null;
        });
    }
    return refreshPromise;
  }

  function authenticatedRequest(url, options) {
    options = options || {};

    options._retryCount = options._retryCount || 0;

    return HttpClient.request(url, options).then(function (res) {
      if (res.status !== 401) {
        return res;
      }

      if (options._retryCount >= MAX_RETRY) {
        forceLogout();

        return Promise.reject(new Error("Unauthorized"));
      }

      options._retryCount++;

      return refreshOnce().then(function (success) {
        if (!success) {
          forceLogout();

          throw new Error("Token refresh failed");
        }

        return HttpClient.request(url, options);
      });
    });
  }

  function forceLogout() {
    TokenManager.stop();

    var headers = {
      "X-Requested-With": "XMLHttpRequest",
    };

    var csrfToken = Utils.getCookie("XSRF-TOKEN");

    if (csrfToken) {
      headers["X-XSRF-TOKEN"] = csrfToken;
    }
    fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
      headers: headers,
    })
      .catch(function (err) {
        console.warn("Logout failed", err);
      })
      .finally(function () {
        window.location.replace("/");
      });
  }
  window.AuthClient = Object.freeze({
    request: authenticatedRequest,
    logout: forceLogout,
    startTokenRefresh: TokenManager.start,
    stopTokenRefresh: TokenManager.stop,
  });
})();
