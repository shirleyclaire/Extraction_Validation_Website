// Interactive collapsible JSON tree viewer
window.JsonViewer = (function() {
  
  function escapeHtml(str) {
    if (typeof str !== 'string') return str;
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function createToggle() {
    const btn = document.createElement('button');
    btn.className = 'tree-fold-btn';
    btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>`;
    return btn;
  }

  function renderValue(val) {
    const span = document.createElement('span');
    if (typeof val === 'string') {
      span.className = 'json-string';
      span.textContent = `"${val}"`;
    } else if (typeof val === 'number') {
      span.className = 'json-number';
      span.textContent = val;
    } else if (typeof val === 'boolean') {
      span.className = 'json-boolean';
      span.textContent = val ? 'true' : 'false';
    } else if (val === null) {
      span.className = 'json-null';
      span.textContent = 'null';
    }
    return span;
  }

  function buildNode(val, key = null, isLast = true) {
    const row = document.createElement('div');
    row.style.position = 'relative';
    row.style.marginLeft = '1.25rem';
    
    // Check if object/array
    const isObject = typeof val === 'object' && val !== null;
    const isArray = Array.isArray(val);
    
    if (isObject) {
      const toggle = createToggle();
      row.appendChild(toggle);
      
      // Render Key
      if (key !== null) {
        const keySpan = document.createElement('span');
        keySpan.className = 'json-key';
        keySpan.textContent = `"${key}"`;
        row.appendChild(keySpan);
        row.appendChild(document.createTextNode(': '));
      }
      
      const openBrace = document.createTextNode(isArray ? '[' : '{');
      row.appendChild(openBrace);
      
      // Placeholder shown when collapsed
      const placeholder = document.createElement('span');
      placeholder.className = 'json-null';
      placeholder.style.display = 'none';
      placeholder.style.cursor = 'pointer';
      placeholder.textContent = isArray ? ' [...] ' : ' {...} ';
      row.appendChild(placeholder);
      
      // Children container
      const childrenContainer = document.createElement('div');
      childrenContainer.className = 'tree-node';
      row.appendChild(childrenContainer);
      
      const keys = Object.keys(val);
      keys.forEach((k, idx) => {
        const childIsLast = idx === keys.length - 1;
        const childNode = buildNode(val[k], k, childIsLast);
        childrenContainer.appendChild(childNode);
      });
      
      const closeBrace = document.createElement('span');
      closeBrace.textContent = (isArray ? ']' : '}') + (isLast ? '' : ',');
      row.appendChild(closeBrace);
      
      // Toggle logic
      const toggleAction = (e) => {
        e.stopPropagation();
        const collapsed = childrenContainer.style.display === 'none';
        if (collapsed) {
          childrenContainer.style.display = 'block';
          placeholder.style.display = 'none';
          toggle.classList.remove('collapsed');
        } else {
          childrenContainer.style.display = 'none';
          placeholder.style.display = 'inline';
          toggle.classList.add('collapsed');
        }
      };
      
      toggle.addEventListener('click', toggleAction);
      placeholder.addEventListener('click', toggleAction);
      
    } else {
      // Primitive
      row.style.paddingLeft = '12px'; // align with toggles
      if (key !== null) {
        const keySpan = document.createElement('span');
        keySpan.className = 'json-key';
        keySpan.textContent = `"${key}"`;
        row.appendChild(keySpan);
        row.appendChild(document.createTextNode(': '));
      }
      
      row.appendChild(renderValue(val));
      
      if (!isLast) {
        row.appendChild(document.createTextNode(','));
      }
    }
    
    return row;
  }

  function render(obj, container) {
    container.innerHTML = '';
    const root = document.createElement('div');
    root.className = 'json-viewer-container';
    
    // Add outer braces
    const isArray = Array.isArray(obj);
    const openBrace = document.createElement('div');
    openBrace.textContent = isArray ? '[' : '{';
    root.appendChild(openBrace);
    
    const body = document.createElement('div');
    body.className = 'tree-node';
    root.appendChild(body);
    
    const keys = Object.keys(obj);
    keys.forEach((key, idx) => {
      const isLast = idx === keys.length - 1;
      // Skip rendering validation metadata to make original cleaner, or keep it?
      // Let's keep it but render it slightly transparent
      const child = buildNode(obj[key], key, isLast);
      if (key.startsWith('_')) {
        child.style.opacity = '0.5';
      }
      body.appendChild(child);
    });
    
    const closeBrace = document.createElement('div');
    closeBrace.textContent = isArray ? ']' : '}';
    root.appendChild(closeBrace);
    
    container.appendChild(root);
  }

  return {
    render: render
  };
})();
