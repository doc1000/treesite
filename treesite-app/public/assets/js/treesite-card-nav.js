/**
 * Embed in bundled htmlCard HTML pages (`public/assets/html/...`).
 * Parent TreeSite listens for `{ type: "treesite:navigate", slug }` (same-origin only).
 *
 * Include before </body>:
 * `<script src="/assets/js/treesite-card-nav.js"></script>`
 *
 * - Call `treesiteNavigateToCard("schedule-a-call")`.
 * - Or use `<a href="#" data-treesite-card="schedule-a-call">...</a>`
 */
(function () {
  function send(slug) {
    if (!slug) return;
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage(
          {
            type: "treesite:navigate",
            slug: String(slug)
          },
          window.location.origin
        );
      }
    } catch {
      /* cross-origin iframe — ignore */
    }
  }

  window.treesiteNavigateToCard = send;

  document.addEventListener(
    "click",
    function (e) {
      const a =
        typeof e.target?.closest === "function"
          ? e.target.closest("a[data-treesite-card]")
          : null;
      if (!a) return;
      e.preventDefault();
      send(a.getAttribute("data-treesite-card"));
    },
    true
  );
})();
