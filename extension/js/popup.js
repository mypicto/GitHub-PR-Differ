document.addEventListener('DOMContentLoaded', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    chrome.tabs.sendMessage(tabs[0].id, { action: "extractDiffData" }, (response) => {
      if (response) {
        const diffDataList = document.getElementById('diff-data');
        response.forEach(diff => {
          const listItem = document.createElement('li');
          listItem.textContent = `${diff.filePath}, Diffs: ${diff.diff}`;
          diffDataList.appendChild(listItem);
        });
      }
    });
  });
});