// Main Application Controller
(function() {
  
  // App State
  let state = {
    fileName: "",
    docs: [],          // Editable copies
    originals: [],     // Read-only original LLM outputs
    currentIndex: 0,
    searchQuery: "",
    statusFilter: "all", // "all", "pending", "validated", "flagged"
    schemaArrayTypes: {},
    schemaTemplates: {}
  };

  // DOM Elements
  let elements = {};

  // Initialize App
  document.addEventListener("DOMContentLoaded", () => {
    cacheElements();
    setupEventListeners();
    loadInitialState();
  });

  function cacheElements() {
    elements = {
      sidebar: document.getElementById("sidebar"),
      toggleSidebarBtn: document.getElementById("toggle-sidebar-btn"),
      uploadZone: document.getElementById("upload-zone"),
      fileInput: document.getElementById("file-input"),
      searchInput: document.getElementById("search-input"),
      filterAll: document.getElementById("filter-all"),
      filterPending: document.getElementById("filter-pending"),
      filterValidated: document.getElementById("filter-validated"),
      filterFlagged: document.getElementById("filter-flagged"),
      progressBarFill: document.getElementById("progress-bar-fill"),
      progressText: document.getElementById("progress-text"),
      documentList: document.getElementById("document-list"),
      
      headerDocTitle: document.getElementById("header-doc-title"),
      headerDocProgress: document.getElementById("header-doc-progress"),
      
      btnReset: document.getElementById("btn-reset"),
      btnFlagDoc: document.getElementById("btn-flag-doc"),
      btnSaveNext: document.getElementById("btn-save-next"),
      btnDownloadJson: document.getElementById("btn-download-json"),
      btnDownloadJsonl: document.getElementById("btn-download-jsonl"),
      
      originalViewer: document.getElementById("original-viewer"),
      originalEquationBox: document.getElementById("original-equation-box"),
      editorForm: document.getElementById("editor-form"),
      
      helpBtn: document.getElementById("help-btn"),
      helpModal: document.getElementById("help-modal"),
      modalCloseBtn: document.getElementById("modal-close-btn"),
      modalOkBtn: document.getElementById("modal-ok-btn"),
      
      toast: document.getElementById("toast"),
      toastMessage: document.getElementById("toast-message"),
      
      aiSettingsBtn: document.getElementById("ai-settings-btn"),
      aiSettingsModal: document.getElementById("ai-settings-modal"),
      settingsOpenaiKey: document.getElementById("settings-openai-key"),
      settingsGeminiKey: document.getElementById("settings-gemini-key"),
      settingsCancelBtn: document.getElementById("settings-cancel-btn"),
      settingsSaveBtn: document.getElementById("settings-save-btn"),
      aiSettingsCloseBtn: document.getElementById("ai-settings-close-btn"),
      aiToggle: document.getElementById("ai-toggle"),
      aiInsightsCard: document.getElementById("ai-insights-card"),
      aiInsightsHeader: document.getElementById("ai-insights-header"),
      aiInsightsBadge: document.getElementById("ai-insights-badge"),
      aiInsightsSummary: document.getElementById("ai-insights-summary"),
      aiInsightsToggleIcon: document.getElementById("ai-insights-toggle-icon"),
      aiInsightsContent: document.getElementById("ai-insights-content"),
      aiInsightCot: document.getElementById("ai-insight-cot"),
      aiInsightCorrections: document.getElementById("ai-insight-corrections"),
      aiInsightQuotes: document.getElementById("ai-insight-quotes")
    };
  }

  function setupEventListeners() {
    // Sidebar Toggle
    elements.toggleSidebarBtn.addEventListener("click", () => {
      elements.sidebar.classList.toggle("collapsed");
    });

    // File Upload Drag & Drop
    elements.uploadZone.addEventListener("click", () => elements.fileInput.click());
    elements.fileInput.addEventListener("change", handleFileSelect);
    
    elements.uploadZone.addEventListener("dragover", (e) => {
      e.preventDefault();
      elements.uploadZone.style.borderColor = "var(--primary-accent)";
      elements.uploadZone.style.backgroundColor = "rgba(255, 255, 255, 0.08)";
    });

    elements.uploadZone.addEventListener("dragleave", () => {
      elements.uploadZone.style.borderColor = "rgba(255, 255, 255, 0.2)";
      elements.uploadZone.style.backgroundColor = "rgba(255, 255, 255, 0.02)";
    });

    elements.uploadZone.addEventListener("drop", (e) => {
      e.preventDefault();
      elements.uploadZone.style.borderColor = "rgba(255, 255, 255, 0.2)";
      elements.uploadZone.style.backgroundColor = "rgba(255, 255, 255, 0.02)";
      if (e.dataTransfer.files.length > 0) {
        processUploadedFile(e.dataTransfer.files[0]);
      }
    });

    // Search & Filter
    elements.searchInput.addEventListener("input", (e) => {
      state.searchQuery = e.target.value.toLowerCase();
      renderDocumentList();
    });

    const filters = [
      { btn: elements.filterAll, val: "all" },
      { btn: elements.filterPending, val: "pending" },
      { btn: elements.filterValidated, val: "validated" },
      { btn: elements.filterFlagged, val: "flagged" }
    ];

    filters.forEach(f => {
      f.btn.addEventListener("click", () => {
        filters.forEach(item => item.btn.classList.remove("active"));
        f.btn.classList.add("active");
        state.statusFilter = f.val;
        renderDocumentList();
      });
    });

    // Header Controls
    elements.btnReset.addEventListener("click", resetCurrentDocument);
    elements.btnFlagDoc.addEventListener("click", flagCurrentDocumentAsWhole);
    elements.btnSaveNext.addEventListener("click", saveAndGoNext);
    
    // Exports
    elements.btnDownloadJson.addEventListener("click", () => downloadData("json"));
    elements.btnDownloadJsonl.addEventListener("click", () => downloadData("jsonl"));

    // Help Modal
    elements.helpBtn.addEventListener("click", () => elements.helpModal.classList.add("open"));
    elements.modalCloseBtn.addEventListener("click", () => elements.helpModal.classList.remove("open"));
    elements.modalOkBtn.addEventListener("click", () => elements.helpModal.classList.remove("open"));
    elements.helpModal.addEventListener("click", (e) => {
      if (e.target === elements.helpModal) {
        elements.helpModal.classList.remove("open");
      }
    });

    // AI Settings Modal
    elements.aiSettingsBtn.addEventListener("click", () => {
      elements.settingsOpenaiKey.value = localStorage.getItem("rtd_validator_openai_key") || "";
      elements.settingsGeminiKey.value = localStorage.getItem("rtd_validator_gemini_key") || "";
      elements.aiSettingsModal.classList.add("open");
    });
    elements.aiSettingsCloseBtn.addEventListener("click", () => elements.aiSettingsModal.classList.remove("open"));
    elements.settingsCancelBtn.addEventListener("click", () => elements.aiSettingsModal.classList.remove("open"));
    elements.aiSettingsModal.addEventListener("click", (e) => {
      if (e.target === elements.aiSettingsModal) {
        elements.aiSettingsModal.classList.remove("open");
      }
    });

    elements.settingsSaveBtn.addEventListener("click", () => {
      localStorage.setItem("rtd_validator_openai_key", elements.settingsOpenaiKey.value.trim());
      localStorage.setItem("rtd_validator_gemini_key", elements.settingsGeminiKey.value.trim());
      elements.aiSettingsModal.classList.remove("open");
      showToast("API keys saved successfully!", "success");
      if (elements.aiToggle.checked) {
        triggerAiValidation();
      }
    });

    // AI Toggle Switch
    elements.aiToggle.addEventListener("change", (e) => {
      localStorage.setItem("rtd_validator_ai_enabled", e.target.checked);
      if (e.target.checked) {
        triggerAiValidation();
      } else {
        elements.aiInsightsCard.style.display = "none";
      }
    });

    // AI Insights Accordion Click
    elements.aiInsightsHeader.addEventListener("click", () => {
      elements.aiInsightsCard.classList.toggle("expanded");
    });

    // Keyboard Shortcuts
    window.addEventListener("keydown", (e) => {
      // Check if user is typing in a text input/textarea (to prevent intercepting standard typing)
      const activeTag = document.activeElement.tagName;
      const isTyping = activeTag === "INPUT" || activeTag === "TEXTAREA";
      
      // Ctrl + S: Save & Next
      if (e.ctrlKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveAndGoNext();
      }
      
      // Ctrl + Right Arrow: Next Document
      if (e.ctrlKey && e.key === 'ArrowRight') {
        e.preventDefault();
        navigateDocument(1);
      }
      
      // Ctrl + Left Arrow: Previous Document
      if (e.ctrlKey && e.key === 'ArrowLeft') {
        e.preventDefault();
        navigateDocument(-1);
      }
      
      // Ctrl + F: Toggle Flag Document as whole (only if not typing in input)
      if (e.ctrlKey && e.key.toLowerCase() === 'f' && !isTyping) {
        e.preventDefault();
        flagCurrentDocumentAsWhole();
      }

      // Escape: Close modals
      if (e.key === 'Escape') {
        elements.helpModal.classList.remove("open");
        elements.aiSettingsModal.classList.remove("open");
      }
    });
  }

  // Load initial state or empty state
  function loadInitialState() {
    try {
      // Load toggle state from localStorage
      const aiEnabled = localStorage.getItem("rtd_validator_ai_enabled") === "true";
      elements.aiToggle.checked = aiEnabled;

      const activeFile = localStorage.getItem("rtd_validator_active_file");
      if (activeFile) {
        const savedDocs = localStorage.getItem(`rtd_validator_data_${activeFile}`);
        const savedOriginals = localStorage.getItem(`rtd_validator_original_${activeFile}`);
        if (savedDocs && savedOriginals) {
          state.fileName = activeFile;
          state.docs = JSON.parse(savedDocs);
          state.originals = JSON.parse(savedOriginals);
          
          if (!Array.isArray(state.docs) || !Array.isArray(state.originals)) {
            throw new Error("Saved documents state in localStorage is not a valid array");
          }
          
          // Analyze schema to dynamically identify empty arrays structure
          const schemaInfo = analyzeSchema(state.originals);
          state.schemaArrayTypes = schemaInfo.arrayTypes;
          state.schemaTemplates = schemaInfo.templates;
          
          const savedIndex = localStorage.getItem(`rtd_validator_index_${activeFile}`);
          let indexToLoad = savedIndex !== null ? parseInt(savedIndex, 10) : 0;
          if (isNaN(indexToLoad) || indexToLoad < 0 || indexToLoad >= state.docs.length) {
            indexToLoad = 0;
          }
          state.currentIndex = indexToLoad;
          
          // Re-enable elements
          elements.btnReset.disabled = false;
          elements.btnFlagDoc.disabled = false;
          elements.btnSaveNext.disabled = false;
          elements.btnDownloadJson.disabled = false;
          elements.btnDownloadJsonl.disabled = false;
          
          document.getElementById("status-filename").textContent = activeFile;
          renderAll();
          showToast("Restored progress for " + activeFile, "success");
          return;
        }
      }
    } catch (err) {
      console.error("Failed to load initial state from localStorage:", err);
      // Clean up potentially corrupt keys
      localStorage.removeItem("rtd_validator_active_file");
      showToast("Reset corrupt session state from local storage", "flagged");
    }
    renderEmptyState();
  }

  function renderEmptyState() {
    state.fileName = "";
    state.docs = [];
    state.originals = [];
    state.currentIndex = 0;
    
    document.getElementById("status-filename").textContent = "No file loaded";
    elements.headerDocTitle.textContent = "Select or upload a dataset";
    elements.headerDocProgress.textContent = "No active document";
    
    // Disable header buttons
    elements.btnReset.disabled = true;
    elements.btnFlagDoc.disabled = true;
    elements.btnSaveNext.disabled = true;
    
    // Disable sidebar actions
    elements.btnDownloadJson.disabled = true;
    elements.btnDownloadJsonl.disabled = true;
    
    // Render friendly empty state screens
    const emptyHtml = `
      <div class="empty-state-container">
        <div class="empty-state-icon">📥</div>
        <div class="empty-state-title">No Dataset Loaded</div>
        <div class="empty-state-desc">Drag & drop a JSON or JSONL file into the upload zone or click browse to start validating.</div>
      </div>
    `;
    
    elements.originalViewer.innerHTML = emptyHtml;
    elements.originalEquationBox.style.display = "none";
    elements.editorForm.innerHTML = emptyHtml;
    
    elements.documentList.innerHTML = `
      <div style="text-align: center; padding: 2rem; color: rgba(255, 255, 255, 0.4); font-size: 0.85rem;">
        Waiting for file upload...
      </div>
    `;
    
    elements.progressBarFill.style.width = "0%";
    elements.progressText.textContent = "0 / 0 validated (0%)";
    
    document.getElementById("status-total").textContent = "0";
    document.getElementById("status-validated").textContent = "0";
    document.getElementById("status-flagged").textContent = "0";
    document.getElementById("status-storage").textContent = "0 KB";
  }

  // Analyze schema across all documents to learn structures of arrays and object templates
  function analyzeSchema(docs) {
    const arrayTypes = {}; // normalizedPath -> 'object' | 'primitive'
    const templates = {};  // normalizedPath -> first non-null object template
    
    function traverse(val, path) {
      if (val === null || val === undefined) return;
      
      if (Array.isArray(val)) {
        const normPath = path;
        if (val.length > 0) {
          const first = val[0];
          const isObj = typeof first === 'object' && first !== null && !Array.isArray(first);
          arrayTypes[normPath] = isObj ? 'object' : 'primitive';
          
          if (isObj && !templates[normPath]) {
            templates[normPath] = JSON.parse(JSON.stringify(first));
          }
          
          val.forEach((item, idx) => {
            traverse(item, `${normPath}.*`);
          });
        }
      } else if (typeof val === 'object') {
        Object.keys(val).forEach(k => {
          traverse(val[k], path ? `${path}.${k}` : k);
        });
      }
    }
    
    docs.forEach(doc => {
      traverse(doc, "");
    });
    
    return { arrayTypes, templates };
  }

  // Set active dataset and initialize state
  function setDataset(fileName, documents) {
    state.fileName = fileName;
    localStorage.setItem("rtd_validator_active_file", fileName);
    document.getElementById("status-filename").textContent = fileName;
    
    // Analyze schema to dynamically identify empty arrays structure
    const schemaInfo = analyzeSchema(documents);
    state.schemaArrayTypes = schemaInfo.arrayTypes;
    state.schemaTemplates = schemaInfo.templates;
    
    // Enable buttons
    elements.btnReset.disabled = false;
    elements.btnFlagDoc.disabled = false;
    elements.btnSaveNext.disabled = false;
    elements.btnDownloadJson.disabled = false;
    elements.btnDownloadJsonl.disabled = false;
    
    // Check if progress already exists in local storage
    const storageKey = `rtd_validator_data_${fileName}`;
    const originalKey = `rtd_validator_original_${fileName}`;
    
    const savedDocs = localStorage.getItem(storageKey);
    const savedOriginals = localStorage.getItem(originalKey);
    
    if (savedDocs && savedOriginals) {
      state.docs = JSON.parse(savedDocs);
      state.originals = JSON.parse(savedOriginals);
      showToast("Restored validation progress from local storage!", "success");
      
      const savedIndex = localStorage.getItem(`rtd_validator_index_${fileName}`);
      let indexToLoad = savedIndex !== null ? parseInt(savedIndex, 10) : 0;
      if (isNaN(indexToLoad) || indexToLoad < 0 || indexToLoad >= state.docs.length) {
        indexToLoad = 0;
      }
      state.currentIndex = indexToLoad;
    } else {
      state.originals = JSON.parse(JSON.stringify(documents));
      state.docs = JSON.parse(JSON.stringify(documents));
      
      // Initialize validation structures if missing
      state.docs.forEach(doc => {
        if (!doc._validation) {
          doc._validation = {
            status: "pending", // "pending", "validated", "flagged"
            flagged_fields: []
          };
        }
      });
      
      saveToLocalStorage();
      state.currentIndex = 0;
    }
    
    renderAll();
  }

  function saveToLocalStorage() {
    localStorage.setItem(`rtd_validator_data_${state.fileName}`, JSON.stringify(state.docs));
    localStorage.setItem(`rtd_validator_original_${state.fileName}`, JSON.stringify(state.originals));
  }

  // File Upload Handlers
  function handleFileSelect(e) {
    if (e.target.files.length > 0) {
      processUploadedFile(e.target.files[0]);
    }
  }

  function processUploadedFile(file) {
    const reader = new FileReader();
    reader.onload = function(event) {
      const content = event.target.result.trim();
      const parsedDocs = [];
      
      try {
        if (file.name.endsWith(".jsonl") || content.includes("\n")) {
          // Process JSONL line by line
          const lines = content.split("\n");
          lines.forEach((line, idx) => {
            const trimmed = line.trim();
            if (trimmed) {
              try {
                parsedDocs.push(JSON.parse(trimmed));
              } catch (lineErr) {
                throw new Error(`JSON error on line ${idx + 1}: ${lineErr.message}`);
              }
            }
          });
        } else {
          // Process normal JSON
          const data = JSON.parse(content);
          if (Array.isArray(data)) {
            parsedDocs.push(...data);
          } else {
            parsedDocs.push(data);
          }
        }
        
        if (parsedDocs.length === 0) {
          throw new Error("No valid JSON records found in this file.");
        }
        
        setDataset(file.name, parsedDocs);
        showToast(`Successfully uploaded ${file.name} (${parsedDocs.length} items)`, "success");
        
      } catch (err) {
        alert(`Error parsing file: ${err.message}`);
      }
    };
    reader.readAsText(file);
  }

  // Navigation and Updates
  function selectDocument(index) {
    state.currentIndex = index;
    localStorage.setItem(`rtd_validator_index_${state.fileName}`, index);
    renderActiveDocument();
    
    // Highlight sidebar active item
    const items = elements.documentList.querySelectorAll(".doc-item");
    items.forEach((item, idx) => {
      if (idx === index) {
        item.classList.add("active");
        item.scrollIntoView({ block: "nearest", behavior: "smooth" });
      } else {
        item.classList.remove("active");
      }
    });
  }

  function navigateDocument(direction) {
    const visibleDocs = getFilteredDocuments();
    if (visibleDocs.length === 0) return;
    
    const currentDoc = state.docs[state.currentIndex];
    let visibleIndex = visibleDocs.findIndex(d => d.id === currentDoc.id);
    
    if (visibleIndex === -1) visibleIndex = 0;
    
    let nextVisibleIndex = visibleIndex + direction;
    if (nextVisibleIndex < 0) nextVisibleIndex = visibleDocs.length - 1;
    if (nextVisibleIndex >= visibleDocs.length) nextVisibleIndex = 0;
    
    const nextDoc = visibleDocs[nextVisibleIndex];
    const actualIndex = state.docs.findIndex(d => d.id === nextDoc.id);
    
    selectDocument(actualIndex);
  }

  // Save current changes and advance
  function saveAndGoNext() {
    if (state.docs.length === 0) return;
    
    const currentDoc = state.docs[state.currentIndex];
    
    // Mark as validated
    currentDoc._validation.status = "validated";
    saveToLocalStorage();
    
    showToast(`Saved and validated document #${state.currentIndex + 1}`, "success");
    
    // Update sidebar counts and list item
    updateProgressTracker();
    renderDocumentList();
    
    // Auto-advance
    if (state.currentIndex < state.docs.length - 1) {
      setTimeout(() => {
        selectDocument(state.currentIndex + 1);
      }, 200);
    } else {
      renderActiveDocument(); // update buttons
      showToast("Completed validation of all documents!", "success");
    }
  }

  // Toggle whole-doc flag
  function flagCurrentDocumentAsWhole() {
    if (state.docs.length === 0) return;
    
    const currentDoc = state.docs[state.currentIndex];
    const currentStatus = currentDoc._validation.status;
    
    if (currentStatus === "flagged") {
      currentDoc._validation.status = "pending";
      showToast("Document unflagged", "success");
    } else {
      currentDoc._validation.status = "flagged";
      showToast("Document marked as Flagged", "flagged");
    }
    
    saveToLocalStorage();
    updateProgressTracker();
    renderDocumentList();
    renderActiveDocument();
  }

  // Reset to original LLM values
  function resetCurrentDocument() {
    if (state.docs.length === 0) return;
    
    if (confirm("Are you sure you want to revert all changes for this document to the original LLM output?")) {
      const original = JSON.parse(JSON.stringify(state.originals[state.currentIndex]));
      state.docs[state.currentIndex] = original;
      
      // Keep structural metadata but reset status
      state.docs[state.currentIndex]._validation = {
        status: "pending",
        flagged_fields: []
      };
      
      saveToLocalStorage();
      updateProgressTracker();
      renderDocumentList();
      renderActiveDocument();
      showToast("Reverted changes to original extraction values", "success");
    }
  }

  // Filtering logic
  function getFilteredDocuments() {
    return state.docs.filter(doc => {
      // 1. Text Search Filter (match ID, title, caption, text)
      const idMatch = doc.id && doc.id.toLowerCase().includes(state.searchQuery);
      const textMatch = doc.text && doc.text.toLowerCase().includes(state.searchQuery);
      const titleMatch = doc.base_metadata && doc.base_metadata.document_title && doc.base_metadata.document_title.toLowerCase().includes(state.searchQuery);
      const captionMatch = doc.caption && doc.caption.toLowerCase().includes(state.searchQuery);
      const sourceMatch = doc._source_file && doc._source_file.toLowerCase().includes(state.searchQuery);
      
      const searchMatch = idMatch || textMatch || titleMatch || captionMatch || sourceMatch || !state.searchQuery;
      
      // 2. Status Filter Match
      const status = doc._validation ? doc._validation.status : "pending";
      const hasFlaggedFields = doc._validation && Array.isArray(doc._validation.flagged_fields) && doc._validation.flagged_fields.length > 0;
      
      let statusMatch = false;
      if (state.statusFilter === "all") {
        statusMatch = true;
      } else if (state.statusFilter === "flagged") {
        statusMatch = (status === "flagged" || hasFlaggedFields);
      } else {
        statusMatch = (status === state.statusFilter);
      }
      
      return searchMatch && statusMatch;
    });
  }

  // Render Functions
  function renderAll() {
    updateProgressTracker();
    renderDocumentList();
    renderActiveDocument();
  }

  function updateProgressTracker() {
    const total = state.docs.length;
    if (total === 0) return;
    
    const validatedCount = state.docs.filter(d => d._validation && d._validation.status === "validated").length;
    const flaggedCount = state.docs.filter(d => d._validation && d._validation.status === "flagged").length;
    
    const percent = Math.round((validatedCount / total) * 100);
    elements.progressBarFill.style.width = `${percent}%`;
    elements.progressText.textContent = `${validatedCount} / ${total} validated (${percent}%)`;
    
    // Update status footer details
    document.getElementById("status-total").textContent = total;
    document.getElementById("status-validated").textContent = validatedCount;
    document.getElementById("status-flagged").textContent = flaggedCount;
    
    // Approximate local storage footprint in KB
    const lsSize = Math.round(JSON.stringify(state.docs).length / 1024);
    document.getElementById("status-storage").textContent = `${lsSize} KB`;
  }

  function renderDocumentList() {
    elements.documentList.innerHTML = '';
    const filtered = getFilteredDocuments();
    
    if (filtered.length === 0) {
      const emptyDiv = document.createElement("div");
      emptyDiv.style.textAlign = "center";
      emptyDiv.style.padding = "2rem";
      emptyDiv.style.color = "rgba(255, 255, 255, 0.4)";
      emptyDiv.style.fontSize = "0.85rem";
      emptyDiv.textContent = "No documents match criteria";
      elements.documentList.appendChild(emptyDiv);
      return;
    }
    
    filtered.forEach(doc => {
      // Find actual index in global array
      const globalIdx = state.docs.findIndex(d => d.id === doc.id);
      
      const item = document.createElement("div");
      item.className = `doc-item ${globalIdx === state.currentIndex ? 'active' : ''}`;
      
      // Title logic
      let docTitle = `Doc #${globalIdx + 1}`;
      if (doc.base_metadata && doc.base_metadata.document_title) {
        docTitle = doc.base_metadata.document_title;
      } else if (doc.caption) {
        docTitle = doc.caption;
      }
      
      let docId = doc.id || "No ID";
      // Trim if ID is long
      if (docId.length > 30) {
        docId = docId.substring(0, 28) + "...";
      }
      
      const status = doc._validation ? doc._validation.status : "pending";
      
      item.innerHTML = `
        <div class="doc-item-header">
          <span class="doc-item-title" title="${docTitle}">${docTitle}</span>
          <span class="status-badge ${status}">${status}</span>
        </div>
        <div class="doc-item-subtitle" title="${doc.id}">${docId}</div>
      `;
      
      item.addEventListener("click", () => {
        selectDocument(globalIdx);
      });
      
      elements.documentList.appendChild(item);
    });

    // Scroll active item into view
    const activeItem = elements.documentList.querySelector(".doc-item.active");
    if (activeItem) {
      activeItem.scrollIntoView({ block: "nearest" });
    }
  }

  function safeRenderForm(doc) {
    try {
      window.FormBuilder.render(doc, elements.editorForm, (updatedDoc) => {
        state.docs[state.currentIndex] = updatedDoc;
        saveToLocalStorage();
        updateProgressTracker();
      }, state.schemaArrayTypes, state.schemaTemplates);
    } catch (renderErr) {
      console.error("FormBuilder render error:", renderErr);
      elements.editorForm.innerHTML = `
        <div class="render-error-container" style="padding: 1.5rem; background: rgba(239, 68, 68, 0.08); border: 1px dashed #ef4444; border-radius: 8px; color: #ef4444; margin-top: 1rem;">
          <h4 style="margin: 0 0 0.5rem 0; font-size: 1rem; font-weight: 600;">⚠️ Form Render Error</h4>
          <p style="margin: 0 0 1rem 0; font-size: 0.85rem; line-height: 1.4;">An exception occurred while building the validation form. This usually happens if the active document does not conform to the expected schema.</p>
          <pre style="margin: 0; padding: 0.75rem; background: rgba(0, 0, 0, 0.2); border-radius: 6px; font-family: monospace; font-size: 0.75rem; overflow-x: auto; white-space: pre-wrap; color: #fecaca;">${renderErr.message}\n\nStack:\n${renderErr.stack}</pre>
        </div>
      `;
    }
  }

  function renderActiveDocument() {
    if (state.docs.length === 0) return;
    
    const doc = state.docs[state.currentIndex];
    const original = state.originals[state.currentIndex];
    
    // Header Info
    let docTitle = `Doc #${state.currentIndex + 1}`;
    if (doc.base_metadata && doc.base_metadata.document_title) {
      docTitle = doc.base_metadata.document_title;
    } else if (doc.caption) {
      docTitle = doc.caption;
    }
    elements.headerDocTitle.textContent = docTitle;
    elements.headerDocTitle.title = docTitle;
    elements.headerDocProgress.textContent = `Document ${state.currentIndex + 1} of ${state.docs.length} (${doc.id || 'No ID'})`;
    
    // Flag Document button status
    const status = doc._validation ? doc._validation.status : "pending";
    if (status === "flagged") {
      elements.btnFlagDoc.classList.add("active");
      elements.btnFlagDoc.textContent = "🚩 Flagged Document";
    } else {
      elements.btnFlagDoc.classList.remove("active");
      elements.btnFlagDoc.textContent = "🏳️ Flag Document";
    }
    
    // Save button label
    if (state.currentIndex === state.docs.length - 1) {
      elements.btnSaveNext.textContent = "✔ Save & Complete";
    } else {
      elements.btnSaveNext.textContent = "✔ Save & Next";
    }
    
    // RENDER LEFT SIDE: Read-Only Original JSON Viewer
    window.JsonViewer.render(original, elements.originalViewer);
    
    // LaTeX Rendering on the left side (if equation file)
    const hasLatex = original.latex || original.text_form;
    if (hasLatex) {
      elements.originalEquationBox.style.display = "flex";
      const formula = original.latex || original.text_form;
      
      // Find math subcontainer
      let mathContainer = elements.originalEquationBox.querySelector(".math-render-sub");
      if (!mathContainer) {
        mathContainer = document.createElement("div");
        mathContainer.className = "math-render-sub";
        elements.originalEquationBox.appendChild(mathContainer);
      }
      
      if (window.katex) {
        window.katex.render(formula, mathContainer, { displayMode: true, throwOnError: false });
      } else {
        mathContainer.textContent = formula;
      }
    } else {
      elements.originalEquationBox.style.display = "none";
    }
    
    // RENDER RIGHT SIDE: Editable Dynamic Form Builder
    safeRenderForm(doc);

    // Lazily trigger AI validation
    triggerAiValidation();
  }

  // AI Validation Trigger
  async function triggerAiValidation() {
    if (state.docs.length === 0) return;
    
    const doc = state.docs[state.currentIndex];
    const activeIndexAtStart = state.currentIndex;
    
    console.log("[AI Validation] triggerAiValidation invoked. Index:", activeIndexAtStart);
    
    // Check if toggle is enabled
    const aiEnabled = elements.aiToggle.checked;
    if (!aiEnabled) {
      console.log("[AI Validation] Switch is OFF. Hiding insights card.");
      elements.aiInsightsCard.style.display = "none";
      return;
    }
    
    // Check if document has domain_metadata and text
    if (doc.domain_metadata === undefined || doc.text === undefined) {
      console.warn("[AI Validation] Current document schema does not support AI validation (missing domain_metadata or text).");
      elements.aiInsightsCard.style.display = "block";
      elements.aiInsightsCard.classList.remove("loading", "expanded");
      elements.aiInsightsBadge.className = "ai-insights-badge";
      elements.aiInsightsBadge.textContent = "🤖 AI Insights";
      elements.aiInsightsSummary.textContent = "AI validation is only supported for schemas with 'text' and 'domain_metadata'.";
      elements.aiInsightsContent.style.maxHeight = "0px";
      elements.aiInsightsContent.style.padding = "0 1rem";
      return;
    }
    
    elements.aiInsightsCard.style.display = "block";
    
    // Check if already validated and cached
    if (doc._validation && doc._validation.ai_insights) {
      console.log("[AI Validation] Found cached AI insights. Rendering card directly.");
      displayAiInsights(doc._validation.ai_insights);
      return;
    }
    
    // Retrieve keys
    const openaiKey = localStorage.getItem("rtd_validator_openai_key") || "";
    const geminiKey = localStorage.getItem("rtd_validator_gemini_key") || "";
    
    if (!openaiKey && !geminiKey) {
      console.warn("[AI Validation] No API Keys configured in localStorage.");
      elements.aiInsightsCard.classList.remove("loading", "expanded");
      elements.aiInsightsBadge.className = "ai-insights-badge";
      elements.aiInsightsBadge.textContent = "🤖 AI Warning";
      elements.aiInsightsSummary.textContent = "API Keys missing. Click 'API Keys' in the sidebar to configure.";
      elements.aiInsightsContent.style.maxHeight = "0px";
      elements.aiInsightsContent.style.padding = "0 1rem";
      return;
    }
    
    // Set loading state
    console.log("[AI Validation] Initiating API call...");
    elements.aiInsightsCard.classList.add("loading");
    elements.aiInsightsBadge.className = "ai-insights-badge loading";
    elements.aiInsightsBadge.textContent = "⚡ Validating...";
    elements.aiInsightsSummary.textContent = "AI is reviewing the domain metadata against the source text...";
    elements.aiInsightsContent.style.maxHeight = "0px";
    elements.aiInsightsContent.style.padding = "0 1rem";
    
    try {
      // Call validator
      const result = await window.AiValidator.validateMetadata(
        doc.text,
        doc.domain_metadata,
        openaiKey,
        geminiKey
      );
      
      console.log("[AI Validation] API response received:", result);
      
      const currentDocAfterCall = state.docs[state.currentIndex];
      
      // Extract corrected metadata robustly. LLM might put keys at root or nested under corrected_metadata
      let corrected = result.corrected_metadata || result.correctedMetadata || result.rawResponse;
      if (!corrected) {
        corrected = result;
      }
      
      // If it is a string representation, parse it
      if (typeof corrected === 'string') {
        try {
          corrected = JSON.parse(corrected);
        } catch (e) {
          console.warn("[AI Validation] Failed parsing corrected metadata string:", e);
        }
      }
      
      if (corrected && typeof corrected === 'object') {
        corrected = JSON.parse(JSON.stringify(corrected));
        // Remove meta-parameters if LLM placed them at the root
        const metaKeys = [
          'corrected_metadata', 'correctedMetadata',
          'corrections_description', 'correctionsDescription',
          'chain_of_thought', 'chainOfThought',
          'source_quotes', 'sourceQuotes',
          'modelUsed', 'rawResponse'
        ];
        metaKeys.forEach(k => delete corrected[k]);
        
        // Deep clone current metadata and merge the corrected keys defensively
        const currentMeta = doc.domain_metadata ? JSON.parse(JSON.stringify(doc.domain_metadata)) : {};
        Object.keys(corrected).forEach(k => {
          currentMeta[k] = corrected[k];
        });
        
        doc.domain_metadata = currentMeta;
        console.log("[AI Validation] Defensive merge completed. Updated domain_metadata:", doc.domain_metadata);
      } else {
        console.warn("[AI Validation] Could not extract corrected metadata object from API response.");
      }
      
      if (!doc._validation) {
        doc._validation = { status: "pending", flagged_fields: [] };
      }
      doc._validation.ai_insights = {
        modelUsed: result.modelUsed,
        corrections_description: result.corrections_description || "No corrections description returned.",
        chain_of_thought: result.chain_of_thought || "No reasoning returned.",
        source_quotes: result.source_quotes || "No source references returned."
      };
      
      saveToLocalStorage();
      updateProgressTracker();
      
      if (state.currentIndex === activeIndexAtStart && currentDocAfterCall === doc) {
        displayAiInsights(doc._validation.ai_insights);
        
        // Auto-expand card if there are corrections suggested
        const desc = (result.corrections_description || "").toLowerCase();
        const hasCorrections = desc !== "" && !desc.includes("everything is correct") && !desc.includes("everything is right");
        if (hasCorrections) {
          console.log("[AI Validation] Auto-expanding accordion card since corrections were detected.");
          elements.aiInsightsCard.classList.add("expanded");
        } else {
          elements.aiInsightsCard.classList.remove("expanded");
        }
        
        // Refresh form to show the corrected values
        safeRenderForm(doc);
        
        showToast(`AI Validation completed using ${result.modelUsed}!`, "success");
      } else {
        console.log("[AI Validation] API returned, but active document changed. Saved state, skipped rendering.");
      }
    } catch (err) {
      console.error("[AI Validation] Validation execution error:", err);
      const currentDocAfterCall = state.docs[state.currentIndex];
      if (state.currentIndex === activeIndexAtStart && currentDocAfterCall === doc) {
        elements.aiInsightsCard.classList.remove("loading");
        elements.aiInsightsBadge.className = "ai-insights-badge fallback";
        elements.aiInsightsBadge.textContent = "❌ AI Error";
        elements.aiInsightsSummary.textContent = err.message;
      }
    }
  }

  function displayAiInsights(insights) {
    console.log("[AI Validation] Rendering AI insights card display values.");
    elements.aiInsightsCard.style.display = "block"; // Explicitly ensure visibility
    elements.aiInsightsCard.classList.remove("loading");
    elements.aiInsightsBadge.className = "ai-insights-badge";
    if (insights.modelUsed.includes("Fallback") || insights.modelUsed === "Gemini") {
      elements.aiInsightsBadge.classList.add("fallback");
    }
    elements.aiInsightsBadge.textContent = `🤖 ${insights.modelUsed}`;
    
    // Summarize corrections count
    let summaryText = "";
    const desc = (insights.corrections_description || "").toLowerCase();
    if (desc !== "" && (desc.includes("everything is correct") || desc.includes("everything is right") || desc.includes("all correct"))) {
      summaryText = "Metadata is verified! No corrections needed. (Click to view details)";
    } else {
      summaryText = "AI suggested corrections. Review them below. (Click to expand)";
    }
    elements.aiInsightsSummary.textContent = summaryText;
    
    elements.aiInsightCot.textContent = insights.chain_of_thought || "No reasoning provided.";
    elements.aiInsightCorrections.textContent = insights.corrections_description || "None.";
    elements.aiInsightQuotes.textContent = insights.source_quotes || "No source quotes provided.";
  }

  // Download / Export Functions
  function downloadData(format) {
    if (state.docs.length === 0) return;
    
    let content = "";
    let fileExtension = "";
    let mimeType = "";
    
    if (format === "jsonl") {
      // Export line-by-line JSON
      const lines = state.docs.map(doc => JSON.stringify(doc));
      content = lines.join("\n");
      fileExtension = ".jsonl";
      mimeType = "application/x-jsonlines";
    } else {
      // Export pretty-printed JSON list
      content = JSON.stringify(state.docs, null, 2);
      fileExtension = ".json";
      mimeType = "application/json";
    }
    
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement("a");
    a.href = url;
    // Strip original extension if exists
    const baseName = state.fileName.replace(/\.[^/.]+$/, "");
    a.download = `${baseName}_ground_truth${fileExtension}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showToast(`Downloaded verified dataset in ${format.toUpperCase()} format!`, "success");
  }

  // Toast notifications
  let toastTimer = null;
  function showToast(message, type = "success") {
    clearTimeout(toastTimer);
    
    elements.toastMessage.textContent = message;
    elements.toast.className = "toast show";
    
    if (type === "success") {
      elements.toast.classList.add("success");
    } else if (type === "flagged") {
      elements.toast.classList.add("flagged");
    }
    
    toastTimer = setTimeout(() => {
      elements.toast.classList.remove("show");
    }, 3000);
  }

})();
