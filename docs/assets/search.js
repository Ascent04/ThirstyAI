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

  if (sections.length === 0) return;

  function entryText(entry) {
    return entry.els.map((el) => el.textContent).join(" ").toLowerCase();
  }

  function applyFilter() {
    const query = input.value.trim().toLowerCase();
    for (const section of sections) {
      let anyVisible = false;
      for (const entry of section.entries) {
        const matches = query === "" || entryText(entry).includes(query);
        for (const el of entry.els) el.hidden = !matches;
        if (matches) anyVisible = true;
      }
      if (section.heading) section.heading.hidden = !anyVisible;
    }
  }

  input.addEventListener("input", applyFilter);
})();
