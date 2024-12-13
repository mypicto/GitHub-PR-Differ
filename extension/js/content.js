function extractFilePath(fileElement) {
  const filePath = fileElement.getAttribute('data-tagsearch-path');
  if (!filePath) {
    return null;
  }

  const isHidden = fileElement.hasAttribute('hidden');
  if (isHidden) {
    return null;
  }

  if (filePath.endsWith('HowMany2.unity')) {
    console.log(fileElement);
  }

  return filePath;
}

function parseDiffText(diffstatElement) {
  if (!diffstatElement) {
    console.error('Element with class "diffstat" not found.');
    return null;
  }

  let diffText = diffstatElement.textContent.trim();
  diffText = diffText.replace(/,/g, ''); // Remove commas
  if (diffText.includes('BIN')) {
    return null;
  }

  const diff = Number(diffText);
  if (isNaN(diff)) {
    console.warn(`Diff value "${diffText}" is not a valid number.`);
    return null;
  }

  return diff;
}

function extractFileData(fileElement) {
  const filePath = extractFilePath(fileElement);
  if (!filePath) {
    return null;
  }

  const diffstatElement = fileElement.querySelector('span.diffstat');
  const diff = parseDiffText(diffstatElement);
  if (!diff) {
    return null;
  }

  return { filePath, diff };
}

function extractDiffData() {
  const files = [...document.querySelectorAll('.file')];
  return files.map(extractFileData).filter(Boolean);
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