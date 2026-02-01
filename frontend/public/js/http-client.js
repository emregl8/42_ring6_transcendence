(function () {
  "use strict";
  function normalizeOptions(options) {
    const opts = options ? { ...options } : {};
    opts.credentials = "include";
    opts.headers = {
      Accept: "application/json",
      ...(opts.headers || {}),
    };
    const csrfToken = Utils.getCookie("XSRF-TOKEN");
    if (csrfToken) {
      opts.headers["X-XSRF-TOKEN"] = csrfToken;
    }
    return opts;
  }

  function request(url, options) {
    const opts = normalizeOptions(options);
    return fetch(url, opts).catch(function (err) {
      throw err;
    });
  }

  function get(url, options) {
    const opts = options ? { ...options } : {};
    opts.method = "GET";
    return request(url, opts);
  }

  function post(url, options) {
    const opts = options ? { ...options } : {};
    opts.method = "POST";
    if (
      opts.body &&
      typeof opts.body === "object" &&
      !(opts.body instanceof FormData)
    ) {
      opts.headers = {
        ...opts.headers,
        "Content-Type": "application/json",
      };
      opts.body = JSON.stringify(opts.body);
    }

    return request(url, opts);
  }

  globalThis.HttpClient = Object.freeze({
    request: request,
    get: get,
    post: post,
  });
})();
