export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const hasExtension = /\.[a-zA-Z0-9]+$/.test(url.pathname);

    if (url.pathname === "/" || !hasExtension) {
      // Assets canonicalises "/index.html" to "/", so fetch the directory root
      // itself; asking for index.html produces a 307 that loops in the browser.
      return env.ASSETS.fetch(new Request(new URL("/", url), request));
    }

    return env.ASSETS.fetch(request);
  },
};
