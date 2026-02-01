(function () {
  "use strict";
  let refreshTimer = null;
  let refreshPromise = null;

  function refresh() {
    if (refreshPromise) return refreshPromise;
    refreshPromise = HttpClient.post("/api/auth/refresh", {
      headers: { Accept: "application/json" },
    })
      .then(function (res) {
        if (!res.ok) throw new Error("Refresh failed");
        return res.json();
      })
      .then(function (data) {
        return true;
      })
      .catch(function (err) {
        stop();
        forceLogout();
        return false;
      })
      .finally(function () {
        refreshPromise = null;
      });

    return refreshPromise;
  }

  function start(intervalMs) {
    stop();
    intervalMs = intervalMs || 12 * 60 * 1000;
    refreshTimer = setInterval(refresh, intervalMs);
  }

  function stop() {
    if (refreshTimer) {
      clearInterval(refreshTimer);
      refreshTimer = null;
    }
  }
  function forceLogout() {
    stop();
    if (window.AuthClient && window.AuthClient.logout) {
      window.AuthClient.logout();
    } else {
      window.location.replace("/");
    }
  }
  window.addEventListener("beforeunload", stop);
  window.TokenManager = Object.freeze({
    refresh: refresh,
    start: start,
    stop: stop,
    forceLogout: forceLogout,
  });
})();
