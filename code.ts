// This file holds the main code for the plugin. It has access to the Figma API.

// Show the plugin UI with larger size
figma.showUI(__html__, { width: 1000, height: 600 });

// Store previous variable state for change detection
let previousVariableState = new Map();
let isListeningForChanges = false;

// Base64 encoding function
function base64Encode(str: string): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  let i = 0;
  
  while (i < str.length) {
    const a = str.charCodeAt(i++);
    const b = i < str.length ? str.charCodeAt(i++) : 0;
    const c = i < str.length ? str.charCodeAt(i++) : 0;
    
    const bitmap = (a << 16) | (b << 8) | c;
    
    result += chars.charAt((bitmap >> 18) & 63);
    result += chars.charAt((bitmap >> 12) & 63);
    result += i - 2 < str.length ? chars.charAt((bitmap >> 6) & 63) : '=';
    result += i - 1 < str.length ? chars.charAt(bitmap & 63) : '=';
  }
  
  return result;
}

// --- UTILITY FUNCTIONS ---

// Helper to convert Figma's 0-1 RGBA values to a hex string (#RRGGBBAA)
function rgbaToHex(r: number, g: number, b: number, a: number): string {
  const toHex = (c: number) => ('0' + Math.round(c * 255).toString(16)).slice(-2);
  const alpha = a < 1 ? toHex(a) : '';
  return `#${toHex(r)}${toHex(g)}${toHex(b)}${alpha}`;
}

// Helper to set a value in a nested object based on a path array
function setNestedObjectValue(obj: any, path: string[], value: any): void {
  let current = obj;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    if (!current[key] || typeof current[key] !== 'object') {
      current[key] = {};
    }
    current = current[key];
  }
  current[path[path.length - 1]] = value;
}


// --- MAIN EXPORT LOGIC ---

