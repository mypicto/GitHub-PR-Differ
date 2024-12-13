document.addEventListener('DOMContentLoaded', () => {
  const treeView = new TreeViewManager('diff-data');
  treeView.initialize();
});

class TreeViewManager {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.treeData = {};
  }

  initialize() {
    this.fetchDiffData();
  }

  fetchDiffData() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length === 0) {
        console.error('No active tabs found.');
        return;
      }
      chrome.tabs.sendMessage(tabs[0].id, { action: "extractDiffData" }, (response) => {
        this.handleResponse(response);
      });
    });
  }

  handleResponse(response) {
    if (!response) {
      console.error('No response received from content script.');
      return;
    }

    this.treeData = this.buildTreeStructure(response);
    this.renderTreeView();
  }

  buildTreeStructure(diffs) {
    const tree = {};

    diffs.forEach(diff => {
      const parts = diff.filePath.split('/');
      let current = tree;
      const fileDiff = parseInt(diff.diff, 10) || 0;

      parts.forEach((part, index) => {
        if (!current[part]) {
          current[part] = { diff: 0, children: {} };
        }
        // ディレクトリの累積diffを更新
        current[part].diff += fileDiff;

        if (index === parts.length - 1) {
          // ファイルの場合、累積diffを上書き
          current[part].filePath = diff.filePath;
          current[part].diff = fileDiff;
        }

        current = current[part].children;
      });
    });

    return tree;
  }

  renderTreeView() {
    // 既存のコンテンツをクリア
    this.container.innerHTML = '';

    // ツリービューの作成
    const ul = this.createElement('ul', { className: 'tree-root' });
    this.createTreeView(ul, this.treeData);
    this.container.appendChild(ul);
  }

  createTreeView(parent, node) {
    Object.keys(node).forEach(key => {
      const li = this.createElement('li');
      const item = node[key];

      if (this.hasChildren(item)) {
        // ディレクトリの場合
        const span = this.createElement('span', {
          textContent: `${key}/ (${item.diff})`,
          className: 'directory expanded'
        });

        span.addEventListener('click', () => this.toggleDirectory(li, span));

        li.appendChild(span);

        const ul = this.createElement('ul', { className: 'nested' });
        this.createTreeView(ul, item.children);
        li.appendChild(ul);
      } else {
        // ファイルの場合
        li.textContent = `${key} (${item.diff})`;
        li.classList.add('file');
      }

      parent.appendChild(li);
    });
  }

  toggleDirectory(li, span) {
    const childUl = li.querySelector('ul');
    if (childUl) {
      const isHidden = childUl.classList.toggle('collapsed');
      span.classList.toggle('expanded', !isHidden);
    }
  }

  hasChildren(item) {
    return item.children && Object.keys(item.children).length > 0;
  }

  createElement(tag, options = {}) {
    const element = document.createElement(tag);

    if (options.textContent) {
      element.textContent = options.textContent;
    }

    if (options.className) {
      element.className = options.className;
    }

    if (options.styles) {
      Object.assign(element.style, options.styles);
    }

    return element;
  }
}