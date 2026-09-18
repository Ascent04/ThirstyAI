/**
 * Filters the current page's content in place. Both document types (FAQ,
 * glossary) share the same flat shape: sections on h2, entries on h3, each
 * entry's text running until the next h3 or h2. No index, no library -
 * just DOM traversal at search time, since the page is small and the
 * filter only has to work against what is already on screen.
 */
(function () {
  const input = document.getElementById("site-search");
  const content = document.getElementById("page-content");
  if (!input || !content) return;

  const sections = [];
  let currentSection = null;
  let currentEntry = null;

  for (const el of Array.from(content.children)) {
    if (el.tagName === "H2") {
      currentSection = { heading: el, entries: [] };
      sections.push(currentSection);
      currentEntry = null;
    } else if (el.tagName === "H3") {
      if (!currentSection) {
        currentSection = { heading: null, entries: [] };
        sections.push(currentSection);
      }
      currentEntry = { els: [el] };
      currentSection.entries.push(currentEntry);
    } else if (currentEntry) {
      currentEntry.els.push(el);
    }
    // Content before the first h3 of a page (e.g. an intro paragraph) is
    // left alone - it is never hidden by a search.
  }

  if (sections.length === 0 || sections.every((s) => s.entries.length === 0)) {
    // Nothing to filter on this page (e.g. the start page has no h3 entries):
    // hide the search box instead of offering a control that does nothing.
    input.hidden = true;
    return;
  }

  function entryText(entry) {
    return entry.els.map((el) => el.textContent).join(" ").toLowerCase();
  }

  const HIGHLIGHT_NAME = "search-hit";
  const canHighlight =
    typeof CSS !== "undefined" && "highlights" in CSS && typeof Highlight !== "undefined";

  /**
   * Marks every occurrence of the query inside the entries still on screen,
   * via the CSS Custom Highlight API - no DOM edits, links stay intact. The
   * look lives in style.css (::highlight). Browsers without the API keep the
   * filter and simply show no marking.
   */
  function highlightMatches(query) {
    if (!canHighlight) return;
    if (query === "") {
      CSS.highlights.delete(HIGHLIGHT_NAME);
      return;
    }
    const ranges = [];
    for (const section of sections) {
      for (const entry of section.entries) {
        for (const el of entry.els) {
          if (el.hidden) continue;
          const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
          let node;
          while ((node = walker.nextNode())) {
            const text = node.textContent.toLowerCase();
            let from = text.indexOf(query);
            while (from !== -1) {
              const range = new Range();
              range.setStart(node, from);
              range.setEnd(node, from + query.length);
              ranges.push(range);
              from = text.indexOf(query, from + query.length);
            }
          }
        }
      }
    }
    CSS.highlights.set(HIGHLIGHT_NAME, new Highlight(...ranges));
  }

  function applyFilter() {
    const query = input.value.trim().toLowerCase();
    for (const section of sections) {
      if (section.entries.length === 0) continue; // headings without entries are never hidden
      let anyVisible = false;
      for (const entry of section.entries) {
        const matches = query === "" || entryText(entry).includes(query);
        for (const el of entry.els) el.hidden = !matches;
        if (matches) anyVisible = true;
      }
      if (section.heading) section.heading.hidden = !anyVisible;
    }
    highlightMatches(query);
  }

  input.addEventListener("input", applyFilter);
})();