async function exportTokens() {
  const allTokens = {};
  const variableMap = new Map();

  // 1. PROCESS FIGMA VARIABLES (Modern Method)
  const localVariables = await figma.variables.getLocalVariablesAsync();
  
  // First, map all variable IDs to their names for alias resolution
  localVariables.forEach(v => {
      // Figma variable names can have '/', which we'll use for nesting.
      // We replace it with '.' to create a dot-separated alias path.
      variableMap.set(v.id, v.name.replace(/\//g, '.'));
  });

  const collections = await figma.variables.getLocalVariableCollectionsAsync();

  for (const collection of collections) {
    const modeNames = collection.modes.map(mode => mode.name);
    
    for (const modeId of collection.modes.map(m => m.modeId)) {
      const mode = collection.modes.find(m => m.modeId === modeId);
      if (!mode) continue;
      const modeName = mode.name;
      const tokenSetName = `${collection.name}/${modeName}`;
      
      const variableIdsInCollection = collection.variableIds;

      for (const varId of variableIdsInCollection) {
        const v = await figma.variables.getVariableByIdAsync(varId);
        if (!v) continue;

        const value = v.valuesByMode[modeId];
        if (value === undefined) continue;
        
        const path = v.name.split('/');
        const token: any = { $type: '' };

        // Determine token type and value
        switch (v.resolvedType) {
          case 'COLOR':
            token.$type = 'color';
            if (typeof value === 'object' && 'type' in value && value.type === 'VARIABLE_ALIAS') {
              token.$value = `{${variableMap.get(value.id)}}`;
            } else {
              const { r, g, b, a } = value as RGBA;
              token.$value = rgbaToHex(r, g, b, a);
            }
            break;
            
          case 'FLOAT':
            token.$type = 'number';
             if (typeof value === 'object' && 'type' in value && value.type === 'VARIABLE_ALIAS') {
              token.$value = `{${variableMap.get(value.id)}}`;
            } else {
              token.$value = value;
            }
            break;

          case 'STRING':
            token.$type = 'text'; // Or just 'string'
            token.$value = value;
            break;
            
          // Booleans are not in the user's example, but we can handle them
          case 'BOOLEAN':
            token.$type = 'boolean';
            token.$value = value;
            break;
        }

        if (v.description) {
            token['$description'] = v.description;
        }

        // Use the token set name for modes (e.g., "Semantic Colors/Light")
        const fullPath = [tokenSetName, ...path];
        setNestedObjectValue(allTokens, fullPath, token);
      }
    }
  }

  // 2. PROCESS FIGMA STYLES (Classic method for things not in variables yet)

  // -- Process Paint Styles (Colors) --
  const paintStyles = await figma.getLocalPaintStylesAsync();
  for (const style of paintStyles) {
    // Skip if a variable with the same name path likely handled this
    if (variableMap.has(style.name.replace(/\//g, '.'))) continue;

    const path = style.name.split('/');
    if (path.length > 0 && style.paints.length > 0) {
      const paint = style.paints[0];
      if (paint.type === 'SOLID') {
        const { r, g, b } = paint.color;
        const a = paint.opacity ?? 1;
        const token: any = {
          $value: rgbaToHex(r, g, b, a),
          $type: 'color'
        };
        if (style.description) {
          token['$description'] = style.description;
        }
        setNestedObjectValue(allTokens, path, token);
      }
    }
  }

  // -- Process Text Styles (Font Sizes, Line Heights, etc.) --
  const textStyles = await figma.getLocalTextStylesAsync();
  for (const style of textStyles) {
      const path = style.name.split('/');
      if (path.length > 0) {
          // The example separates font size and line height into different tokens
          // This assumes style names like "Dynamic Text Size/H1" and "Dynamic Text Size/H1 line-height"
          let value;
          let type = 'number'; // Generic number type for dimensions
          
          if (style.name.toLowerCase().includes('line-height')) {
              if (style.lineHeight.unit !== 'AUTO') {
                 value = style.lineHeight.value;
              }
          } else {
              value = style.fontSize;
          }

          if (value !== undefined) {
              const token: any = { $value: value, $type: type };
               if (style.description) {
                  token['$description'] = style.description;
               }
              setNestedObjectValue(allTokens, path, token);
          }
      }
  }

  // NOTE: You can add processors for Effect Styles (shadows) or Grid Styles here if needed.
  // This version covers the types in your example JSON.

  return allTokens;
}

// --- DTCG FORMAT TRANSFORMATION ---

// Transform standard tokens to DTCG format
function transformToDTCG(tokens: any): any {
  const dtcgTokens: any = {
    $metadata: {
      tokenSetOrder: [],
      tokenSets: {}
    }
  };
  
  const tokenSets: string[] = [];
  
  function processTokenGroup(group: any, groupName: string, parentPath: string[] = []) {
    for (const [key, value] of Object.entries(group)) {
      if (value && typeof value === 'object' && '$type' in value) {
        // This is a token
        const token = value as any;
        const dtcgToken: any = {};
        
        // Map token types to proper DTCG types
        switch (token.$type) {
          case 'color':
            dtcgToken.$type = 'color';
            dtcgToken.$value = token.$value;
            break;
          case 'number':
            // Determine if it's a dimension, font size, or other number type
            if (key.toLowerCase().includes('size') || key.toLowerCase().includes('font')) {
              dtcgToken.$type = 'fontSize';
              dtcgToken.$value = `${token.$value}px`;
            } else if (key.toLowerCase().includes('line') || key.toLowerCase().includes('height')) {
              dtcgToken.$type = 'lineHeight';
              dtcgToken.$value = token.$value; // Line height is often unitless
            } else if (key.toLowerCase().includes('spacing') || key.toLowerCase().includes('margin') || key.toLowerCase().includes('padding')) {
              dtcgToken.$type = 'spacing';
              dtcgToken.$value = `${token.$value}px`;
            } else {
              dtcgToken.$type = 'dimension';
              dtcgToken.$value = `${token.$value}px`;
            }
            break;
          case 'text':
            dtcgToken.$type = 'string';
            dtcgToken.$value = token.$value;
            break;
          case 'boolean':
            dtcgToken.$type = 'boolean';
            dtcgToken.$value = token.$value;
            break;
          default:
            dtcgToken.$type = token.$type;
            dtcgToken.$value = token.$value;
        }
        
        // Add description if present
        if (token.$description) {
          dtcgToken.$description = token.$description;
        }
        
        // Add extensions for DTCG compliance
        dtcgToken.$extensions = {
          'com.figma': {
            hiddenFromPublishing: false,
            scopes: ['ALL_SCOPES']
          }
        };
        
        // Create proper nested structure
        let current = dtcgTokens;
        const fullPath = [...parentPath, key];
        
        for (let i = 0; i < fullPath.length - 1; i++) {
          const pathKey = fullPath[i];
          if (!current[pathKey]) {
            current[pathKey] = {};
          }
          current = current[pathKey];
        }
        
        current[fullPath[fullPath.length - 1]] = dtcgToken;
        
        // Track token sets for metadata
        const tokenSetName = parentPath[0] || 'global';
        if (!tokenSets.includes(tokenSetName)) {
          tokenSets.push(tokenSetName);
        }
        
      } else if (value && typeof value === 'object') {
        // This is a nested group, recurse
        processTokenGroup(value, groupName, [...parentPath, key]);
      }
    }
  }
  
  processTokenGroup(tokens, '');
  
  // Update metadata
  dtcgTokens.$metadata.tokenSetOrder = tokenSets;
  tokenSets.forEach(setName => {
    dtcgTokens.$metadata.tokenSets[setName] = {
      path: `tokens/${setName}.json`
    };
  });
  
  return dtcgTokens;
}

// Export tokens in DTCG format
async function exportDTCGTokens() {
  const standardTokens = await exportTokens();
  return transformToDTCG(standardTokens);
}

// Get all available variables for the side pane
async function getAllVariables() {
  const variables: any[] = [];
  
  try {
    // Get Figma variables
    const localVariables = await figma.variables.getLocalVariablesAsync();
    const collections = await figma.variables.getLocalVariableCollectionsAsync();
    
    for (const variable of localVariables) {
      const collection = collections.find(c => c.variableIds.includes(variable.id));
      const modes = collection ? collection.modes : [];
      
      variables.push({
        id: variable.id,
        name: variable.name,
        type: variable.resolvedType,
        collection: collection?.name || 'Unknown',
        modes: modes.map(m => m.name),
        description: variable.description || ''
      });
    }
    
    // Get paint styles
    const paintStyles = await figma.getLocalPaintStylesAsync();
    for (const style of paintStyles) {
      variables.push({
        id: style.id,
        name: style.name,
        type: 'PAINT_STYLE',
        collection: 'Paint Styles',
        modes: ['Default'],
        description: style.description || ''
      });
    }
    
    // Get text styles
    const textStyles = await figma.getLocalTextStylesAsync();
    for (const style of textStyles) {
      variables.push({
        id: style.id,
        name: style.name,
        type: 'TEXT_STYLE',
        collection: 'Text Styles',
        modes: ['Default'],
        description: style.description || ''
      });
    }
    
  } catch (error) {
    console.error('Error getting variables:', error);
  }
  
  return variables;
}

// --- TAILWIND CSS FORMAT ---

// Export tokens in Tailwind CSS format
async function exportTailwindCSS() {
  const tokens = await exportTokens();
  let tailwindConfig = `module.exports = {
  theme: {
    extend: {
      colors: {
        // Generated from Figma variables
      },
      spacing: {
        // Generated from Figma variables
      },
      fontSize: {
        // Generated from Figma variables
      },
      fontFamily: {
        // Generated from Figma variables
      },
      borderRadius: {
        // Generated from Figma variables
      },
      boxShadow: {
        // Generated from Figma variables
      }
    }
  }
}`;

  const colors: any = {};
  const spacing: any = {};
  const fontSize: any = {};
  const fontFamily: any = {};
  const borderRadius: any = {};
  const boxShadow: any = {};

  function processTokens(obj: any, prefix: string = '') {
    for (const [key, value] of Object.entries(obj)) {
      if (value && typeof value === 'object' && '$type' in value) {
        const token = value as any;
        const tokenName = `${prefix}${key}`.toLowerCase().replace(/[^a-z0-9-]/g, '-');
        
        switch (token.$type) {
          case 'color':
            colors[tokenName] = token.$value;
            break;
          case 'dimension':
          case 'spacing':
            if (key.toLowerCase().includes('font') || key.toLowerCase().includes('size')) {
              fontSize[tokenName] = token.$value;
            } else {
              spacing[tokenName] = token.$value;
            }
            break;
          case 'fontSize':
            fontSize[tokenName] = token.$value;
            break;
          case 'fontFamily':
            fontFamily[tokenName] = token.$value;
            break;
          case 'borderRadius':
            borderRadius[tokenName] = token.$value;
            break;
          case 'shadow':
            boxShadow[tokenName] = token.$value;
            break;
        }
      } else if (value && typeof value === 'object') {
        processTokens(value, `${prefix}${key}-`);
      }
    }
  }

  processTokens(tokens);

  // Generate the actual Tailwind config
  let config = `module.exports = {
  theme: {
    extend: {`;

  if (Object.keys(colors).length > 0) {
    config += `
      colors: {
        // Generated from Figma variables
${Object.entries(colors).map(([key, value]) => `        '${key}': '${value}',`).join('\n')}
      },`;
  }

  if (Object.keys(spacing).length > 0) {
    config += `
      spacing: {
        // Generated from Figma variables
${Object.entries(spacing).map(([key, value]) => `        '${key}': '${value}',`).join('\n')}
      },`;
  }

  if (Object.keys(fontSize).length > 0) {
    config += `
      fontSize: {
        // Generated from Figma variables
${Object.entries(fontSize).map(([key, value]) => `        '${key}': '${value}',`).join('\n')}
      },`;
  }

  if (Object.keys(fontFamily).length > 0) {
    config += `
      fontFamily: {
        // Generated from Figma variables
${Object.entries(fontFamily).map(([key, value]) => `        '${key}': [${Array.isArray(value) ? value.map(v => `'${v}'`).join(', ') : `'${value}'`}],`).join('\n')}
      },`;
  }

  if (Object.keys(borderRadius).length > 0) {
    config += `
      borderRadius: {
        // Generated from Figma variables
${Object.entries(borderRadius).map(([key, value]) => `        '${key}': '${value}',`).join('\n')}
      },`;
  }

  if (Object.keys(boxShadow).length > 0) {
    config += `
      boxShadow: {
        // Generated from Figma variables
${Object.entries(boxShadow).map(([key, value]) => `        '${key}': '${value}',`).join('\n')}
      },`;
  }

  config += `
    }
  }
}`;

  return config;
}

// --- ENHANCED DTCG FORMAT ---

// Enhanced DTCG format with themes and proper metadata
async function exportEnhancedDTCG() {
  const tokens = await exportTokens();
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  
  const dtcgTokens: any = {
    $metadata: {
      tokenSetOrder: [],
      tokenSets: {}
    },
    $themes: []
  };
  
  // Add themes for each collection and mode
  for (const collection of collections) {
    for (const mode of collection.modes) {
      const themeId = `${collection.name.toLowerCase().replace(/\s+/g, '-')}-${mode.name.toLowerCase().replace(/\s+/g, '-')}`;
      const themeName = `${collection.name} - ${mode.name}`;
      const groupName = collection.name;
      
      dtcgTokens.$themes.push({
        id: themeId,
        name: themeName,
        group: groupName,
        selectedTokenSets: {
          [`${collection.name}/${mode.name}`]: 'enabled'
        },
        $figmaStyleReferences: {},
        $figmaVariableReferences: {},
        $figmaModeId: mode.modeId,
        $figmaCollectionId: collection.id
      });
      
      // Add to metadata
      const tokenSetName = `${collection.name}/${mode.name}`;
      if (!dtcgTokens.$metadata.tokenSetOrder.includes(tokenSetName)) {
        dtcgTokens.$metadata.tokenSetOrder.push(tokenSetName);
      }
      
      dtcgTokens.$metadata.tokenSets[tokenSetName] = {
        path: `tokens/${tokenSetName}.json`
      };
    }
  }
  
  // Add the actual tokens
  Object.assign(dtcgTokens, tokens);
  
  return dtcgTokens;
}

// GitHub push functionality
async function pushToGitHub(repoUrl: string, token: string, branch: string, path: string, content: string, filename: string) {
  try {
    // Extract owner and repo from URL
    const urlMatch = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
    if (!urlMatch) {
      throw new Error('Invalid GitHub repository URL');
    }
    
    const owner = urlMatch[1];
    const repo = urlMatch[2];
    
    // Get file SHA if it exists
    let fileSha = '';
    try {
      const getFileResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}${filename}`, {
        headers: {
          'Authorization': `token ${token}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });
      
      if (getFileResponse.ok) {
        const fileData = await getFileResponse.json();
        fileSha = fileData.sha;
      }
    } catch (error) {
      // File doesn't exist, that's okay
    }
    
    // Create or update file
    const filePath = path ? `${path}/${filename}` : filename;
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`, {
      method: 'PUT',
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: `Update ${filename} from Figma plugin`,
        content: base64Encode(content),
        branch: branch,
        sha: fileSha || undefined
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`GitHub API error: ${errorData.message}`);
    }
    
    const result = await response.json();
    return {
      success: true,
      message: `Successfully pushed ${filename} to GitHub`,
      url: result.content.html_url
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to push to GitHub: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

// Listen for messages from the UI
figma.ui.onmessage = async (msg) => {
  if (msg.type === 'export-tokens') {
    try {
      const tokens = await exportTokens();
      const jsonString = JSON.stringify(tokens, null, 2);
      figma.ui.postMessage({ type: 'export-complete', jsonString });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      figma.ui.postMessage({ type: 'export-error', message: errorMessage });
      figma.notify('Error exporting tokens. See plugin console for details.', { error: true });
      console.error(error);
    }
  } else if (msg.type === 'export-dtcg-tokens') {
    try {
      const dtcgTokens = await exportDTCGTokens();
      const jsonString = JSON.stringify(dtcgTokens, null, 2);
      figma.ui.postMessage({ type: 'export-dtcg-complete', jsonString });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      figma.ui.postMessage({ type: 'export-error', message: errorMessage });
      figma.notify('Error exporting DTCG tokens. See plugin console for details.', { error: true });
      console.error(error);
    }
  } else if (msg.type === 'export-enhanced-dtcg') {
    try {
      const dtcgTokens = await exportEnhancedDTCG();
      const jsonString = JSON.stringify(dtcgTokens, null, 2);
      figma.ui.postMessage({ type: 'export-enhanced-dtcg-complete', jsonString });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      figma.ui.postMessage({ type: 'export-error', message: errorMessage });
      figma.notify('Error exporting enhanced DTCG tokens. See plugin console for details.', { error: true });
      console.error(error);
    }
  } else if (msg.type === 'export-tailwind-css') {
    try {
      const tailwindConfig = await exportTailwindCSS();
      figma.ui.postMessage({ type: 'export-tailwind-css-complete', tailwindConfig });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      figma.ui.postMessage({ type: 'export-error', message: errorMessage });
      figma.notify('Error exporting Tailwind CSS. See plugin console for details.', { error: true });
      console.error(error);
    }
  } else if (msg.type === 'push-to-github') {
    try {
      const result = await pushToGitHub(
        msg.repoUrl,
        msg.token,
        msg.branch,
        msg.path,
        msg.content,
        msg.filename
      );
      figma.ui.postMessage({ type: 'github-push-complete', result });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      figma.ui.postMessage({ type: 'export-error', message: errorMessage });
      figma.notify('Error pushing to GitHub. See plugin console for details.', { error: true });
      console.error(error);
    }
  } else if (msg.type === 'get-variables') {
    try {
      const variables = await getAllVariables();
      figma.ui.postMessage({ type: 'variables-loaded', variables });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      figma.ui.postMessage({ type: 'export-error', message: errorMessage });
      console.error(error);
    }
  }
};