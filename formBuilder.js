// Dynamic form builder for validation editing
window.FormBuilder = (function() {

  // Path helpers
  function getValueByPath(obj, path) {
    if (!path) return obj;
    const parts = path.split('.');
    let current = obj;
    for (let part of parts) {
      if (current === null || current === undefined) return undefined;
      // Case-insensitive key lookup to prevent casing mismatch issues
      const foundKey = Object.keys(current).find(k => k.toLowerCase() === part.toLowerCase());
      if (foundKey === undefined) return undefined;
      current = current[foundKey];
    }
    return current;
  }

  function setValueByPath(obj, path, value) {
    const parts = path.split('.');
    let current = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      let foundKey = Object.keys(current).find(k => k.toLowerCase() === part.toLowerCase());
      if (foundKey === undefined) {
        const nextPartIsIndex = !isNaN(parts[i+1]);
        current[part] = nextPartIsIndex ? [] : {};
        foundKey = part;
      }
      current = current[foundKey];
    }
    const lastPart = parts[parts.length - 1];
    let lastKey = Object.keys(current).find(k => k.toLowerCase() === lastPart.toLowerCase());
    if (lastKey === undefined) {
      lastKey = lastPart;
    }
    current[lastKey] = value;
  }

  function deleteValueByPath(obj, path) {
    const parts = path.split('.');
    let current = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      const foundKey = Object.keys(current).find(k => k.toLowerCase() === part.toLowerCase());
      if (foundKey === undefined) return;
      current = current[foundKey];
    }
    const lastPart = parts[parts.length - 1];
    const lastKey = Object.keys(current).find(k => k.toLowerCase() === lastPart.toLowerCase());
    if (lastKey === undefined) return;
    if (Array.isArray(current)) {
      current.splice(Number(lastKey), 1);
    } else {
      delete current[lastKey];
    }
  }

  function formatLabel(key) {
    if (!key) return "";
    return key
      .replace(/_/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .trim()
      .replace(/^\w/, (c) => c.toUpperCase());
  }

  // Check if a path is flagged in the document
  function isFieldFlagged(doc, path) {
    if (!doc._validation || !Array.isArray(doc._validation.flagged_fields)) {
      return false;
    }
    return doc._validation.flagged_fields.includes(path);
  }

  // Check if a field path should be locked/immutable
  function isImmutableField(path) {
    if (!path) return false;
    const lowerPath = path.toLowerCase();
    const immutablePaths = [
      'id',
      'document_id',
      'base_metadata.document_title',
      'base_metadata.section_index',
      'base_metadata.source_path',
      'image_path'
    ];
    return immutablePaths.some(p => lowerPath === p.toLowerCase());
  }

  // Compare values at a path between originalDoc and current copy to see if modified
  function isFieldModified(originalDoc, path, currentVal) {
    if (!originalDoc) return false;
    
    // Ignore comparison for _validation metadata or internal keys
    if (path.includes('_validation') || path.startsWith('_')) return false;

    const origVal = getValueByPath(originalDoc, path);
    
    // Treat null, undefined, empty string, empty array, and empty object as equivalent empty values
    const isEmpty = (v) => v === undefined || v === null || v === '' || 
                           (Array.isArray(v) && v.length === 0) ||
                           (typeof v === 'object' && v !== null && Object.keys(v).length === 0);
    
    if (isEmpty(origVal) && isEmpty(currentVal)) return false;

    if (origVal === undefined) return true;

    // Compare origVal and currentVal
    if (typeof origVal !== typeof currentVal) return true;
    
    if (typeof origVal === 'object' && origVal !== null && currentVal !== null) {
      return JSON.stringify(origVal) !== JSON.stringify(currentVal);
    }
    
    return origVal !== currentVal;
  }

  // Toggle field flag
  function toggleFieldFlag(doc, path) {
    if (!doc._validation) {
      doc._validation = { flagged_fields: [] };
    }
    if (!Array.isArray(doc._validation.flagged_fields)) {
      doc._validation.flagged_fields = [];
    }
    
    const idx = doc._validation.flagged_fields.indexOf(path);
    if (idx > -1) {
      doc._validation.flagged_fields.splice(idx, 1);
      return false;
    } else {
      doc._validation.flagged_fields.push(path);
      return true;
    }
  }

  // Deeply clear all properties of a template object (setting primitives to null, arrays to [])
  function clearValues(o) {
    if (typeof o !== 'object' || o === null) return;
    Object.keys(o).forEach(k => {
      if (Array.isArray(o[k])) {
        o[k] = [];
      } else if (typeof o[k] === 'object' && o[k] !== null) {
        clearValues(o[k]);
      } else if (typeof o[k] === 'number') {
        o[k] = null; // Set to null so empty number parameters are not pre-initialized to 0
      } else if (typeof o[k] === 'boolean') {
        o[k] = false;
      } else {
        o[k] = null;
      }
    });
  }

  // Render a live LaTeX preview
  function renderLatexPreview(latexStr, previewDiv) {
    if (!previewDiv) return;
    if (!latexStr || latexStr.trim() === "") {
      previewDiv.innerHTML = '<span style="color:#94a3b8; font-style:italic;">No equation entered</span>';
      return;
    }
    
    if (window.katex) {
      try {
        window.katex.render(latexStr, previewDiv, {
          throwOnError: false,
          displayMode: true
        });
      } catch (err) {
        previewDiv.innerHTML = `<span style="color:#ef4444;">LaTeX Error: ${err.message}</span>`;
      }
    } else {
      previewDiv.textContent = latexStr;
    }
  }

  function render(doc, container, onChange, arrayTypes, arrayTemplates, originalDoc) {
    const panelBody = (container && typeof container.closest === 'function') ? container.closest('.panel-body') : null;
    const scrollTop = panelBody ? panelBody.scrollTop : 0;

    container.innerHTML = '';
    
    // Create local clone of data to work with
    const docCopy = JSON.parse(JSON.stringify(doc));
    
    // We'll build form nodes recursively
    const formRoot = document.createElement('div');
    formRoot.className = 'form-root-container';
    
    const keys = Object.keys(docCopy);
    keys.forEach(key => {
      // Skip internal keys starting with underscores, EXCEPT when we render or save
      if (key.startsWith('_') && key !== '_flagged_notes') return;
      
      const fieldNode = buildFormNode(docCopy[key], key, key, docCopy, onChange, container, arrayTypes, arrayTemplates, originalDoc);
      formRoot.appendChild(fieldNode);
    });
    
    container.appendChild(formRoot);

    if (panelBody) {
      panelBody.scrollTop = scrollTop;
    }
  }

  function buildFormNode(val, path, labelName, docCopy, onChange, container, arrayTypes, arrayTemplates, originalDoc) {
    const group = document.createElement('div');
    group.className = 'form-group';
    
    // Set flagged status class initially
    const flagged = isFieldFlagged(docCopy, path);
    if (flagged) {
      group.classList.add('flagged');
    }

    // Set modified status class if it differs from the original
    const modified = isFieldModified(originalDoc, path, val);
    if (modified) {
      group.classList.add('modified');
    }
    
    // Label Row
    const labelRow = document.createElement('div');
    labelRow.className = 'form-label-row';
    
    const label = document.createElement('label');
    label.className = 'form-label';
    label.innerHTML = `${formatLabel(labelName)} <span class="form-field-path">${path}</span>`;
    labelRow.appendChild(label);
    
    // Flag Button
    const flagBtn = document.createElement('button');
    flagBtn.className = 'field-flag-toggle';
    if (flagged) flagBtn.classList.add('active');
    flagBtn.title = "Flag this field for review";
    flagBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path><line x1="4" y1="22" x2="4" y2="15"></line></svg>`;
    
    flagBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const nowFlagged = toggleFieldFlag(docCopy, path);
      if (nowFlagged) {
        group.classList.add('flagged');
        flagBtn.classList.add('active');
      } else {
        group.classList.remove('flagged');
        flagBtn.classList.remove('active');
      }
      onChange(docCopy);
    });
    
    if (!isImmutableField(path)) {
      labelRow.appendChild(flagBtn);
    }
    group.appendChild(labelRow);
    
    // Value Editor container
    const controlWrapper = document.createElement('div');
    controlWrapper.className = 'form-control-wrapper';
    
    const isArray = Array.isArray(val);
    const isObject = typeof val === 'object' && val !== null;
    
    if (isArray) {
      // 1. Is it a spreadsheet table? (2D Array with sibling headers)
      const is2DArray = val.length > 0 && Array.isArray(val[0]);
      const hasHeadersSibling = docCopy.headers !== undefined;
      
      if (is2DArray && labelName === 'rows' && hasHeadersSibling) {
        // Render Spreadsheet grid
        const tableCard = document.createElement('div');
        tableCard.className = 'spreadsheet-container';
        
        const table = document.createElement('table');
        table.className = 'spreadsheet-table';
        
        const headers = docCopy.headers || [];
        
        // Thead
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        headers.forEach(h => {
          const th = document.createElement('th');
          th.textContent = h;
          headerRow.appendChild(th);
        });
        // Extra column for row delete
        const thActions = document.createElement('th');
        thActions.style.width = '50px';
        thActions.textContent = '';
        headerRow.appendChild(thActions);
        
        thead.appendChild(headerRow);
        table.appendChild(thead);
        
        // Tbody
        const tbody = document.createElement('tbody');
        val.forEach((rowArr, rowIndex) => {
          if (!rowArr || !Array.isArray(rowArr)) return;
          const tr = document.createElement('tr');
          headers.forEach((h, colIndex) => {
            const td = document.createElement('td');
            const cellVal = rowArr[colIndex] !== undefined ? rowArr[colIndex] : '';
            
            const cellInput = document.createElement('input');
            cellInput.type = 'text';
            cellInput.className = 'spreadsheet-input';
            cellInput.value = cellVal;
            
            cellInput.addEventListener('input', (e) => {
              const cellPath = `${path}.${rowIndex}.${colIndex}`;
              setValueByPath(docCopy, cellPath, e.target.value);
              onChange(docCopy);
              
              const currentTableVal = getValueByPath(docCopy, path);
              const isMod = isFieldModified(originalDoc, path, currentTableVal);
              if (isMod) {
                group.classList.add('modified');
              } else {
                group.classList.remove('modified');
              }
            });
            
            td.appendChild(cellInput);
            tr.appendChild(td);
          });
          
          // Delete row cell
          const tdDelete = document.createElement('td');
          tdDelete.className = 'spreadsheet-row-actions';
          const innerDiv = document.createElement('div');
          innerDiv.className = 'spreadsheet-row-actions-inner';
          const delBtn = document.createElement('button');
          delBtn.className = 'spreadsheet-btn delete';
          delBtn.title = "Delete this table row";
          delBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>`;
          delBtn.addEventListener('click', (e) => {
            e.preventDefault();
            val.splice(rowIndex, 1);
            setValueByPath(docCopy, path, val);
            onChange(docCopy);
            // Re-render form
            render(docCopy, container, onChange, arrayTypes, arrayTemplates, originalDoc);
          });
          innerDiv.appendChild(delBtn);
          tdDelete.appendChild(innerDiv);
          tr.appendChild(tdDelete);
          tbody.appendChild(tr);
        });
        
        table.appendChild(tbody);
        tableCard.appendChild(table);
        
        // Add Row Button
        const addRowBtn = document.createElement('button');
        addRowBtn.className = 'spreadsheet-add-btn';
        addRowBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg> Add Row`;
        addRowBtn.addEventListener('click', (e) => {
          e.preventDefault();
          const emptyRow = new Array(headers.length).fill("");
          val.push(emptyRow);
          setValueByPath(docCopy, path, val);
          onChange(docCopy);
          render(docCopy, container, onChange, arrayTypes, arrayTemplates, originalDoc);
        });
        tableCard.appendChild(addRowBtn);
        
        controlWrapper.appendChild(tableCard);
        
      } else {
        // 2. Is it a list of objects?
        const normPath = path.replace(/\.\d+\./g, '.*.').replace(/\.\d+$/g, '.*');
        const isObjectList = (arrayTypes && arrayTypes[normPath] === 'object') ||
                             (val.length > 0 && typeof val[0] === 'object' && val[0] !== null && !Array.isArray(val[0]));
        
        if (isObjectList) {
          const listWrapper = document.createElement('div');
          listWrapper.className = 'array-objects-container';
          listWrapper.style.width = '100%';
          
          val.forEach((item, itemIdx) => {
            const itemCard = document.createElement('div');
            itemCard.className = 'array-object-item';
            
            // Item Header with index and delete
            const itemHeader = document.createElement('div');
            itemHeader.className = 'array-object-header';
            
            const indexLabel = document.createElement('span');
            indexLabel.className = 'array-object-index';
            indexLabel.textContent = `Item #${itemIdx + 1}`;
            itemHeader.appendChild(indexLabel);
            
            const delItemBtn = document.createElement('button');
            delItemBtn.className = 'delete-array-item-btn';
            delItemBtn.title = "Delete this list item";
            delItemBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
            delItemBtn.addEventListener('click', (e) => {
              e.preventDefault();
              val.splice(itemIdx, 1);
              setValueByPath(docCopy, path, val);
              onChange(docCopy);
              render(docCopy, container, onChange, arrayTypes, arrayTemplates, originalDoc);
            });
            itemHeader.appendChild(delItemBtn);
            itemCard.appendChild(itemHeader);
            
            // Item body (nested object fields)
            const itemBody = document.createElement('div');
            itemBody.className = 'array-object-body';
            
            if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
              Object.keys(item).forEach(childKey => {
                if (childKey.startsWith('_')) return;
                const childNode = buildFormNode(item[childKey], `${path}.${itemIdx}.${childKey}`, childKey, docCopy, onChange, container, arrayTypes, arrayTemplates, originalDoc);
                itemBody.appendChild(childNode);
              });
            } else {
              // It's a primitive (string, number, null, boolean) inside the card list!
              const inputWrapper = document.createElement('div');
              inputWrapper.className = 'form-control-wrapper';
              
              const input = document.createElement('input');
              input.type = 'text';
              input.className = 'form-control';
              input.value = item === null ? "" : String(item);
              input.placeholder = item === null ? "null (empty)" : "";
              
              input.addEventListener('input', (e) => {
                const v = e.target.value === '' ? null : e.target.value;
                val[itemIdx] = v;
                setValueByPath(docCopy, path, val);
                onChange(docCopy);
                
                const isMod = isFieldModified(originalDoc, path, val);
                if (isMod) {
                  group.classList.add('modified');
                } else {
                  group.classList.remove('modified');
                }
              });
              
              inputWrapper.appendChild(input);
              itemBody.appendChild(inputWrapper);
            }
            
            itemCard.appendChild(itemBody);
            listWrapper.appendChild(itemCard);
          });
          
          // Add Item Button
          const addItemBtn = document.createElement('button');
          addItemBtn.className = 'add-array-item-btn';
          addItemBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg> Add list item`;
          addItemBtn.addEventListener('click', (e) => {
            e.preventDefault();
            
            const normPath = path.replace(/\.\d+\./g, '.*.').replace(/\.\d+$/g, '.*');
            let defaultItem = "";
            if (arrayTemplates && arrayTemplates[normPath]) {
              defaultItem = JSON.parse(JSON.stringify(arrayTemplates[normPath]));
              if (typeof defaultItem === 'object' && defaultItem !== null) {
                clearValues(defaultItem);
              } else {
                defaultItem = "";
              }
            } else if (val.length > 0) {
              const first = val[0];
              if (typeof first === 'object' && first !== null && !Array.isArray(first)) {
                defaultItem = JSON.parse(JSON.stringify(first));
                clearValues(defaultItem);
              } else {
                defaultItem = "";
              }
            } else {
              defaultItem = "";
            }
            
            val.push(defaultItem);
            setValueByPath(docCopy, path, val);
            onChange(docCopy);
            render(docCopy, container, onChange, arrayTypes, arrayTemplates, originalDoc);
          });
          
          listWrapper.appendChild(addItemBtn);
          controlWrapper.appendChild(listWrapper);
        } else {
          // 3. Simple list of primitives (render tags)
          const tagContainer = document.createElement('div');
          tagContainer.className = 'tag-container';
          tagContainer.style.width = '100%';
          
          const tagsListSpan = document.createElement('span');
          tagsListSpan.style.display = 'flex';
          tagsListSpan.style.flexWrap = 'wrap';
          tagsListSpan.style.gap = '0.35rem';
          tagContainer.appendChild(tagsListSpan);
          
          const renderTags = () => {
            tagsListSpan.innerHTML = '';
            val.forEach((tagVal, tagIdx) => {
              const tag = document.createElement('span');
              tag.className = 'tag-badge';
              tag.textContent = tagVal;
              
              const tagDel = document.createElement('button');
              tagDel.className = 'tag-close';
              tagDel.textContent = '×';
              tagDel.addEventListener('click', (e) => {
                e.preventDefault();
                val.splice(tagIdx, 1);
                setValueByPath(docCopy, path, val);
                onChange(docCopy);
                renderTags();
                
                const isMod = isFieldModified(originalDoc, path, val);
                if (isMod) {
                  group.classList.add('modified');
                } else {
                  group.classList.remove('modified');
                }
              });
              tag.appendChild(tagDel);
              tagsListSpan.appendChild(tag);
            });
          };
          
          renderTags();
          
          const tagInput = document.createElement('input');
          tagInput.type = 'text';
          tagInput.className = 'tag-input';
          tagInput.placeholder = 'Type and press Enter...';
          
          tagInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              const newTag = e.target.value.trim();
              if (newTag) {
                // If it is numeric, try parsing
                const numVal = Number(newTag);
                const isNum = !isNaN(numVal) && newTag !== '';
                val.push(isNum ? numVal : newTag);
                setValueByPath(docCopy, path, val);
                onChange(docCopy);
                e.target.value = '';
                renderTags();
                
                const isMod = isFieldModified(originalDoc, path, val);
                if (isMod) {
                  group.classList.add('modified');
                } else {
                  group.classList.remove('modified');
                }
              }
            }
          });
          
          tagContainer.appendChild(tagInput);
          controlWrapper.appendChild(tagContainer);
        }
      }
    } else if (isObject) {
      // Nested Object Fields
      const card = document.createElement('div');
      card.className = 'nested-object-card';
      card.style.width = '100%';
      
      const cardTitle = document.createElement('div');
      cardTitle.className = 'nested-object-title';
      cardTitle.textContent = formatLabel(labelName);
      card.appendChild(cardTitle);
      
      Object.keys(val).forEach(childKey => {
        if (childKey.startsWith('_')) return;
        const childNode = buildFormNode(val[childKey], `${path}.${childKey}`, childKey, docCopy, onChange, container, arrayTypes, arrayTemplates, originalDoc);
        card.appendChild(childNode);
      });
      
      controlWrapper.appendChild(card);
      
    } else {
      // Primitive Fields (String, Number, Boolean, Null)
      if (typeof val === 'boolean') {
        const toggleLabel = document.createElement('label');
        toggleLabel.className = 'toggle-switch';
        
        const toggleInput = document.createElement('input');
        toggleInput.type = 'checkbox';
        toggleInput.checked = val;
        const slider = document.createElement('span');
        slider.className = 'toggle-slider';
        
        toggleLabel.appendChild(toggleInput);
        toggleLabel.appendChild(slider);
        
        const stateText = document.createElement('span');
        stateText.style.fontSize = '0.875rem';
        stateText.style.marginLeft = '0.5rem';
        stateText.style.fontWeight = '500';
        stateText.textContent = val ? 'Yes' : 'No';
        
        toggleInput.addEventListener('change', (e) => {
          const checked = e.target.checked;
          setValueByPath(docCopy, path, checked);
          stateText.textContent = checked ? 'Yes' : 'No';
          onChange(docCopy);
          
          const isMod = isFieldModified(originalDoc, path, checked);
          if (isMod) {
            group.classList.add('modified');
          } else {
            group.classList.remove('modified');
          }
        });
        
        controlWrapper.appendChild(toggleLabel);
        controlWrapper.appendChild(stateText);
        
      } else if (typeof val === 'number') {
        const input = document.createElement('input');
        input.type = 'number';
        input.step = 'any';
        input.className = 'form-control';
        input.value = val;
        
        if (isImmutableField(path)) {
          input.readOnly = true;
        } else {
          input.addEventListener('input', (e) => {
            const numVal = e.target.value === '' ? null : Number(e.target.value);
            setValueByPath(docCopy, path, numVal);
            onChange(docCopy);
            
            const isMod = isFieldModified(originalDoc, path, numVal);
            if (isMod) {
              group.classList.add('modified');
            } else {
              group.classList.remove('modified');
            }
          });
        }
        
        controlWrapper.appendChild(input);
        
      } else {
        // String or Null
        const strVal = val === null ? "" : String(val);
        const isLong = strVal.length > 80 || strVal.includes('\n') || 
                       labelName.toLowerCase().includes('text') || 
                       labelName.toLowerCase().includes('description') || 
                       labelName.toLowerCase().includes('caption') ||
                       labelName.toLowerCase().includes('latex') ||
                       labelName.toLowerCase().includes('finding');
                       
        if (isLong) {
          const textarea = document.createElement('textarea');
          textarea.className = 'form-control';
          textarea.value = strVal;
          textarea.placeholder = val === null ? "null (empty)" : "";
          
          if (isImmutableField(path)) {
            textarea.readOnly = true;
          } else {
            textarea.addEventListener('input', (e) => {
              const v = e.target.value === '' ? null : e.target.value;
              setValueByPath(docCopy, path, v);
              onChange(docCopy);
              
              const isMod = isFieldModified(originalDoc, path, v);
              if (isMod) {
                group.classList.add('modified');
              } else {
                group.classList.remove('modified');
              }
              
              // Trigger LaTeX preview if this is an equation field
              if (labelName === 'latex' || labelName === 'text_form') {
                renderLatexPreview(e.target.value, previewContainer);
              }
            });
          }
          
          controlWrapper.appendChild(textarea);
          
          // Add LaTeX live preview box right under LaTeX input box
          let previewContainer;
          if (labelName === 'latex' || labelName === 'text_form') {
            controlWrapper.style.flexDirection = 'column';
            controlWrapper.style.alignItems = 'stretch';
            
            previewContainer = document.createElement('div');
            previewContainer.className = 'equation-display-card';
            previewContainer.style.marginTop = '0.5rem';
            
            const cardLabel = document.createElement('span');
            cardLabel.className = 'equation-card-label';
            cardLabel.textContent = `Live Equation Preview (${labelName})`;
            previewContainer.appendChild(cardLabel);
            
            const mathSpan = document.createElement('div');
            mathSpan.style.width = '100%';
            previewContainer.appendChild(mathSpan);
            
            controlWrapper.appendChild(previewContainer);
            
            // Run initial preview render
            setTimeout(() => {
              renderLatexPreview(strVal, mathSpan);
            }, 0);
          }
          
        } else {
          const input = document.createElement('input');
          input.type = 'text';
          input.className = 'form-control';
          input.value = strVal;
          input.placeholder = val === null ? "null (empty)" : "";
          
          if (isImmutableField(path)) {
            input.readOnly = true;
          } else {
            input.addEventListener('input', (e) => {
              const v = e.target.value === '' ? null : e.target.value;
              setValueByPath(docCopy, path, v);
              onChange(docCopy);
              
              const isMod = isFieldModified(originalDoc, path, v);
              if (isMod) {
                group.classList.add('modified');
              } else {
                group.classList.remove('modified');
              }
              
              // Trigger LaTeX preview if this is an equation field
              if (labelName === 'latex' || labelName === 'text_form') {
                renderLatexPreview(e.target.value, previewContainer);
              }
            });
          }
          
          controlWrapper.appendChild(input);
          
          // Add LaTeX live preview box right under LaTeX input box
          let previewContainer;
          if (labelName === 'latex' || labelName === 'text_form') {
            controlWrapper.style.flexDirection = 'column';
            controlWrapper.style.alignItems = 'stretch';
            
            previewContainer = document.createElement('div');
            previewContainer.className = 'equation-display-card';
            previewContainer.style.marginTop = '0.5rem';
            
            const cardLabel = document.createElement('span');
            cardLabel.className = 'equation-card-label';
            cardLabel.textContent = `Live Equation Preview (${labelName})`;
            previewContainer.appendChild(cardLabel);
            
            const mathSpan = document.createElement('div');
            mathSpan.style.width = '100%';
            previewContainer.appendChild(mathSpan);
            
            controlWrapper.appendChild(previewContainer);
            
            // Run initial preview render
            setTimeout(() => {
              renderLatexPreview(strVal, mathSpan);
            }, 0);
          }
        }
      }
    }
    
    group.appendChild(controlWrapper);
    return group;
  }

  return {
    render: render
  };
})();
