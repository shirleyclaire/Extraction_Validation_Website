// Main Application Controller
(function () {

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

  // Debounce and abort timers/controllers for AI validation
  let aiValidationTimeout = null;
  let aiValidationAbortController = null;
  let lsSizeTimer = null;

  // Helper to dynamically get domain metadata key (handles domain_metadata and Domain_metadata)
  function getDomainMetadataKey(doc) {
    if (!doc) return "domain_metadata";
    if (doc.Domain_metadata !== undefined) return "Domain_metadata";
    if (doc.domain_metadata !== undefined) return "domain_metadata";
    const foundKey = Object.keys(doc).find(k => k.toLowerCase() === 'domain_metadata');
    return foundKey || "domain_metadata";
  }

  // Case-insensitive key lookup helper
  function getCaseInsensitiveKey(obj, key) {
    if (!obj || typeof obj !== 'object') return undefined;
    return Object.keys(obj).find(k => k.toLowerCase() === key.toLowerCase());
  }

  // HTML escape helper to mitigate XSS
  function escapeHtml(str) {
    if (str === null || str === undefined) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

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
      elements.settingsOpenaiKey.value = sessionStorage.getItem("rtd_validator_openai_key") || localStorage.getItem("rtd_validator_openai_key") || "";
      elements.settingsGeminiKey.value = sessionStorage.getItem("rtd_validator_gemini_key") || localStorage.getItem("rtd_validator_gemini_key") || "";
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
      sessionStorage.setItem("rtd_validator_openai_key", elements.settingsOpenaiKey.value.trim());
      sessionStorage.setItem("rtd_validator_gemini_key", elements.settingsGeminiKey.value.trim());
      // Clean up localStorage to prevent lingering keys
      localStorage.removeItem("rtd_validator_openai_key");
      localStorage.removeItem("rtd_validator_gemini_key");
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
          updateStorageDisplay(true);
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
    state.schemaArrayTypes = {};
    state.schemaTemplates = {};

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
    reader.onload = function (event) {
      const content = event.target.result.trim();
      const parsedDocs = [];

      try {
        if (file.name.endsWith(".jsonl") || content.includes("\n")) {
          // Process JSONL line by line
          const lines = content.split("\n");
          lines.forEach((line, idx) => {
            const trimmed = line.trim();
            if (trimmed !== "") {
              parsedDocs.push(JSON.parse(trimmed));
            }
          });
        } else {
          // Process JSON
          const data = JSON.parse(content);
          if (Array.isArray(data)) {
            parsedDocs.push(...data);
          } else {
            parsedDocs.push(data);
          }
        }

        if (parsedDocs.length === 0) {
          throw new Error("No valid JSON records found in the uploaded file");
        }

        setDataset(file.name, parsedDocs);
        updateStorageDisplay(true);
      } catch (err) {
        console.error("File parsing error:", err);
        showToast("Error parsing file: " + err.message, "flagged");
      }
    };
    reader.readAsText(file);
  }

  // Navigation and Updates
  function selectDocument(index) {
    state.currentIndex = index;
    localStorage.setItem(`rtd_validator_index_${state.fileName}`, index);

    // Reset scroll positions of panels to top when switching documents
    const panels = document.querySelectorAll(".panel-body");
    panels.forEach(p => p.scrollTop = 0);

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

    // Call throttled storage footprint updates
    updateStorageDisplay(false);
  }

  // Throttle local storage calculation to improve performance
  function updateStorageDisplay(immediate = false) {
    if (immediate) {
      calculateStorage();
      return;
    }
    if (lsSizeTimer) return;
    lsSizeTimer = setTimeout(() => {
      lsSizeTimer = null;
      calculateStorage();
    }, 2000);
  }

  function calculateStorage() {
    let totalBytes = 0;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('rtd_validator_')) {
          totalBytes += (localStorage.getItem(key) || '').length * 2;
        }
      }
    } catch (e) {
      console.warn("Could not calculate localStorage usage:", e);
    }
    const statusStorage = document.getElementById("status-storage");
    if (statusStorage) {
      statusStorage.textContent = `${Math.round(totalBytes / 1024)} KB`;
    }
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

  function safeRenderForm(doc, original) {
    try {
      window.FormBuilder.render(doc, elements.editorForm, (updatedDoc) => {
        state.docs[state.currentIndex] = updatedDoc;
        saveToLocalStorage();
        updateProgressTracker();
      }, state.schemaArrayTypes, state.schemaTemplates, original);
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

    // Reset AI insights card state immediately when rendering a new document to prevent leftover display
    if (elements.aiToggle && elements.aiToggle.checked) {
      elements.aiInsightsCard.style.display = "block";
      elements.aiInsightsCard.classList.remove("loading", "expanded");
      elements.aiInsightsBadge.className = "ai-insights-badge";
      elements.aiInsightsBadge.textContent = "🤖 AI Insights";
      elements.aiInsightsSummary.textContent = "AI is reviewing the domain metadata...";
      elements.aiInsightCorrections.innerHTML = "";
      elements.aiInsightQuotes.innerHTML = "";
    } else if (elements.aiInsightsCard) {
      elements.aiInsightsCard.style.display = "none";
    }

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
    safeRenderForm(doc, original);

    // Lazily trigger AI validation
    triggerAiValidation();
  }

  // AI Validation Trigger
  async function triggerAiValidation() {
    if (state.docs.length === 0) return;

    // Clear pending debounce timers
    if (aiValidationTimeout) {
      clearTimeout(aiValidationTimeout);
      aiValidationTimeout = null;
    }

    // Abort in-flight requests
    if (aiValidationAbortController) {
      aiValidationAbortController.abort();
      aiValidationAbortController = null;
    }

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

    // Clear previous results/quotes to avoid showing leftover data
    elements.aiInsightCorrections.innerHTML = "";
    elements.aiInsightQuotes.innerHTML = "";

    const metaKey = getDomainMetadataKey(doc);
    console.log("[AI Validation] Resolved metadata key:", metaKey);
    console.log("[AI Validation] doc[metaKey] defined:", doc[metaKey] !== undefined);
    console.log("[AI Validation] doc.text defined:", doc.text !== undefined);

    // Check if document has domain_metadata and text
    if (doc[metaKey] === undefined || doc.text === undefined) {
      console.warn("[AI Validation] Current document schema does not support AI validation (missing " + metaKey + " or text).");
      elements.aiInsightsCard.style.display = "block";
      elements.aiInsightsCard.classList.remove("loading", "expanded");
      elements.aiInsightsBadge.className = "ai-insights-badge";
      elements.aiInsightsBadge.textContent = "🤖 AI Insights";
      elements.aiInsightsSummary.textContent = "AI validation is only supported for schemas with 'text' and '" + metaKey + "'.";
      return;
    }

    elements.aiInsightsCard.style.display = "block";

    // Check if already validated and cached
    if (doc._validation && doc._validation.ai_insights) {
      const insights = doc._validation.ai_insights;
      // Force re-validation if it's in the old format (e.g. has chain_of_thought or lacks evidence_summary or modelUsed)
      const isOldFormat = !insights || insights.chain_of_thought !== undefined || insights.evidence_summary === undefined || !insights.modelUsed;
      if (!isOldFormat) {
        console.log("[AI Validation] Found cached AI insights. Rendering card directly.");
        try {
          displayAiInsights(insights);
          return;
        } catch (err) {
          console.warn("[AI Validation] Failed rendering cached insights. Re-validating...", err);
        }
      } else {
        console.log("[AI Validation] Cached insights are in the old format or lack model information. Re-validating document...");
      }
    }

    // Retrieve keys
    const openaiKey = sessionStorage.getItem("rtd_validator_openai_key") || localStorage.getItem("rtd_validator_openai_key") || "";
    const geminiKey = sessionStorage.getItem("rtd_validator_gemini_key") || localStorage.getItem("rtd_validator_gemini_key") || "";

    if (!openaiKey && !geminiKey) {
      console.warn("[AI Validation] No API Keys configured.");
      elements.aiInsightsCard.classList.remove("loading", "expanded");
      elements.aiInsightsBadge.className = "ai-insights-badge";
      elements.aiInsightsBadge.textContent = "🤖 AI Warning";
      elements.aiInsightsSummary.textContent = "API Keys missing. Click 'API Keys' in the sidebar to configure.";
      return;
    }

    // Set loading state immediately for user feedback
    elements.aiInsightsCard.classList.add("loading");
    elements.aiInsightsBadge.className = "ai-insights-badge loading";
    elements.aiInsightsBadge.textContent = "⚡ Validating...";
    elements.aiInsightsSummary.textContent = "AI is reviewing the domain metadata against the source text...";

    // Debounce the validation trigger by 300ms
    aiValidationTimeout = setTimeout(async () => {
      aiValidationTimeout = null;

      aiValidationAbortController = new AbortController();
      const signal = aiValidationAbortController.signal;

      try {
        // Call validator with only the text field and domain_metadata from the original document
        const originalDoc = state.originals[state.currentIndex];
        const origMetaKey = getDomainMetadataKey(originalDoc);
        const result = await window.AiValidator.validateMetadata(
          originalDoc.text || "",
          originalDoc[origMetaKey] || {},
          openaiKey,
          geminiKey,
          signal
        );

        if (signal.aborted) {
          console.log("[AI Validation] Request aborted. Suppressing merge.");
          return;
        }

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
          const currentMeta = doc[metaKey] ? JSON.parse(JSON.stringify(doc[metaKey])) : {};
          Object.keys(corrected).forEach(k => {
            // Case-insensitive key lookup in original and current metadata
            const origKey = getCaseInsensitiveKey(originalDoc[origMetaKey], k);
            const currentKey = getCaseInsensitiveKey(doc[metaKey], k);

            const originalVal = origKey !== undefined ? JSON.stringify(originalDoc[origMetaKey][origKey]) : undefined;
            const currentVal = currentKey !== undefined ? JSON.stringify(doc[metaKey][currentKey]) : undefined;
            const userEdited = originalVal !== currentVal;

            if (!userEdited) {
              const targetKey = currentKey || origKey || k;
              // Clean up other casings of the same key in currentMeta to avoid duplicate key properties
              Object.keys(currentMeta).forEach(existingKey => {
                if (existingKey.toLowerCase() === targetKey.toLowerCase() && existingKey !== targetKey) {
                  delete currentMeta[existingKey];
                }
              });
              currentMeta[targetKey] = corrected[k];
            } else {
              console.log(`[AI Validation] Skipping merge for field '${k}' because it was user-edited.`);
            }
          });

          doc[metaKey] = currentMeta;
          console.log("[AI Validation] Defensive merge completed. Updated domain_metadata:", doc[metaKey]);
        } else {
          console.warn("[AI Validation] Could not extract corrected metadata object from API response.");
        }

        if (!doc._validation) {
          doc._validation = { status: "pending", flagged_fields: [] };
        }
        doc._validation.ai_insights = {
          modelUsed: result.modelUsed,
          corrections_description: result.corrections_description || [],
          evidence_summary: result.evidence_summary || []
        };

        saveToLocalStorage();
        updateProgressTracker();

        if (state.currentIndex === activeIndexAtStart && currentDocAfterCall === doc) {
          // Refresh form to show the corrected values first
          safeRenderForm(doc, state.originals[state.currentIndex]);

          displayAiInsights(doc._validation.ai_insights);

          showToast(`AI Validation completed using ${result.modelUsed}!`, "success");
        } else {
          console.log("[AI Validation] API returned, but active document changed. Saved state, skipped rendering.");
        }
      } catch (err) {
        if (err.name === 'AbortError' || signal.aborted) {
          console.log("[AI Validation] Validation call aborted.");
          return;
        }
        console.error("[AI Validation] Validation execution error:", err);
        const currentDocAfterCall = state.docs[state.currentIndex];
        if (state.currentIndex === activeIndexAtStart && currentDocAfterCall === doc) {
          elements.aiInsightsCard.classList.remove("loading");
          elements.aiInsightsBadge.className = "ai-insights-badge fallback";
          elements.aiInsightsBadge.textContent = "❌ AI Error";
          elements.aiInsightsSummary.textContent = err.message;
        }
      }
    }, 300);
  }

  function displayAiInsights(insights) {
    console.log("[AI Validation] Rendering AI insights card display values.");
    elements.aiInsightsCard.style.display = "block"; // Explicitly ensure visibility
    elements.aiInsightsCard.classList.remove("loading");

    // Scroll the panel back to top so the card is visible
    elements.aiInsightsCard.scrollIntoView({ behavior: "smooth", block: "nearest" });

    if (!insights) {
      elements.aiInsightsBadge.className = "ai-insights-badge fallback";
      elements.aiInsightsBadge.textContent = "🤖 AI Warning";
      elements.aiInsightsSummary.textContent = "No insights found.";
      elements.aiInsightsCard.classList.remove("expanded");
      return;
    }

    const originalDoc = state.originals[state.currentIndex];
    const doc = state.docs[state.currentIndex];
    const origMetaKey = getDomainMetadataKey(originalDoc);
    const metaKey = getDomainMetadataKey(doc);

    // Recursive diff helper to find actual modifications
    function getDiffs(orig, current, path = "") {
      const diffs = [];
      const isEmpty = (v) => v === undefined || v === null || v === '' ||
        (Array.isArray(v) && v.length === 0) ||
        (typeof v === 'object' && v !== null && Object.keys(v).length === 0);

      if (isEmpty(orig) && isEmpty(current)) {
        return diffs;
      }
      if (orig === undefined || orig === null || current === undefined || current === null) {
        if (orig !== current) {
          diffs.push({ field: path, oldVal: orig, newVal: current });
        }
        return diffs;
      }
      if (typeof orig !== typeof current) {
        diffs.push({ field: path, oldVal: orig, newVal: current });
        return diffs;
      }

      if (Array.isArray(orig) && Array.isArray(current)) {
        if (JSON.stringify(orig) !== JSON.stringify(current)) {
          diffs.push({ field: path, oldVal: orig, newVal: current });
        }
      } else if (typeof orig === 'object' && typeof current === 'object') {
        // Collect union of keys case-insensitively
        const keysMap = new Map();
        Object.keys(orig).forEach(k => {
          if (k.startsWith('_')) return;
          keysMap.set(k.toLowerCase(), { origKey: k });
        });
        Object.keys(current).forEach(k => {
          if (k.startsWith('_')) return;
          const lower = k.toLowerCase();
          if (keysMap.has(lower)) {
            keysMap.get(lower).currentKey = k;
          } else {
            keysMap.set(lower, { currentKey: k });
          }
        });

        keysMap.forEach((keysInfo, lowerKey) => {
          const origKey = keysInfo.origKey || keysInfo.currentKey;
          const currentKey = keysInfo.currentKey || keysInfo.origKey;
          const childPath = path ? `${path}.${origKey}` : origKey;
          diffs.push(...getDiffs(orig[origKey], current[currentKey], childPath));
        });
      } else {
        if (orig !== current) {
          diffs.push({ field: path, oldVal: orig, newVal: current });
        }
      }
      return diffs;
    }

    const actualDiffs = getDiffs(originalDoc[origMetaKey], doc[metaKey]);

    // Normalize path for matching (converts casing and strips domain_metadata prefix)
    function normalizePath(p) {
      if (!p) return "";
      return String(p).toLowerCase()
        .replace(/^(domain_metadata|domainmetadata)\./, "")
        .trim();
    }

    const corrections = [];
    const llmCorrections = insights.corrections_description || [];

    actualDiffs.forEach(diff => {
      const normalizedDiffField = normalizePath(diff.field);
      const match = Array.isArray(llmCorrections) ? llmCorrections.find(c => normalizePath(c.field) === normalizedDiffField) : null;

      if (match) {
        corrections.push({
          field: diff.field,
          issue: match.issue,
          correction: match.correction || (typeof diff.newVal === 'object' ? JSON.stringify(diff.newVal) : String(diff.newVal))
        });
      } else {
        // Fallback explanation if LLM didn't return it in corrections_description
        const isEmptyVal = (v) => v === undefined || v === null || v === '' ||
          (Array.isArray(v) && v.length === 0) ||
          (typeof v === 'object' && v !== null && Object.keys(v).length === 0);
        let issue = "";
        if (isEmptyVal(diff.oldVal)) {
          issue = "Original value was empty; AI extracted new value from text.";
        } else if (isEmptyVal(diff.newVal)) {
          issue = "AI removed unsupported value.";
        } else {
          issue = `AI updated value from "${diff.oldVal}" to "${diff.newVal}".`;
        }

        let corrStr = "";
        if (diff.newVal === null || diff.newVal === undefined) {
          corrStr = "null";
        } else if (typeof diff.newVal === 'object') {
          corrStr = JSON.stringify(diff.newVal);
        } else {
          corrStr = String(diff.newVal);
        }

        corrections.push({
          field: diff.field,
          issue: issue,
          correction: corrStr
        });
      }
    });

    const modelUsed = insights.modelUsed || "AI Assistant";
    elements.aiInsightsBadge.className = "ai-insights-badge";
    if (modelUsed.includes("Fallback") || modelUsed === "Gemini") {
      elements.aiInsightsBadge.classList.add("fallback");
    }
    elements.aiInsightsBadge.textContent = `🤖 ${modelUsed}`;

    // Summarize corrections count
    let summaryText = "";
    if (corrections.length > 0) {
      summaryText = `AI suggested ${corrections.length} correction${corrections.length > 1 ? 's' : ''}. Review below. (Click to expand)`;
    } else {
      summaryText = "Metadata is verified! No corrections needed. (Click to view details)";
    }
    elements.aiInsightsSummary.textContent = summaryText;

    // Auto-expand card if corrections actually exist
    if (corrections.length > 0) {
      console.log("[AI Validation] Auto-expanding accordion card since corrections were detected.");
      elements.aiInsightsCard.classList.add("expanded");
    } else {
      elements.aiInsightsCard.classList.remove("expanded");
    }

    // Render corrections table
    const corrContainer = elements.aiInsightCorrections;
    corrContainer.innerHTML = "";

    if (corrections.length > 0) {
      const table = document.createElement("table");
      table.className = "ai-insights-table";
      table.innerHTML = `
        <thead>
          <tr>
            <th style="width: 35%;">Field Path</th>
            <th style="width: 35%;">Issue Found</th>
            <th style="width: 30%;">Correction Applied</th>
          </tr>
        </thead>
        <tbody>
          ${corrections.map(c => `
            <tr>
              <td><strong>${escapeHtml(c.field)}</strong></td>
              <td>${escapeHtml(c.issue)}</td>
              <td><span class="ai-corr-text">${escapeHtml(c.correction)}</span></td>
            </tr>
          `).join("")}
        </tbody>
      `;
      corrContainer.appendChild(table);
    } else {
      corrContainer.innerHTML = '<span class="ai-no-changes">No incorrect extractions detected. Everything is correct!</span>';
    }

    // Render evidence table
    const quotesContainer = elements.aiInsightQuotes;
    quotesContainer.innerHTML = "";
    const evidence = insights.evidence_summary || [];

    if (Array.isArray(evidence) && evidence.length > 0) {
      const table = document.createElement("table");
      table.className = "ai-insights-table";
      table.innerHTML = `
        <thead>
          <tr>
            <th style="width: 35%;">Field Path</th>
            <th style="width: 65%;">Specific Quote</th>
          </tr>
        </thead>
        <tbody>
          ${evidence.map(e => `
            <tr>
              <td><strong>${escapeHtml(e.field)}</strong></td>
              <td style="font-style: italic; color: var(--text-muted); font-size: 0.8rem;">"${escapeHtml(e.supporting_text)}"</td>
            </tr>
          `).join("")}
        </tbody>
      `;
      quotesContainer.appendChild(table);
    } else if (typeof evidence === 'string' && evidence.trim() !== "") {
      quotesContainer.textContent = evidence;
    } else {
      quotesContainer.innerHTML = '<span class="ai-no-changes">No explicit supporting quotes returned.</span>';
    }
  }

  // Download / Export Functions
  function downloadData(format) {
    if (state.docs.length === 0) return;

    const validatedDocs = state.docs.filter(doc => doc._validation && doc._validation.status === "validated");
    if (validatedDocs.length === 0) {
      showToast("No documents have been validated yet! Mark at least one document as validated before exporting.", "flagged");
      return;
    }

    let content = "";
    let fileExtension = "";
    let mimeType = "";

    if (format === "jsonl") {
      // Export line-by-line JSON
      const lines = validatedDocs.map(doc => JSON.stringify(doc));
      content = lines.join("\n");
      fileExtension = ".jsonl";
      mimeType = "application/x-jsonlines";
    } else {
      // Export pretty-printed JSON list
      content = JSON.stringify(validatedDocs, null, 2);
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

    showToast(`Downloaded ${validatedDocs.length} validated record(s) in ${format.toUpperCase()} format!`, "success");
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
