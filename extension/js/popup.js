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
        if (chrome.runtime.lastError) {
          console.info(chrome.runtime.lastError.message);
          callback(null);
        } else {
          callback(response);
        }
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
          current[part].isViewed = diff.isViewed;
        }

        current = current[part].children;
      });
    });

    // ツリーの簡略化
    this.simplifier.simplify(tree);

    // isViewed フラグを親ディレクトリに設定
    this.setDirectoryViewed(tree);

    return tree;
  }

  /**
   * 再帰的にツリーを走査し、すべての子が isViewed=true であれば親にも isViewed=true を設定する
   */
  setDirectoryViewed(node) {
    Object.keys(node).forEach(key => {
      const item = node[key];
      if (this.hasChildren(item)) {
        this.setDirectoryViewed(item.children);
        const childrenKeys = Object.keys(item.children);
        const allViewed = childrenKeys.every(childKey => {
          const child = item.children[childKey];
          return child.isViewed === true;
        });
        if (allViewed) {
          item.isViewed = true;
        }
      }
    });
  }

  hasChildren(item) {
    return item.children && Object.keys(item.children).length > 0;
  }
}

class TreeSimplifier {
  simplify(node) {
    Object.keys(node).forEach(key => {
      let currentKey = key;
      let currentItem = node[key];

      // サブディレクトリが一つしかない限り、パスを結合
      while (Object.keys(currentItem.children).length === 1) {
        const childKey = Object.keys(currentItem.children)[0];
        const childItem = currentItem.children[childKey];

        if (Object.keys(childItem.children).length === 0) {
          break;
        }

        // パスを結合
        currentKey = `${currentKey}/${childKey}`;
        currentItem = childItem;
      }

      // パスを更新
      node[currentKey] = {
        diff: currentItem.diff,
        children: currentItem.children,
        filePath: currentItem.filePath || null
      };

      // 元のキーを削除
      if (currentKey !== key) {
        delete node[key];
      }

      // 再帰的に簡略化
      this.simplify(node[currentKey].children);
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
          className: `directory expanded${item.isViewed ? ' viewed' : ''}`
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
        if (item.isViewed) {
          li.classList.add('viewed');
        }
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
    this.progressContainer = document.getElementById('review-progress');
  }

  initialize() {
    this.dataFetcher.fetchActiveTabDiffData((response) => {
      this.handleResponse(response);
    });

    // CSVエクスポートボタンのイベントリスナーを追加
    const exportButton = document.getElementById('export-csv');
    exportButton.addEventListener('click', () => this.exportTreeDataToCSV());
  }

  handleResponse(response) {

    if (!response || response.length === 0) {
      // 差分が存在しない場合の処理
      this.container.innerHTML = '<div class="no-difference">No difference found.</div>';
      const exportButton = document.getElementById('export-csv');
      if (exportButton) {
        exportButton.disabled = true;
      }
      return;
    }

    this.updateReviewProgress(response);
    this.treeData = this.treeBuilder.buildTreeStructure(response);
    this.treeRenderer.render(this.container, this.treeData);
  }

  updateReviewProgress(diffs) {
    const totalDiff = diffs.reduce((sum, diff) => sum + (parseInt(diff.diff, 10) || 0), 0);
    const viewedDiff = diffs
      .filter(diff => diff.isViewed)
      .reduce((sum, diff) => sum + (parseInt(diff.diff, 10) || 0), 0);

    const progress = totalDiff === 0 ? 0 : ((viewedDiff / totalDiff) * 100).toFixed(2);

    this.progressContainer.textContent = `${progress}% (${viewedDiff.toLocaleString()} / ${totalDiff.toLocaleString()})`;
  }

  /**
   * treeData を CSV ファイルとしてエクスポートする
   */
  exportTreeDataToCSV() {
    if (!this.treeData) {
      console.error('ツリーデータがありません。');
      return;
    }

    const rows = [];
    rows.push(['ファイルパス', 'Diff', 'Viewed']);

    const traverse = (node) => {
      for (const key in node) {
        if (node.hasOwnProperty(key)) {
          const item = node[key];
          if (!this.treeRenderer.hasChildren(item)) {
            rows.push([item.filePath, item.diff, item.isViewed]);
          } else {
            traverse(item.children);
          }
        }
      }
    };

    traverse(this.treeData);

    const csvContent = '\uFEFF' + rows.map(e => e.join(",")).join("\n"); // BOM付きUTF-8

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'diffs.csv';
    a.click();
    URL.revokeObjectURL(url);
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