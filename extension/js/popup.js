// DOMUtils.js
class DOMUtils {
  static createElement(tag, options = {}) {
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

// DataFetcher.js
class DataFetcher {
  constructor(chromeApi) {
    this.chrome = chromeApi;
  }

  fetchActiveTabDiffData(callback) {
    this.chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length === 0) {
        console.error('No active tabs found.');
        callback(null);
        return;
      }
      this.chrome.tabs.sendMessage(tabs[0].id, { action: "extractDiffData" }, (response) => {
        callback(response);
      });
    });
  }
}

// TreeBuilder.js
class TreeBuilder {
  constructor(simplifier) {
    this.simplifier = simplifier;
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

    // ツリーの簡略化
    this.simplifier.simplify(tree);

    return tree;
  }
}

// TreeSimplifier.js
class TreeSimplifier {
  simplify(node) {
    Object.keys(node).forEach(key => {
      const item = node[key];
      const childKeys = Object.keys(item.children);

      // サブディレクトリが1つだけで、かつその子がさらに子を持つ場合
      if (childKeys.length === 1) {
        const childKey = childKeys[0];
        const childItem = item.children[childKey];

        if (Object.keys(childItem.children).length > 0) { // 追加条件
          // パスを結合
          const combinedKey = `${key}/${childKey}`;
          node[combinedKey] = {
            diff: item.diff + childItem.diff,
            children: childItem.children,
            filePath: childItem.filePath || null
          };
          delete node[key];

          // 再帰的に簡略化
          this.simplify(node[combinedKey].children);
        } else {
          // 子がさらに子を持たない場合は結合しない
          this.simplify(item.children);
        }
      } else {
        // サブディレクトリが複数ある場合、再帰的に処理
        this.simplify(item.children);
      }
    });
  }
}

// TreeRenderer.js
class TreeRenderer {
  constructor(domUtils) {
    this.domUtils = domUtils;
  }

  render(container, treeData) {
    // 既存のコンテンツをクリア
    container.innerHTML = '';

    // ツリービューの作成
    const ul = this.domUtils.createElement('ul', { className: 'tree-root' });
    this.createTreeView(ul, treeData);
    container.appendChild(ul);
  }

  createTreeView(parent, node) {
    Object.keys(node).forEach(key => {
      const li = this.domUtils.createElement('li');
      const item = node[key];

      if (this.hasChildren(item)) {
        // ディレクトリの場合
        const span = this.domUtils.createElement('span', {
          textContent: `${key}/ (${item.diff.toLocaleString()})`,
          className: 'directory expanded'
        });

        span.addEventListener('click', () => this.toggleDirectory(li, span));

        li.appendChild(span);

        const ul = this.domUtils.createElement('ul', { className: 'nested' });
        this.createTreeView(ul, item.children);
        li.appendChild(ul);
      } else {
        // ファイルの場合
        li.textContent = `${key} (${item.diff.toLocaleString()})`;
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
}

// TreeViewManager.js
class TreeViewManager {
  constructor(containerId, dependencies) {
    this.container = document.getElementById(containerId);
    this.dataFetcher = dependencies.dataFetcher;
    this.treeBuilder = dependencies.treeBuilder;
    this.treeRenderer = dependencies.treeRenderer;
  }

  initialize() {
    this.dataFetcher.fetchActiveTabDiffData((response) => {
      this.handleResponse(response);
    });
  }

  handleResponse(response) {
    if (!response) {
      console.log('No response received from content script.');
      return;
    }

    this.treeData = this.treeBuilder.buildTreeStructure(response);
    this.treeRenderer.render(this.container, this.treeData);
  }
}

// メインの初期化
document.addEventListener('DOMContentLoaded', () => {
  const chromeApi = chrome; // chrome APIの依存性

  // 各クラスのインスタンス生成
  const domUtils = DOMUtils;
  const treeSimplifier = new TreeSimplifier();
  const treeBuilder = new TreeBuilder(treeSimplifier);
  const dataFetcher = new DataFetcher(chromeApi);
  const treeRenderer = new TreeRenderer(DOMUtils);

  // TreeViewManagerに依存性を注入
  const treeViewManager = new TreeViewManager('diff-data', {
    dataFetcher,
    treeBuilder,
    treeRenderer
  });

  treeViewManager.initialize();
});