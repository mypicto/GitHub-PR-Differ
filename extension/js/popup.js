class DOMUtils {
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

    if (options.href) {
      element.href = options.href;
    }

    if (options.download) {
      element.download = options.download;
    }

    return element;
  }

  addClass(element, className) {
    if (!element.classList.contains(className)) {
      element.classList.add(className);
    }
  }

  removeClass(element, className) {
    if (element.classList.contains(className)) {
      element.classList.remove(className);
    }
  }
}

class DataFetcher {
  constructor(chromeApi) {
    this.chrome = chromeApi;
  }

  fetchActiveTabDiffData() {
    return new Promise((resolve, reject) => {
      this.chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs.length === 0) {
          console.error('No active tabs found.');
          resolve(null);
          return;
        }
        this.chrome.tabs.sendMessage(tabs[0].id, { action: "extractDiffData" }, (response) => {
          if (chrome.runtime.lastError) {
            console.info(chrome.runtime.lastError.message);
            resolve(null);
          } else {
            resolve(response);
          }
        });
      });
    });
  }
}

class TreeSimplifier {
  simplify(node) {
    Object.keys(node).sort().forEach(key => {
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
        filePath: currentItem.filePath || null,
        isViewed: currentItem.isViewed
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

class TreeBuilder {
  constructor(simplifier) {
    this.simplifier = simplifier;
  }

  buildTreeStructure(diffs) {
    const tree = {};
    diffs.forEach(diff => this.addDiffToTree(tree, diff));
    this.simplifier.simplify(tree);
    this.setDirectoryViewed(tree);
    return tree;
  }

  addDiffToTree(tree, diff) {
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
  }

  /**
   * 再帰的にツリーを走査し、すべての子が isViewed=true であれば親にも isViewed=true を設定する
   */
  setDirectoryViewed(node) {
    Object.keys(node).sort().forEach(key => {
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

class CSVExporter {
  constructor(domUtils) {
    this.domUtils = domUtils;
  }

  exportToCSV(treeData, treeRenderer) {
    if (!treeData) {
      console.error('ツリーデータがありません。');
      return;
    }

    const rows = [['ファイルパス', 'Diff', 'Viewed']];

    const traverse = (node) => {
      const sortedKeys = Object.keys(node).sort();
      for (const key of sortedKeys) {
        if (node.hasOwnProperty(key)) {
          const item = node[key];
          if (!treeRenderer.hasChildren(item)) {
            rows.push([item.filePath, item.diff, item.isViewed]);
          } else {
            traverse(item.children);
          }
        }
      }
    };

    traverse(treeData);

    const csvContent = '\uFEFF' + rows.map(e => e.join(",")).join("\n"); // BOM付きUTF-8

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = this.domUtils.createElement('a', { href: url, download: 'diffs.csv' });
    a.click();
    URL.revokeObjectURL(url);
  }
}

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
    Object.keys(node).sort().forEach(key => {
      const li = this.domUtils.createElement('li');
      const item = node[key];

      if (this.hasChildren(item)) {
        // ディレクトリの場合
        const span = this.domUtils.createElement('span', {
          textContent: `${key}/ (${item.diff.toLocaleString()})`,
          className: `directory ${item.isViewed ? 'viewed' : 'expanded'}`
        });

        span.addEventListener('click', (event) => this.handleClick(event));

        li.appendChild(span);

        const ul = this.domUtils.createElement('ul', { className: `nested ${item.isViewed ? 'collapsed' : ''}` });
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

  handleClick(event) {
    const span = event.target;
    const li = span.parentElement;
    this.toggleDirectory(li, span);
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

class TreeViewManager {
  constructor(containerId, dependencies) {
    this.container = document.getElementById(containerId);
    this.dataFetcher = dependencies.dataFetcher;
    this.treeBuilder = dependencies.treeBuilder;
    this.treeRenderer = dependencies.treeRenderer;
    this.progressContainer = document.getElementById('review-progress');
    this.domUtils = dependencies.domUtils;
    this.csvExporter = dependencies.csvExporter;
    this.treeData = null;
  }

  initialize() {
    this.bindEvents();
    this.fetchData();
  }

  bindEvents() {
    // CSVエクスポートボタンのイベントリスナーを追加
    const exportButton = document.getElementById('export-csv');
    exportButton.addEventListener('click', () => this.csvExporter.exportToCSV(this.treeData, this.treeRenderer));
  }

  async fetchData() {
    try {
      const response = await this.dataFetcher.fetchActiveTabDiffData();
      this.handleResponse(response);
    } catch (error) {
      console.error('データ取得中にエラーが発生しました:', error);
    }
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
    console.log(this.treeData);
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
}

// メインの初期化
document.addEventListener('DOMContentLoaded', () => {
  const chromeApi = chrome; // chrome APIの依存性

  // 各クラスのインスタンス生成
  const domUtils = new DOMUtils();
  const treeSimplifier = new TreeSimplifier();
  const treeBuilder = new TreeBuilder(treeSimplifier);
  const dataFetcher = new DataFetcher(chromeApi);
  const treeRenderer = new TreeRenderer(domUtils);
  const csvExporter = new CSVExporter(domUtils);

  // TreeViewManagerに依存性を注入
  const treeViewManager = new TreeViewManager('diff-data', {
    dataFetcher,
    treeBuilder,
    treeRenderer,
    domUtils,
    csvExporter
  });

  treeViewManager.initialize();
});