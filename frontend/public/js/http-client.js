(function () {
  "use strict";

  function normalizeOptions(options) {
    var opts = options ? Object.assign({}, options) : {};

    opts.credentials = "include";

    opts.headers = Object.assign(
      { Accept: "application/json" },
      opts.headers || {}
    );

    return opts;
  }

  function request(url, options) {
    var opts = normalizeOptions(options);

    return fetch(url, opts).catch(function (err) {
      console.error("Network error:", err);
      throw err;
    });
  }

  function get(url, options) {
    var opts = options ? Object.assign({}, options) : {};
    opts.method = "GET";
    return request(url, opts);
  }

  function post(url, options) {
    var opts = options ? Object.assign({}, options) : {};
    opts.method = "POST";

    if (
      opts.body &&
      typeof opts.body === "object" &&
      !(opts.body instanceof FormData)
    ) {
      opts.headers = Object.assign({}, opts.headers, {
        "Content-Type": "application/json",
      });
      opts.body = JSON.stringify(opts.body);
    }

    return request(url, opts);
  }

  window.HttpClient = Object.freeze({
    request: request,
    get: get,
    post: post,
  });
})();
