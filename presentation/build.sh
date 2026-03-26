#!/bin/bash
set -e

cd "$(dirname "$0")"

# Build HTML from Marp markdown
npx @marp-team/marp-cli sundai_hack_preso.md --html --allow-local-files -o sundai_hack_preso.html

# Inject GIF restart script after Bespoke.js
# (scripts inside Marp's SVG foreignObject don't execute, so we inject post-build)
INJECT='<script>
(function() {
  var observer = new MutationObserver(function(mutations) {
    mutations.forEach(function(m) {
      if (m.attributeName === "class") {
        var svg = m.target;
        if (svg.classList.contains("bespoke-marp-active")) {
          svg.querySelectorAll("img").forEach(function(img) {
            var src = img.getAttribute("src") || "";
            if (src.indexOf(".gif") !== -1) {
              var base = src.split("?")[0];
              img.setAttribute("src", base + "?t=" + Date.now());
            }
          });
        }
      }
    });
  });
  document.querySelectorAll("svg[data-marpit-svg]").forEach(function(svg) {
    observer.observe(svg, { attributes: true, attributeFilter: ["class"] });
  });
})();
</script>'

python3 -c "
import sys
with open('sundai_hack_preso.html', 'r') as f:
    html = f.read()
html = html.replace('</body></html>', sys.argv[1] + '</body></html>')
with open('sundai_hack_preso.html', 'w') as f:
    f.write(html)
" "$INJECT"

echo "Built sundai_hack_preso.html"
