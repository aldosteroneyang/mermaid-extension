(function() {
  // 從 content.js 注入的 JSON script 中讀取全域 URL 設定。
  const globalsEl = document.getElementById('mermaid-extension-globals');
  const globals = globalsEl ? JSON.parse(globalsEl.textContent) : {};
  const PAKO_URL = globals.PAKO_URL;

  // ===== 初始化階段 =====
  
  // 添加全局樣式
  const styleEl = document.createElement('style');
  styleEl.textContent = `
    /* 隱藏所有 mermaid 代碼塊 */
    pre code.language-mermaid, 
    .language-mermaid {
      display: none !important;
    }
    
    /* 自定義按鈕樣式 */
    .mermaid-btn {
      margin: 5px 10px 5px 0;
      padding: 6px 12px;
      font-size: 12px;
      cursor: pointer;
      border: 1px solid #ccc;
      border-radius: 4px;
      background-color: #e0e0e0;
      color: #000;
      opacity: 0.8;
      transition: opacity 0.2s;
    }
    .mermaid-btn:hover {
      opacity: 1;
    }
    
    /* 按鈕容器 */
    .mermaid-buttons {
      display: flex;
      justify-content: flex-start;
      margin-top: 10px;
    }
    
    /* 錯誤消息樣式 */
    .mermaid-error {
      padding: 10px;
      border: 1px solid #dc3545;
      border-radius: 4px;
      margin-bottom: 10px;
      background-color: #f8d7da;
      color: #721c24;
    }
  `;
  document.head.appendChild(styleEl);

  // 攔截 mermaid 語言錯誤
  const originalConsoleError = console.error;
  console.error = function(...args) {
    if (args[0] && typeof args[0] === 'string' && args[0].includes('language \'mermaid\'')) {
      return; // 不顯示這些錯誤
    }
    originalConsoleError.apply(console, args);
  };

  // 載入 Pako 庫
  function loadScript(url, callback) {
    const script = document.createElement('script');
    script.src = url;
    script.onload = callback;
    script.onerror = function() {
      console.error("Failed to load script: " + url);
    };
    document.head.appendChild(script);
  }

  loadScript(PAKO_URL, function() {
    console.log("pako.min.js loaded");
    setTimeout(main, 100);
  });

  // ===== 轉換階段 =====

  // 將 Mermaid 代碼壓縮並編碼為 Base64 字串
  function getEncodedPayload(mermaidCode) {
    // 添加灰色主題設定（如果不存在）
    if (!mermaidCode.includes('%%{init:')) {
      mermaidCode = `%%{init: {'theme': 'default', 'themeVariables': { 'nodeBorder': '#c0c0c0', 'nodeBkg': '#e0e0e0', 'nodeTextColor': '#000000', 'mainBkg': '#e0e0e0', 'clusterBkg': '#e0e0e0' }}}%%\n${mermaidCode}`;
    }
    
    const payload = {
      code: mermaidCode,
      mermaid: { 
        theme: "default",
        themeVariables: { 
          nodeBorder: '#c0c0c0', 
          nodeBkg: '#e0e0e0', 
          nodeTextColor: '#000000',
          mainBkg: '#e0e0e0',
          clusterBkg: '#e0e0e0' 
        }
      },
      updateEditor: true,
      autoSync: true
    };
    
    try {
      const jsonStr = JSON.stringify(payload);
      const jsonUint8 = new TextEncoder().encode(jsonStr);
      const compressed = pako.deflate(jsonUint8);
      const binaryStr = Array.from(compressed)
        .map(byte => String.fromCharCode(byte))
        .join('');
      return btoa(binaryStr)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
    } catch (error) {
      console.warn('編碼 Mermaid 代碼時出錯:', error);
      return '';
    }
  }

  // 取得圖片 URL
  function getMermaidImageUrl(mermaidCode) {
    return "https://mermaid.ink/img/pako:" + getEncodedPayload(mermaidCode);
  }

  // 取得編輯器 URL
  function getMermaidEditorUrl(mermaidCode) {
    return "https://mermaid.live/edit#pako:" + getEncodedPayload(mermaidCode);
  }

  // ===== 主要功能階段 =====

  function main() {
    // 處理 Mermaid 代碼
    function processMermaidCode(code) {
      if (!code) return '';
      
      try {
        // 基本清理
        code = code.replace(/\r\n/g, "\n").trim();
        
        // 處理常見問題字符
        code = code.replace(/[\u2018\u2019]/g, "'")  // 智能單引號
                   .replace(/[\u201C\u201D]/g, '"')  // 智能雙引號
                   .replace(/\u2014/g, '--')         // 破折號
                   .replace(/\u2013/g, '-')          // 連字符
                   .replace(/\u2026/g, '...');       // 省略號
        
        // 處理節點文本和表格單元格
        const sanitizeText = (text) => text.replace(/\(/g, '')
                                        .replace(/\)/g, '')
                                        .replace(/"/g, "'")
                                        .replace(/^\s*(?:\d+\.\s+|[*-]\s+)/, '')
                                        .replace(/[<>]/g, '_');
        
        code = code.replace(/\[[^\]]*\]/g, match => 
          '[' + sanitizeText(match.slice(1, -1)) + ']'
        );
        
        code = code.replace(/\|[^\|]*\|/g, match => 
          '|' + sanitizeText(match.slice(1, -1)) + '|'
        );
        
        // 確保有有效的語法聲明
        if (code.indexOf('graph ') !== 0 && 
            !code.match(/^(sequenceDiagram|classDiagram|gantt|pie|flowchart |erDiagram|journey|gitGraph)/)) {
          // 如果缺少有效聲明，預設為流程圖
          if (code.indexOf('TD') === 0 || code.indexOf('LR') === 0) {
            code = 'graph ' + code;
          } else {
            code = 'graph TD\n' + code;
          }
        }
        
        return code;
      } catch (error) {
        console.warn('處理 Mermaid 代碼時出錯:', error);
        return code; // 返回原始代碼
      }
    }
    
    // 渲染單個 Mermaid 區塊
    function renderMermaidBlock(codeBlock) {
      if (codeBlock.dataset.rendered) return;
      
      try {
        // 獲取並處理代碼
        let code = codeBlock.textContent;
        if (!code || code.trim() === '') return;
        
        code = processMermaidCode(code);
        
        // 創建容器
        const container = document.createElement('div');
        container.className = 'mermaid-container';
        container.style.position = 'relative';
        container.style.marginTop = '10px';
        
        // 添加到 DOM
        const preElem = codeBlock.closest('pre');
        if (preElem) {
          preElem.insertAdjacentElement('afterend', container);
          preElem.style.display = 'none';
        } else {
          codeBlock.insertAdjacentElement('afterend', container);
          codeBlock.style.display = 'none';
        }
        
        // 產生 URL
        const imageUrl = getMermaidImageUrl(code);
        const editorUrl = getMermaidEditorUrl(code);
        
        // 添加圖片
        const imgElem = document.createElement('img');
        imgElem.src = imageUrl;
        imgElem.alt = "Mermaid Diagram";
        imgElem.style.display = 'block';
        imgElem.style.maxWidth = '100%';
        
        // 圖片錯誤處理
        imgElem.onerror = function() {
          this.style.display = 'none';
          
          // 顯示錯誤信息
          const errorMsg = document.createElement('div');
          errorMsg.className = 'mermaid-error';
          errorMsg.textContent = '圖表無法渲染。可能是由於語法錯誤或不支援的語法。';
          container.insertBefore(errorMsg, container.firstChild);
        };
        
        container.appendChild(imgElem);
        
        // 添加按鈕容器
        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'mermaid-buttons';
        container.appendChild(buttonContainer);
        
        // 添加「Re-render Diagram」按鈕
        const rerenderBtn = document.createElement('button');
        rerenderBtn.textContent = "Re-render Diagram";
        rerenderBtn.className = 'mermaid-btn';
        rerenderBtn.addEventListener("click", function(e) {
          container.innerHTML = "";
          codeBlock.removeAttribute('data-rendered');
          renderMermaidBlock(codeBlock);
        });
        buttonContainer.appendChild(rerenderBtn);
        
        // 添加「Open Live Editor」按鈕
        const openBtn = document.createElement('button');
        openBtn.textContent = "Open Live Editor";
        openBtn.className = 'mermaid-btn';
        openBtn.addEventListener("click", function() {
          window.open(editorUrl, "_blank");
        });
        buttonContainer.appendChild(openBtn);
        
        codeBlock.dataset.rendered = true;
      } catch (error) {
        console.warn('渲染 Mermaid 圖表時出錯:', error);
      }
    }
    
    // 渲染所有 Mermaid 區塊
    function renderAllMermaidBlocks() {
      document.querySelectorAll('pre code.language-mermaid:not([data-rendered])').forEach(renderMermaidBlock);
    }
    
    // 初始渲染並設置監聽
    renderAllMermaidBlocks();
    
    // 使用 MutationObserver 監聽 DOM 變化
    try {
      const observer = new MutationObserver(() => setTimeout(renderAllMermaidBlocks, 100));
      observer.observe(document.body, { childList: true, subtree: true });
    } catch (error) {
      // 回退方案
      setInterval(renderAllMermaidBlocks, 2000);
    }
  }
})();
