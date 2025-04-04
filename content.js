(function() {
  // 建立一個 JSON script 元素，用來儲存全域 URL 設定（現在僅包含 pako.min.js）。
  const globalsScript = document.createElement('script');
  globalsScript.type = 'application/json';
  globalsScript.id = 'mermaid-extension-globals';
  const globals = {
    PAKO_URL: chrome.runtime.getURL("pako.min.js")
  };
  globalsScript.textContent = JSON.stringify(globals);
  (document.head || document.documentElement).appendChild(globalsScript);

  // 注入主程式 injected.js 到頁面中。
  const injectedScript = document.createElement('script');
  injectedScript.src = chrome.runtime.getURL("injected.js");
  injectedScript.onload = function() {
    this.remove();
  };
  (document.head || document.documentElement).appendChild(injectedScript);
})();
