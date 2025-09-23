// --- START: generic flattener for any collection/mode tree ---
function transformToStyleDictionary(tokens) {
  // tokens: { "<Collection>/<Mode>": { nested paths -> { $value, $type, $description? } } }

  const out = {};

  const toKebab = (s) =>
    s
      .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
      .replace(/[\s_./]+/g, '-')
      .replace(/-+/g, '-')
      .toLowerCase();

  function walk(node, pathArr, bucketKey) {
    if (!node || typeof node !== 'object') return;

    // leaf token?
    if (Object.prototype.hasOwnProperty.call(node, '$value') &&
        Object.prototype.hasOwnProperty.call(node, '$type')) {
      const tokenName = toKebab(pathArr.join('-'));
      if (!out[bucketKey]) out[bucketKey] = {};
      out[bucketKey][tokenName] = {
        value: node.$value,
        // SD prefers "dimension" for numeric tokens
        type: node.$type === 'number' ? 'dimension' : node.$type,
        ...(node.$description ? { description: node.$description } : {})
      };
      return;
    }

    // recurse
    for (const [k, v] of Object.entries(node)) {
      walk(v, [...pathArr, k], bucketKey);
    }
  }

  for (const [collectionModeKey, tree] of Object.entries(tokens)) {
    // "Semantic Colors/Light" -> "semantic-colors-light"
    const category = toKebab(collectionModeKey);
    walk(tree, [], category);
  }

  return out;
}
// --- END: generic flattener ---

// Helper function to parse color values
function parseColor(colorValue) {
  try {
    // Handle hex colors
    if (colorValue.startsWith('#')) {
      let hex = colorValue.replace('#', '');
      
      // Handle 3-digit hex (e.g., #FFF)
      if (hex.length === 3) {
        hex = hex.split('').map(char => char + char).join('');
      }
      
      // Handle 6-digit hex (no alpha) or 8-digit hex (with alpha)
      let r, g, b, a;
      if (hex.length === 6) {
        // 6-digit hex: #RRGGBB
        r = parseInt(hex.substr(0, 2), 16) / 255;
        g = parseInt(hex.substr(2, 2), 16) / 255;
        b = parseInt(hex.substr(4, 2), 16) / 255;
        a = 1; // Fully opaque
      } else if (hex.length === 8) {
        // 8-digit hex: #RRGGBBAA (our exporter format)
        r = parseInt(hex.substr(0, 2), 16) / 255;
        g = parseInt(hex.substr(2, 2), 16) / 255;
        b = parseInt(hex.substr(4, 2), 16) / 255;
        a = parseInt(hex.substr(6, 2), 16) / 255;
      } else {
        // Fallback
        r = g = b = 0;
        a = 1;
      }
      
      return { r, g, b, a, hex: hex.toUpperCase() };
    }
    
    // Handle rgb/rgba colors
    if (colorValue.startsWith('rgb')) {
      const values = colorValue.match(/\d+(?:\.\d+)?/g);
      if (values && values.length >= 3) {
        const r = parseInt(values[0]) / 255;
        const g = parseInt(values[1]) / 255;
        const b = parseInt(values[2]) / 255;
        const a = values[3] ? parseFloat(values[3]) : 1;
        
        const r255 = Math.round(r * 255);
        const g255 = Math.round(g * 255);
        const b255 = Math.round(b * 255);
        const a255 = Math.round(a * 255);
        
        const hex = ((a255 << 24) | (r255 << 16) | (g255 << 8) | b255).toString(16).toUpperCase().padStart(8, '0');
        return { r, g, b, a, hex };
      }
    }
    
    // Handle rgba with decimal values
    if (colorValue.includes('rgba')) {
      const values = colorValue.match(/\d+(?:\.\d+)?/g);
      if (values && values.length >= 4) {
        const r = parseInt(values[0]) / 255;
        const g = parseInt(values[1]) / 255;
        const b = parseInt(values[2]) / 255;
        const a = parseFloat(values[3]);
        
        const r255 = Math.round(r * 255);
        const g255 = Math.round(g * 255);
        const b255 = Math.round(b * 255);
        const a255 = Math.round(a * 255);
        
        const hex = ((a255 << 24) | (r255 << 16) | (g255 << 8) | b255).toString(16).toUpperCase().padStart(8, '0');
        return { r, g, b, a, hex };
      }
    }
  } catch (error) {
    console.error('Error parsing color:', colorValue, error);
  }
  
  // Default fallback
  return { r: 0, g: 0, b: 0, a: 1, hex: 'FF000000' };
}

// Dynamic ordering function - sorts collections alphabetically
function orderTopLevel(obj) {
  const out = {};
  // Sort keys alphabetically for consistent ordering
  const sortedKeys = Object.keys(obj).sort();
  for (const k of sortedKeys) {
    out[k] = obj[k];
  }
  return out;
}

// Export functions
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    transformToStyleDictionary,
    parseColor,
    orderTopLevel
  };
}