function extractDiffData() {
  const files = [...document.querySelectorAll('.file')];

  return files
    .map(fileElement => {
      const filePath = fileElement.getAttribute('data-tagsearch-path');
      if (!filePath) {
        return null;
      }

      const diffstatElement = fileElement.querySelector('span.diffstat');
      if (!diffstatElement) {
        console.error('Element with class "diffstat" not found.');
        return null;
      }
      const diffText = diffstatElement.textContent.trim();
      const diff = Number(diffText);
      if (isNaN(diff)) {
        console.warn(`Diff value "${diffText}" is not a valid number.`);
        return null;
      }

      return { filePath, diff };
    })
    .filter(Boolean);
}

function initialize() {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "extractDiffData") {
      const diffData = extractDiffData();
      sendResponse(diffData);
    }
  });
}

initialize();