// debug script
const isEmpty = (v) => v === undefined || v === null || v === '' || 
                       (Array.isArray(v) && v.length === 0) ||
                       (typeof v === 'object' && v !== null && Object.keys(v).length === 0);

function getCaseInsensitiveKey(obj, key) {
  if (!obj || typeof obj !== 'object') return undefined;
  const foundKey = Object.keys(obj).find(k => k.toLowerCase() === key.toLowerCase());
  return foundKey;
}

function getDiffs(orig, current, path = "") {
  const diffs = [];
  
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

// Case 1: originalDoc.domain_metadata (lowercase) vs doc.Domain_metadata (capitalized)
const orig1 = {
  domain_metadata: {
    key_findings: ""
  }
};
const doc1 = {
  Domain_metadata: {
    Key_findings: "Continuous manufacturing..."
  }
};

console.log("Case 1 (different metadata keys):");
console.log(getDiffs(orig1.domain_metadata, doc1.Domain_metadata));

// Case 2: originalDoc.domain_metadata vs doc.domain_metadata but keys inside are capitalized
const orig2 = {
  domain_metadata: {
    key_findings: ""
  }
};
const doc2 = {
  domain_metadata: {
    Key_findings: "Continuous manufacturing..."
  }
};
console.log("Case 2 (same metadata keys, different nested keys):");
console.log(getDiffs(orig2.domain_metadata, doc2.domain_metadata));

// Case 3: originalDoc.domain_metadata vs doc.domain_metadata with same casing
const orig3 = {
  domain_metadata: {
    key_findings: ""
  }
};
const doc3 = {
  domain_metadata: {
    key_findings: "Continuous manufacturing..."
  }
};
console.log("Case 3 (identical casing):");
console.log(getDiffs(orig3.domain_metadata, doc3.domain_metadata));

// Test defensive merge with case-insensitive mapping
function mergeDefensively(originalDoc, doc, origMetaKey, metaKey, corrected) {
  const currentMeta = doc[metaKey] ? JSON.parse(JSON.stringify(doc[metaKey])) : {};
  Object.keys(corrected).forEach(k => {
    const origKey = getCaseInsensitiveKey(originalDoc[origMetaKey], k);
    const docKey = getCaseInsensitiveKey(doc[metaKey], k);
    
    const originalVal = origKey !== undefined ? JSON.stringify(originalDoc[origMetaKey][origKey]) : undefined;
    const currentVal = docKey !== undefined ? JSON.stringify(doc[metaKey][docKey]) : undefined;
    const userEdited = originalVal !== currentVal;
    
    if (!userEdited) {
      const targetKey = docKey || origKey || k;
      currentMeta[targetKey] = corrected[k];
    } else {
      console.log(`Skipping merge for field '${k}' because it was user-edited.`);
    }
  });
  doc[metaKey] = currentMeta;
}

const originalDoc = {
  domain_metadata: {
    key_findings: ""
  }
};
const doc = {
  domain_metadata: {
    key_findings: ""
  }
};
const corrected = {
  Key_findings: "Continuous manufacturing..."
};

console.log("Before merge:", JSON.stringify(doc));
mergeDefensively(originalDoc, doc, "domain_metadata", "domain_metadata", corrected);
console.log("After merge:", JSON.stringify(doc));
