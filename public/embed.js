// GC_intersection embed loader (US-005/D12).
// <script src="https://<host>/embed.js" data-slug="your-slug"></script>
(function () {
  var script = document.currentScript;
  if (!script) return;
  var slug = script.getAttribute("data-slug");
  if (!slug) return;
  var origin = new URL(script.src).origin;

  var iframe = document.createElement("iframe");
  iframe.src = origin + "/i/" + encodeURIComponent(slug) + "/embed";
  iframe.style.width = "100%";
  iframe.style.border = "0";
  iframe.style.display = "block";
  iframe.style.minHeight = "480px";
  iframe.setAttribute("title", "Request an estimate");
  script.parentNode.insertBefore(iframe, script);

  window.addEventListener("message", function (e) {
    if (e.origin !== origin) return;
    if (e.data && e.data.type === "gci:height" && typeof e.data.height === "number") {
      iframe.style.height = Math.max(480, e.data.height) + "px";
    }
  });
})();
