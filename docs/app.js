/**
 * RetroSpec UI Logic and Orchestration
 */

document.addEventListener('DOMContentLoaded', () => {
  // Initialize the parser
  const parser = new window.ProGuardMapParser();
  let debounceTimeout = null;

  // DOM Elements
  const mappingDropzone = document.getElementById('mappingDropzone');
  const mappingFileInput = document.getElementById('mappingFileInput');
  const mappingDropTitle = document.getElementById('mappingDropTitle');
  const mappingDropDesc = document.getElementById('mappingDropDesc');

  const logDropzone = document.getElementById('logDropzone');
  const logFileInput = document.getElementById('logFileInput');
  const logDropTitle = document.getElementById('logDropTitle');
  const logDropDesc = document.getElementById('logDropDesc');

  const statClasses = document.getElementById('statClasses');
  const statMethods = document.getElementById('statMethods');
  const statFields = document.getElementById('statFields');

  const demoBtn = document.getElementById('demoBtn');
  const copyBtn = document.getElementById('copyBtn');
  const downloadBtn = document.getElementById('downloadBtn');
  const clearBtn = document.getElementById('clearBtn');

  const stacktraceInput = document.getElementById('stacktraceInput');
  const retraceOutput = document.getElementById('retraceOutput');
  const outputEmptyState = document.getElementById('outputEmptyState');
  const outputContent = document.getElementById('outputContent');

  const browserSearchInput = document.getElementById('browserSearchInput');
  const treeContainer = document.getElementById('treeContainer');
  const browserEmptyState = document.getElementById('browserEmptyState');
  const treeContent = document.getElementById('treeContent');

  // Mobile Tabs
  const tabInputBtn = document.getElementById('tabInputBtn');
  const tabOutputBtn = document.getElementById('tabOutputBtn');
  const tabBrowserBtn = document.getElementById('tabBrowserBtn');

  // --- Mobile Tab Switching ---
  function setActiveTab(activeTabClass, activeBtn) {
    document.body.classList.remove('tab-input-active', 'tab-output-active', 'tab-browser-active');
    document.body.classList.add(activeTabClass);

    [tabInputBtn, tabOutputBtn, tabBrowserBtn].forEach(btn => btn.classList.remove('active'));
    activeBtn.classList.add('active');
  }

  tabInputBtn.addEventListener('click', () => setActiveTab('tab-input-active', tabInputBtn));
  tabOutputBtn.addEventListener('click', () => setActiveTab('tab-output-active', tabOutputBtn));
  tabBrowserBtn.addEventListener('click', () => setActiveTab('tab-browser-active', tabBrowserBtn));

  // --- Dropzone & File Loading Logics ---
  function setupDropzone(dropzone, input, fileHandler) {
    // Click triggers file select
    dropzone.addEventListener('click', (e) => {
      if (e.target !== input) {
        input.click();
      }
    });

    // Drag-over styling
    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('drag-active');
    });

    dropzone.addEventListener('dragleave', () => {
      dropzone.classList.remove('drag-active');
    });

    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('drag-active');
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        fileHandler(files[0]);
      }
    });

    input.addEventListener('change', () => {
      const files = input.files;
      if (files.length > 0) {
        fileHandler(files[0]);
      }
    });
  }

  // Handle mapping.txt files
  function handleMappingFile(file) {
    if (!file) return;

    const reader = new FileReader();
    
    mappingDropTitle.textContent = "Parsing File...";
    mappingDropDesc.textContent = file.name;
    mappingDropzone.classList.add('drag-active');

    reader.onload = (e) => {
      const content = e.target.result;
      
      // Parse mapping content
      parser.parse(content, (progress) => {
        mappingDropTitle.textContent = `Parsing... ${progress}%`;
      });

      // Update mapping status indicators
      mappingDropzone.classList.remove('drag-active');
      mappingDropzone.classList.add('success-active');
      mappingDropTitle.textContent = "Mapping Loaded Successfully";
      mappingDropDesc.textContent = `${file.name} (${formatBytes(file.size)})`;

      // Update Statistics
      updateStats();

      // Render Tree Browser
      renderMappingBrowser();

      // Trigger retrace since mappings changed
      triggerRetrace();
    };

    reader.readAsText(file);
  }

  // Handle stacktrace log files
  function handleLogFile(file) {
    if (!file) return;

    const reader = new FileReader();
    
    logDropTitle.textContent = "Reading File...";
    logDropDesc.textContent = file.name;
    logDropzone.classList.add('drag-active');

    reader.onload = (e) => {
      const content = e.target.result;
      stacktraceInput.value = content;
      
      logDropzone.classList.remove('drag-active');
      logDropzone.classList.add('success-active');
      logDropTitle.textContent = "Stacktrace File Loaded";
      logDropDesc.textContent = `${file.name} (${formatBytes(file.size)})`;

      // Auto-switch to output view on mobile to show results
      if (window.innerWidth <= 768) {
        setActiveTab('tab-output-active', tabOutputBtn);
      }

      // Trigger de-obfuscation
      triggerRetrace();
    };

    reader.readAsText(file);
  }

  setupDropzone(mappingDropzone, mappingFileInput, handleMappingFile);
  setupDropzone(logDropzone, logFileInput, handleLogFile);

  // --- Statistics Update ---
  function updateStats() {
    statClasses.textContent = parser.totalClasses.toLocaleString();
    statMethods.textContent = parser.totalMethods.toLocaleString();
    statFields.textContent = parser.totalFields.toLocaleString();
  }

  // --- Retracing & Dynamic Formatting ---
  stacktraceInput.addEventListener('input', () => {
    // Debounce to keep typing smooth in browser
    clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(() => {
      triggerRetrace();
    }, 150);
  });

  function triggerRetrace() {
    const text = stacktraceInput.value.trim();
    if (!text) {
      outputEmptyState.style.display = 'flex';
      outputContent.style.display = 'none';
      return;
    }

    outputEmptyState.style.display = 'none';
    outputContent.style.display = 'block';

    const retracedLines = parser.retraceStackTrace(text);
    renderRetracedOutput(retracedLines);
  }

  function renderRetracedOutput(lines) {
    outputContent.innerHTML = '';
    
    const fragment = document.createDocumentFragment();

    lines.forEach(lineObj => {
      const lineEl = document.createElement('span');
      lineEl.className = 'line-wrapper';

      if (lineObj.type === 'frame') {
        lineEl.classList.add('line-frame');
        
        // Highlight de-obfuscated items inside the stack trace frame
        const meta = lineObj.metadata;
        if (meta.matched) {
          // Break down: prefix, class, method, filename:line, suffix
          // Standard frame matches: "(prefix)class.method(fileName:line)(suffix)"
          const retraceStr = lineObj.retracedLine;
          
          // Construct HTML with hovering capabilities
          const methodFull = `${meta.retracedClass}.${meta.retracedMethod}`;
          const obfuscatedMethodFull = `${meta.obfuscatedClass}.${meta.obfuscatedMethod}`;
          
          // Tooltip description of mapping rule
          let tooltip = `Mapped from:\n${obfuscatedMethodFull}`;
          if (meta.obfuscatedLine) {
            tooltip += `\nLine range: ${meta.obfuscatedLine} -> ${meta.retracedLineNum || meta.obfuscatedLine}`;
          }

          // Format output line with highlights
          const textNode = document.createElement('span');
          
          // Parse prefix
          const originalLine = lineObj.retracedLine;
          const matchIndex = originalLine.indexOf(`${meta.retracedClass}.${meta.retracedMethod}`);
          
          if (matchIndex !== -1) {
            const prefix = originalLine.substring(0, matchIndex);
            const mid = `${meta.retracedClass}.${meta.retracedMethod}`;
            const suffix = originalLine.substring(matchIndex + mid.length);

            const prefixEl = document.createTextNode(prefix);
            const midEl = document.createElement('span');
            midEl.className = 'mapped-symbol';
            midEl.textContent = mid;
            midEl.setAttribute('data-tooltip', tooltip);
            
            const suffixEl = document.createTextNode(suffix);

            textNode.appendChild(prefixEl);
            textNode.appendChild(midEl);
            textNode.appendChild(suffixEl);
          } else {
            textNode.textContent = retraceStr;
          }
          
          lineEl.appendChild(textNode);
        } else {
          lineEl.textContent = lineObj.retracedLine;
        }

      } else if (lineObj.type === 'caused-by') {
        lineEl.classList.add('line-caused-by');
        const meta = lineObj.metadata;
        
        if (meta.matched) {
          const originalLine = lineObj.retracedLine;
          const matchIndex = originalLine.indexOf(meta.retracedClass);
          
          if (matchIndex !== -1) {
            const prefix = originalLine.substring(0, matchIndex);
            const mid = meta.retracedClass;
            const suffix = originalLine.substring(matchIndex + mid.length);

            const prefixEl = document.createTextNode(prefix);
            const midEl = document.createElement('span');
            midEl.className = 'mapped-symbol';
            midEl.textContent = mid;
            midEl.setAttribute('data-tooltip', `Mapped from: ${meta.obfuscatedClass}`);
            
            const suffixEl = document.createTextNode(suffix);

            lineEl.appendChild(prefixEl);
            lineEl.appendChild(midEl);
            lineEl.appendChild(suffixEl);
          } else {
            lineEl.textContent = lineObj.retracedLine;
          }
        } else {
          lineEl.textContent = lineObj.retracedLine;
        }

      } else {
        lineEl.classList.add('line-text');
        lineEl.textContent = lineObj.retracedLine;
      }

      fragment.appendChild(lineEl);
    });

    outputContent.appendChild(fragment);
  }

  // --- Mapping Browser tree rendering ---
  browserSearchInput.addEventListener('input', () => {
    renderMappingBrowser();
  });

  function renderMappingBrowser() {
    const query = browserSearchInput.value.toLowerCase().trim();
    
    if (parser.totalClasses === 0) {
      browserEmptyState.style.display = 'flex';
      treeContent.style.display = 'none';
      return;
    }

    browserEmptyState.style.display = 'none';
    treeContent.style.display = 'block';
    treeContent.innerHTML = '';

    // Filter and collect classes matching search term
    const matchedClasses = [];
    for (const [obfuscatedName, classObj] of parser.classesByObfuscated.entries()) {
      const originalName = classObj.originalName;
      if (!query || originalName.toLowerCase().includes(query) || obfuscatedName.toLowerCase().includes(query)) {
        matchedClasses.push(classObj);
      }
    }

    if (matchedClasses.length === 0) {
      treeContent.innerHTML = '<div class="empty-state" style="padding:1.5rem 0;"><div class="empty-title">No Search Results</div><p style="font-size:0.75rem;">Try searching for another class name.</p></div>';
      return;
    }

    // Limit visible classes to 100 to prevent DOM lagging
    const maxVisible = 100;
    const itemsToRender = matchedClasses.slice(0, maxVisible);

    const fragment = document.createDocumentFragment();

    // Show warning if results were truncated
    if (matchedClasses.length > maxVisible) {
      const banner = document.createElement('div');
      banner.style.padding = '0.5rem 1rem';
      banner.style.marginBottom = '0.5rem';
      banner.style.fontSize = '0.75rem';
      banner.style.color = 'var(--accent-cyan)';
      banner.style.background = 'rgba(0, 242, 254, 0.08)';
      banner.style.border = '1px solid rgba(0, 242, 254, 0.2)';
      banner.style.borderRadius = '8px';
      banner.textContent = `Showing first ${maxVisible} of ${matchedClasses.length.toLocaleString()} matching classes. Please search to narrow down results.`;
      fragment.appendChild(banner);
    }

    itemsToRender.forEach(classObj => {
      const nodeEl = document.createElement('div');
      nodeEl.className = 'tree-node';

      // Header row
      const headerEl = document.createElement('div');
      headerEl.className = 'tree-header';
      
      const leftEl = document.createElement('div');
      leftEl.className = 'tree-header-left';

      const arrowEl = document.createElement('span');
      arrowEl.className = 'tree-arrow';
      arrowEl.textContent = '▶';

      const classLabel = document.createElement('span');
      classLabel.className = 'tree-class-name';
      // Show simple name in bold, full package name in gray
      const dotIndex = classObj.originalName.lastIndexOf('.');
      const pkg = dotIndex !== -1 ? classObj.originalName.substring(0, dotIndex + 1) : '';
      const name = dotIndex !== -1 ? classObj.originalName.substring(dotIndex + 1) : classObj.originalName;
      
      const pkgSpan = document.createElement('span');
      pkgSpan.style.color = 'var(--text-secondary)';
      pkgSpan.textContent = pkg;
      
      const nameSpan = document.createElement('strong');
      nameSpan.style.color = '#ffffff';
      nameSpan.textContent = name;

      classLabel.appendChild(pkgSpan);
      classLabel.appendChild(nameSpan);

      const obfuscatedLabel = document.createElement('span');
      obfuscatedLabel.className = 'tree-obfuscated-class';
      obfuscatedLabel.textContent = ` -> ${classObj.obfuscatedName}`;

      leftEl.appendChild(arrowEl);
      leftEl.appendChild(classLabel);
      leftEl.appendChild(obfuscatedLabel);
      headerEl.appendChild(leftEl);

      // Children list
      const childrenEl = document.createElement('div');
      childrenEl.className = 'tree-children';

      // Click to toggle children accordion list
      headerEl.addEventListener('click', () => {
        const isExpanded = nodeEl.classList.toggle('expanded');
        
        // Lazy render contents on first expand for performance
        if (isExpanded && childrenEl.children.length === 0) {
          renderClassMembers(classObj, childrenEl);
        }
      });

      nodeEl.appendChild(headerEl);
      nodeEl.appendChild(childrenEl);
      fragment.appendChild(nodeEl);
    });

    treeContent.appendChild(fragment);
  }

  // Dynamically render fields and methods inside node children
  function renderClassMembers(classObj, containerEl) {
    const listFragment = document.createDocumentFragment();

    // Render Fields
    if (classObj.fieldsList.length > 0) {
      const sectionTitle = document.createElement('div');
      sectionTitle.style.fontSize = '0.7rem';
      sectionTitle.style.color = 'var(--text-muted)';
      sectionTitle.style.marginTop = '0.25rem';
      sectionTitle.style.marginBottom = '0.25rem';
      sectionTitle.style.fontWeight = 'bold';
      sectionTitle.textContent = 'FIELDS';
      listFragment.appendChild(sectionTitle);

      classObj.fieldsList.forEach(field => {
        const item = document.createElement('div');
        item.className = 'tree-child-item';

        const left = document.createElement('span');
        left.className = 'tree-child-original';
        
        const type = document.createElement('span');
        type.className = 'tree-child-type';
        type.textContent = field.fieldType;
        
        const name = document.createTextNode(field.originalName);

        left.appendChild(type);
        left.appendChild(name);

        const right = document.createElement('span');
        right.className = 'tree-child-obfuscated';
        right.textContent = field.obfuscatedName;

        item.appendChild(left);
        item.appendChild(right);
        listFragment.appendChild(item);
      });
    }

    // Render Methods
    if (classObj.methodsList.length > 0) {
      const sectionTitle = document.createElement('div');
      sectionTitle.style.fontSize = '0.7rem';
      sectionTitle.style.color = 'var(--text-muted)';
      sectionTitle.style.marginTop = '0.65rem';
      sectionTitle.style.marginBottom = '0.25rem';
      sectionTitle.style.fontWeight = 'bold';
      sectionTitle.textContent = 'METHODS';
      listFragment.appendChild(sectionTitle);

      classObj.methodsList.forEach(method => {
        const item = document.createElement('div');
        item.className = 'tree-child-item';

        const left = document.createElement('span');
        left.className = 'tree-child-original';

        // Add line range detail if exists
        let lineDetail = '';
        if (method.startLine !== null && method.endLine !== null) {
          lineDetail = ` [${method.startLine}:${method.endLine} ➔ ${method.originalStartLine}]`;
        }
        
        const type = document.createElement('span');
        type.className = 'tree-child-type';
        type.textContent = method.returnType;
        
        const name = document.createTextNode(`${method.originalName}(${method.paramTypes})${lineDetail}`);

        left.appendChild(type);
        left.appendChild(name);

        const right = document.createElement('span');
        right.className = 'tree-child-obfuscated';
        right.textContent = method.obfuscatedName;

        item.appendChild(left);
        item.appendChild(right);
        listFragment.appendChild(item);
      });
    }

    if (classObj.fieldsList.length === 0 && classObj.methodsList.length === 0) {
      const empty = document.createElement('div');
      empty.style.fontSize = '0.75rem';
      empty.style.color = 'var(--text-muted)';
      empty.style.padding = '0.5rem 0';
      empty.textContent = 'No members mapped for this class.';
      listFragment.appendChild(empty);
    }

    containerEl.appendChild(listFragment);
  }

  // --- Button & Control Click Handlers ---

  // Copy Retraced Output to clipboard
  copyBtn.addEventListener('click', () => {
    const text = getRawOutputText();
    if (!text) {
      alert("No retraced stack trace to copy.");
      return;
    }
    
    navigator.clipboard.writeText(text)
      .then(() => {
        const originalText = copyBtn.innerHTML;
        copyBtn.style.background = 'rgba(6, 214, 160, 0.2)';
        copyBtn.style.color = 'var(--accent-green)';
        copyBtn.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          Copied!
        `;
        
        setTimeout(() => {
          copyBtn.style.background = '';
          copyBtn.style.color = '';
          copyBtn.innerHTML = originalText;
        }, 1500);
      })
      .catch(err => {
        console.error("Failed to copy text: ", err);
      });
  });

  // Download Output as text file
  downloadBtn.addEventListener('click', () => {
    const text = getRawOutputText();
    if (!text) {
      alert("No retraced stack trace to download.");
      return;
    }

    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'retraced_stacktrace.txt';
    document.body.appendChild(a);
    a.click();
    
    setTimeout(() => {
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    }, 0);
  });

  // Load Demo Data
  demoBtn.addEventListener('click', () => {
    // 1. Mock ProGuard mapping.txt
    const DEMO_MAPPING = `# compiler: R8
# compiler_version: 3.2.47
# min_api: 21
com.example.myapp.MainActivity -> com.example.myapp.MainActivity:
    40:48:void onCreate(android.os.Bundle) -> onCreate
    50:55:void onResume() -> onResume
com.example.myapp.network.ApiClient -> com.example.myapp.a.a:
    com.example.myapp.network.model.User user -> a
    10:11:void <init>() -> <init>
    12:15:void fetchUserData(java.lang.String) -> b
    16:20:void parseResponse(java.lang.String):25:29 -> c
com.example.myapp.utils.Logger -> com.example.myapp.b.b:
    void logError(java.lang.String,java.lang.Throwable) -> a
    10:14:void logInfo(java.lang.String):34:38 -> b
`;

    // 2. Mock Obfuscated stacktrace
    const DEMO_STACKTRACE = `Exception in thread "main" java.lang.NullPointerException: Attempt to invoke virtual method 'void com.example.myapp.network.model.User.setName(java.lang.String)' on a null object reference
    at com.example.myapp.a.a.c(SourceFile:18)
    at com.example.myapp.a.a.b(SourceFile:13)
    at com.example.myapp.MainActivity.onCreate(SourceFile:45)
    at android.app.ActivityThread.performLaunchActivity(ActivityThread.java:3449)
    at android.app.ActivityThread.handleLaunchActivity(ActivityThread.java:3601)
`;

    // Load Mapping
    parser.parse(DEMO_MAPPING);
    
    mappingDropTitle.textContent = "Demo Mapping Loaded";
    mappingDropDesc.textContent = "demo_mapping.txt (Built-in)";
    mappingDropzone.classList.add('success-active');

    // Load Stack Trace
    stacktraceInput.value = DEMO_STACKTRACE;
    logDropTitle.textContent = "Demo Stacktrace Loaded";
    logDropDesc.textContent = "demo_log.txt (Built-in)";
    logDropzone.classList.add('success-active');

    // Updates
    updateStats();
    renderMappingBrowser();
    triggerRetrace();
    
    // Auto switch to de-obfuscated view on mobile
    if (window.innerWidth <= 768) {
      setActiveTab('tab-output-active', tabOutputBtn);
    }
  });

  // Clear everything
  clearBtn.addEventListener('click', () => {
    parser.clear();
    
    // Reset inputs & outputs
    stacktraceInput.value = '';
    retraceOutput.innerHTML = '';
    outputEmptyState.style.display = 'flex';
    outputContent.style.display = 'none';
    outputContent.innerHTML = '';

    // Reset mapping view
    browserSearchInput.value = '';
    treeContainer.innerHTML = '';
    treeContent.innerHTML = '';
    browserEmptyState.style.display = 'flex';
    treeContent.style.display = 'none';

    // Reset upload zones
    mappingFileInput.value = '';
    mappingDropzone.classList.remove('success-active', 'drag-active');
    mappingDropTitle.textContent = "Load Mapping File";
    mappingDropDesc.textContent = "Drag mapping.txt here or click to select";

    logFileInput.value = '';
    logDropzone.classList.remove('success-active', 'drag-active');
    logDropTitle.textContent = "Load Stacktrace / Log File";
    logDropDesc.textContent = "Drag crash log or stacktrace here or click to select";

    // Reset stats
    updateStats();

    // Go back to input tab on mobile
    if (window.innerWidth <= 768) {
      setActiveTab('tab-input-active', tabInputBtn);
    }
  });

  // Helper: extract raw unformatted text from line definitions
  function getRawOutputText() {
    const text = stacktraceInput.value.trim();
    if (!text) return '';
    
    const lines = parser.retraceStackTrace(text);
    return lines.map(l => l.retracedLine).join('\n');
  }

  // Helper: Format file byte sizes
  function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }
});
