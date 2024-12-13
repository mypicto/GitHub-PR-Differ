document.addEventListener('DOMContentLoaded', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    chrome.tabs.sendMessage(tabs[0].id, { action: "extractDiffData" }, (response) => {
      if (response) {
        const diffDataList = document.getElementById('diff-data');

        // Build the tree structure
        const tree = {};

        response.forEach(diff => {
          const parts = diff.filePath.split('/');
          let current = tree;
          let cumulativeDiff = parseInt(diff.diff, 10) || 0;

          parts.forEach((part, index) => {
            if (!current[part]) {
              current[part] = { __diff: 0, __children: {} };
            }
            current[part].__diff += cumulativeDiff;
            if (index === parts.length - 1) {
              current[part].__filePath = diff.filePath;
              current[part].__diff = cumulativeDiff; // Assuming file diff is not cumulative
            }
            current = current[part].__children;
          });
        });

        // Function to create tree view recursively
        function createTreeView(parent, node) {
          Object.keys(node).forEach(key => {
            const li = document.createElement('li');
            if (node[key].__children && Object.keys(node[key].__children).length > 0) {
              // It's a directory
              const span = document.createElement('span');
              span.textContent = `${key} (Total Diffs: ${node[key].__diff})`;
              span.classList.add('directory');
              span.style.cursor = 'pointer';
              span.addEventListener('click', () => {
                const childUl = li.querySelector('ul');
                if (childUl) {
                  childUl.style.display = childUl.style.display === 'none' ? 'block' : 'none';
                }
                span.classList.toggle('expanded');
              });
              li.appendChild(span);

              const ul = document.createElement('ul');
              ul.style.listStyleType = 'none';
              ul.style.paddingLeft = '20px';
              createTreeView(ul, node[key].__children);
              li.appendChild(ul);
            } else {
              // It's a file
              li.textContent = `${key} (Diffs: ${node[key].__diff})`;
            }
            parent.appendChild(li);
          });
        }

        // Clear any existing content
        diffDataList.innerHTML = '';

        // Create the tree view
        const ul = document.createElement('ul');
        ul.style.listStyleType = 'none';
        createTreeView(ul, tree);
        diffDataList.appendChild(ul);
      }
    });
  });
});