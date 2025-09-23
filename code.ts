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

// Helper to convert Figma's 0-1 RGBA values to a hex string (#RRGGBB)
function rgbaToHex(r: number, g: number, b: number, a: number): string {
  const toHex = (c: number) => ('0' + Math.round(c * 255).toString(16)).slice(-2);
  // Only include alpha if it's not fully opaque (1.0)
  if (a < 1) {
    return `#${toHex(r)}${toHex(g)}${toHex(b)}${toHex(a)}`;
  }
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
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

  // Text styles processing removed to avoid duplication with variables

  // NOTE: You can add processors for Effect Styles (shadows) or Grid Styles here if needed.
  // This version covers the types in your example JSON.

  return allTokens;
}

// --- STYLE DICTIONARY FORMAT TRANSFORMATION ---

// --- START: generic flattener for any collection/mode tree ---
function transformToStyleDictionary(tokens: any): any {
  // tokens: { "<Collection>/<Mode>": { nested paths -> { $value, $type, $description? } } }

  const out: any = {};

  const toKebab = (s: string) =>
    s
      .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
      .replace(/[\s_./]+/g, '-')
      .replace(/-+/g, '-')
      .toLowerCase();

  function walk(node: any, pathArr: string[], bucketKey: string) {
    if (!node || typeof node !== 'object') return;

    // leaf token?
    if (Object.prototype.hasOwnProperty.call(node, '$value') &&
        Object.prototype.hasOwnProperty.call(node, '$type')) {
      const tokenName = toKebab(pathArr.join('-'));
      if (!out[bucketKey]) out[bucketKey] = {};
      const token: any = {
        value: node.$value,
        // SD prefers "dimension" for numeric tokens
        type: node.$type === 'number' ? 'dimension' : node.$type
      };
      
      if (node.$description) {
        token.description = node.$description;
      }
      
      out[bucketKey][tokenName] = token;
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

// CSS Custom Properties generator
function generateCSSOutput(tokens: any): string {
  let output = ':root {\n';
  
  Object.entries(tokens).forEach(([category, categoryTokens]: [string, any]) => {
    Object.entries(categoryTokens).forEach(([tokenName, token]: [string, any]) => {
      const cssVarName = `--${category}-${tokenName}`;
      output += `  ${cssVarName}: ${token.value};\n`;
    });
  });
  
  output += '}\n';
  return output;
}
// SCSS Variables generator
function generateSCSSOutput(tokens: any): string {
  let output = '';
  
  Object.entries(tokens).forEach(([category, categoryTokens]: [string, any]) => {
    output += `// ${category}\n`;
    Object.entries(categoryTokens).forEach(([tokenName, token]: [string, any]) => {
      const scssVarName = `$${category}-${tokenName}`;
      output += `${scssVarName}: ${token.value};\n`;
    });
    output += '\n';
  });
  
  return output;
}

// JavaScript/ES6 generator
function generateJSOutput(tokens: any): string {
  let output = 'export const designTokens = {\n';
  
  Object.entries(tokens).forEach(([category, categoryTokens]: [string, any]) => {
    output += `  ${category}: {\n`;
    Object.entries(categoryTokens).forEach(([tokenName, token]: [string, any]) => {
      output += `    ${tokenName}: '${token.value}',\n`;
    });
    output += '  },\n';
  });
  
  output += '};\n';
  return output;
}

// TypeScript generator
function generateTSOutput(tokens: any): string {
  let output = 'export interface DesignTokens {\n';
  
  Object.entries(tokens).forEach(([category, categoryTokens]: [string, any]) => {
    output += `  ${category}: {\n`;
    Object.entries(categoryTokens).forEach(([tokenName, token]: [string, any]) => {
      output += `    ${tokenName}: string;\n`;
    });
    output += '  };\n';
  });
  
  output += '}\n\n';
  output += 'export const designTokens: DesignTokens = {\n';
  
  Object.entries(tokens).forEach(([category, categoryTokens]: [string, any]) => {
    output += `  ${category}: {\n`;
    Object.entries(categoryTokens).forEach(([tokenName, token]: [string, any]) => {
      output += `    ${tokenName}: '${token.value}',\n`;
    });
    output += '  },\n';
  });
  
  output += '};\n';
  return output;
}

// iOS Swift generator
function generateiOSOutput(tokens: any): string {
  let output = 'import UIKit\n\n';
  output += 'class DesignTokens {\n';
  output += '  static let shared = DesignTokens()\n';
  output += '  private init() {}\n\n';
  
  Object.entries(tokens).forEach(([category, categoryTokens]: [string, any]) => {
    output += `  // MARK: - ${category}\n`;
    Object.entries(categoryTokens).forEach(([tokenName, token]: [string, any]) => {
      try {
        if (token.type === 'color') {
          const color = parseColor(token.value);
          output += `  static let ${tokenName} = UIColor(red: ${color.r}, green: ${color.g}, blue: ${color.b}, alpha: ${color.a})\n`;
        } else {
          output += `  static let ${tokenName} = "${token.value}"\n`;
        }
      } catch (error) {
        console.error(`Error processing token ${tokenName}:`, error);
        output += `  static let ${tokenName} = "${token.value}" // Error parsing\n`;
      }
    });
    output += '\n';
  });
  
  output += '}\n';
  return output;
}

// Android Kotlin generator
function generateAndroidOutput(tokens: any): string {
  let output = 'package com.example.designsystem\n\n';
  output += 'import androidx.compose.ui.graphics.Color\n\n';
  output += 'object DesignTokens {\n';
  
  Object.entries(tokens).forEach(([category, categoryTokens]: [string, any]) => {
    output += `    // ${category}\n`;
    Object.entries(categoryTokens).forEach(([tokenName, token]: [string, any]) => {
      try {
        if (token.type === 'color') {
          const color = parseColor(token.value);
          output += `    val ${tokenName} = Color(0x${color.hex})\n`;
        } else {
          output += `    val ${tokenName} = "${token.value}"\n`;
        }
      } catch (error) {
        console.error(`Error processing token ${tokenName}:`, error);
        output += `    val ${tokenName} = "${token.value}" // Error parsing\n`;
      }
    });
    output += '\n';
  });
  
  output += '}\n';
  return output;
}

// Flutter Dart generator
function generateFlutterOutput(tokens: any): string {
  let output = 'import \'package:flutter/material.dart\';\n\n';
  output += 'class DesignTokens {\n';
  output += '  static const DesignTokens _instance = DesignTokens._();\n';
  output += '  factory DesignTokens() => _instance;\n';
  output += '  const DesignTokens._();\n\n';
  
  Object.entries(tokens).forEach(([category, categoryTokens]: [string, any]) => {
    output += `  // ${category}\n`;
    Object.entries(categoryTokens).forEach(([tokenName, token]: [string, any]) => {
      try {
        if (token.type === 'color') {
          const color = parseColor(token.value);
          output += `  static const Color ${tokenName} = Color(0x${color.hex});\n`;
        } else {
          output += `  static const String ${tokenName} = '${token.value}';\n`;
        }
      } catch (error) {
        console.error(`Error processing token ${tokenName}:`, error);
        output += `  static const String ${tokenName} = '${token.value}'; // Error parsing\n`;
      }
    });
    output += '\n';
  });
  
  output += '}\n';
  return output;
}

// React Native generator
function generateReactNativeOutput(tokens: any): string {
  let output = 'const designTokens = {\n';
  
  Object.entries(tokens).forEach(([category, categoryTokens]: [string, any]) => {
    output += `  ${category}: {\n`;
    Object.entries(categoryTokens).forEach(([tokenName, token]: [string, any]) => {
      output += `    ${tokenName}: '${token.value}',\n`;
    });
    output += '  },\n';
  });
  
  output += '};\n\n';
  output += 'export default designTokens;\n';
  return output;
}

// JSON generator
function generateJSONOutput(tokens: any): string {
  return JSON.stringify(tokens, null, 2);
}

// Helper function to parse color values
function parseColor(colorValue: string): { r: number, g: number, b: number, a: number, hex: string } {
  try {
    // Handle hex colors
    if (colorValue.startsWith('#')) {
      let hex = colorValue.replace('#', '');
      
      // Handle 3-digit hex (e.g., #FFF)
      if (hex.length === 3) {
        hex = hex.split('').map(char => char + char).join('');
      }
      
      // Handle 6-digit hex (no alpha) or 8-digit hex (with alpha)
      let r: number, g: number, b: number, a: number;
      if (hex.length === 6) {
        // 6-digit hex: #RRGGBB
        r = parseInt(hex.substr(0, 2), 16) / 255;
        g = parseInt(hex.substr(2, 2), 16) / 255;
        b = parseInt(hex.substr(4, 2), 16) / 255;
        a = 1; // Fully opaque
      } else if (hex.length === 8) {
        // 8-digit hex: #AARRGGBB
        a = parseInt(hex.substr(0, 2), 16) / 255;
        r = parseInt(hex.substr(2, 2), 16) / 255;
        g = parseInt(hex.substr(4, 2), 16) / 255;
        b = parseInt(hex.substr(6, 2), 16) / 255;
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

// Export Style Dictionary tokens for a specific platform
async function exportStyleDictionaryTokens(platform: string) {
  try {
    const allVariables = await getAllVariables();
    console.log('All variables for platform', platform, ':', allVariables);
    
    // Transform tokens to Style Dictionary format
    const sdTokens = transformToStyleDictionary(allVariables);
    console.log('Transformed tokens for platform', platform, ':', sdTokens);
    
    // Generate platform-specific output
    let result;
    switch (platform) {
      case 'css':
        result = generateCSSOutput(sdTokens);
        break;
      case 'scss':
        result = generateSCSSOutput(sdTokens);
        break;
      case 'js':
        result = generateJSOutput(sdTokens);
        break;
      case 'ts':
        result = generateTSOutput(sdTokens);
        break;
      case 'ios':
        result = generateiOSOutput(sdTokens);
        break;
      case 'android':
        result = generateAndroidOutput(sdTokens);
        break;
      case 'flutter':
        result = generateFlutterOutput(sdTokens);
        break;
      case 'react-native':
        result = generateReactNativeOutput(sdTokens);
        break;
      case 'json':
        result = generateJSONOutput(sdTokens);
        break;
      default:
        result = generateJSONOutput(sdTokens);
    }
    
    console.log('Generated output for platform', platform, ':', result.substring(0, 200) + '...');
    return result;
  } catch (error) {
    console.error('Error in exportStyleDictionaryTokens for platform', platform, ':', error);
    throw error;
  }
}

// Get filename for platform
function getFilenameForPlatform(platform: string): string {
  const filenames: { [key: string]: string } = {
    'css': 'design-tokens.css',
    'scss': 'design-tokens.scss',
    'js': 'design-tokens.js',
    'ts': 'design-tokens.ts',
    'ios': 'DesignTokens.swift',
    'android': 'DesignTokens.kt',
    'flutter': 'design_tokens.dart',
    'react-native': 'DesignTokens.js',
    'json': 'design-tokens.json'
  };
  
  return filenames[platform] || 'design-tokens.json';
}

// Filter variables by selected collections
function filterVariablesByCollections(categorizedVariables: any, selectedCollections: string[]): any {
  if (!selectedCollections || selectedCollections.length === 0) {
    return categorizedVariables; // Return all if no selection
  }
  
  const filtered: any = {};
  selectedCollections.forEach(collectionName => {
    if (categorizedVariables[collectionName]) {
      filtered[collectionName] = categorizedVariables[collectionName];
    }
  });
  
  return filtered;
}

// Get all available variables for the side pane with categorization
async function getAllVariables() {
  const categorizedVariables: any = {};
  
  // Fallback: if no variables are found in categories, we'll add an "All Variables" category
  let allVariables: any[] = [];
  
  try {
    // Get Figma variables
    const localVariables = await figma.variables.getLocalVariablesAsync();
    const collections = await figma.variables.getLocalVariableCollectionsAsync();
    
    console.log('Found collections:', collections.map(c => c.name));
    console.log('Found variables:', localVariables.length);
    console.log('Collection details:', collections.map(c => ({ name: c.name, variableCount: c.variableIds.length })));
    
    for (const variable of localVariables) {
      const collection = collections.find(c => c.variableIds.includes(variable.id));
      const modes = collection ? collection.modes : [];
      
      // Get the actual value from the first mode
      let actualValue = null;
      if (modes.length > 0) {
        const firstModeId = modes[0].modeId;
        const value = variable.valuesByMode[firstModeId];
        
        if (value !== undefined) {
          // Handle different value types
          if (typeof value === 'object' && value !== null) {
            if ('type' in value && value.type === 'VARIABLE_ALIAS') {
              // This is a reference to another variable
              try {
                const referencedVariable = await figma.variables.getVariableByIdAsync(value.id);
                if (referencedVariable) {
                  const referencedValue = referencedVariable.valuesByMode[firstModeId];
                  actualValue = referencedValue;
                } else {
                  actualValue = value;
                }
              } catch (error) {
                console.warn(`Could not resolve variable reference for ${variable.name}:`, error);
                actualValue = value;
              }
            } else if ('r' in value && 'g' in value && 'b' in value) {
              // This is a color object with r, g, b, a values
              const r = Math.round(value.r * 255);
              const g = Math.round(value.g * 255);
              const b = Math.round(value.b * 255);
              const a = 'a' in value ? value.a : 1;
              actualValue = `rgba(${r}, ${g}, ${b}, ${a})`;
            } else {
              actualValue = value;
            }
          } else {
            actualValue = value;
          }
        }
      }
      
      // Keep all line-height values in their respective collections
      // Each collection serves different purposes and should maintain its own line-height values
      
      console.log(`Variable ${variable.name} details:`, {
        resolvedType: variable.resolvedType,
        actualValue: actualValue,
        collection: collection?.name
      });
      
      const variableData = {
        id: variable.id,
        name: variable.name,
        type: variable.resolvedType || 'VARIABLE',
        value: actualValue,
        collection: collection?.name || 'Unknown',
        modes: modes.map(m => m.name),
        description: variable.description || ''
      };
      
      // Add to all variables list
      allVariables.push(variableData);
      
      // Use the actual collection name from Figma
      const collectionName = collection?.name || 'Unknown';
      console.log(`Variable ${variable.name} assigned to collection: ${collectionName} (collection found: ${!!collection})`);
      
      if (!categorizedVariables[collectionName]) {
        categorizedVariables[collectionName] = [];
      }
      categorizedVariables[collectionName].push(variableData);
    }
    
    // Get paint styles
    const paintStyles = await figma.getLocalPaintStylesAsync();
    for (const style of paintStyles) {
      // Extract color value from paint style
      let colorValue = 'No value';
      if (style.paints && style.paints.length > 0) {
        const paint = style.paints[0];
        if (paint.type === 'SOLID') {
          const { r, g, b } = paint.color;
          const a = paint.opacity ?? 1;
          const red = Math.round(r * 255);
          const green = Math.round(g * 255);
          const blue = Math.round(b * 255);
          const alpha = Math.round(a * 255);
          
          if (a === 1) {
            colorValue = `#${red.toString(16).padStart(2, '0')}${green.toString(16).padStart(2, '0')}${blue.toString(16).padStart(2, '0')}`;
          } else {
            colorValue = `rgba(${red}, ${green}, ${blue}, ${a})`;
          }
        }
      }
      
      const styleData = {
        id: style.id,
        name: style.name,
        type: 'PAINT_STYLE',
        value: colorValue,
        collection: 'Paint Styles',
        modes: ['Default'],
        description: style.description || ''
      };
      
      // Add to all variables list
      allVariables.push(styleData);
      
      // Group paint styles by collection
      const collectionName = 'Paint Styles';
      if (!categorizedVariables[collectionName]) {
        categorizedVariables[collectionName] = [];
      }
      categorizedVariables[collectionName].push(styleData);
    }
    
    // Text styles are not processed separately to avoid duplication with variables
    // Variables already contain font size and line-height values
    
  } catch (error) {
    console.error('Error getting variables:', error);
  }
  
  // Debug logging
  console.log('Categorized variables:', categorizedVariables);
  const totalVariables = Object.values(categorizedVariables).reduce((sum: number, vars) => sum + (vars as any[]).length, 0);
  console.log(`Total variables found: ${totalVariables}`);
  console.log('All variables:', allVariables);
  console.log('Collection names found:', Object.keys(categorizedVariables));
  console.log('Total variables in allVariables array:', allVariables.length);
  
  // If no variables were categorized, show them all in an "All Variables" category
  if (totalVariables === 0 && allVariables.length > 0) {
    console.log('No variables categorized, showing all in "All Variables" category');
    console.log('This means categorizedVariables is empty but allVariables has items');
    return {
      'All Variables': allVariables
    };
  }
  
  // Sort categories alphabetically for better organization
  const sortedCategories: any = {};
  Object.keys(categorizedVariables).sort().forEach(key => {
    sortedCategories[key] = categorizedVariables[key];
  });
  
  console.log('Returning categorized variables:', sortedCategories);
  return sortedCategories;
}

// Helper function to categorize variables based on type and name patterns
// Note: This function is no longer used as we now group by collection names
function categorizeVariable(variable: any): string {
  // This function is deprecated - we now group by collection names instead
  return 'Other';
}

// --- PLATFORM EXPORT FORMATS ---

// Export tokens in Swift/iOS format
async function exportSwiftTokens() {
  const tokens = await exportTokens();
  let swiftCode = `// Design Tokens for iOS/Swift
// Generated from Figma

import Foundation

// MARK: - Color Tokens
struct ColorTokens {
`;

  const colors: any = {};
  const spacing: any = {};
  const typography: any = {};
  const sizes: any = {};

  function processTokens(obj: any, prefix: string = '') {
    for (const [key, value] of Object.entries(obj)) {
      if (value && typeof value === 'object' && '$type' in value) {
        const token = value as any;
        const tokenName = `${prefix}${key}`.replace(/[^a-zA-Z0-9]/g, '').replace(/^[0-9]/, '_$&');
        
        switch (token.$type) {
          case 'color':
            colors[tokenName] = token.$value;
            break;
          case 'dimension':
          case 'spacing':
            if (key.toLowerCase().includes('font') || key.toLowerCase().includes('size')) {
              typography[tokenName] = token.$value;
            } else {
              spacing[tokenName] = token.$value;
            }
            break;
          case 'fontSize':
            typography[tokenName] = token.$value;
            break;
          case 'fontFamily':
            typography[tokenName] = token.$value;
            break;
          default:
            sizes[tokenName] = token.$value;
        }
      } else if (value && typeof value === 'object') {
        processTokens(value, `${prefix}${key}`);
      }
    }
  }

  processTokens(tokens);

  // Generate color tokens
  if (Object.keys(colors).length > 0) {
    swiftCode += `
    // Color Tokens
`;
    Object.entries(colors).forEach(([key, value]) => {
      const hexColor = value as string;
      const r = parseInt(hexColor.slice(1, 3), 16) / 255;
      const g = parseInt(hexColor.slice(3, 5), 16) / 255;
      const b = parseInt(hexColor.slice(5, 7), 16) / 255;
      swiftCode += `    static let ${key} = UIColor(red: ${r}, green: ${g}, blue: ${b}, alpha: 1.0)\n`;
    });
  }

  // Generate spacing tokens
  if (Object.keys(spacing).length > 0) {
    swiftCode += `
}

// MARK: - Spacing Tokens
struct SpacingTokens {
`;
    Object.entries(spacing).forEach(([key, value]) => {
      const numValue = typeof value === 'string' ? parseFloat(value.replace('px', '')) : value;
      swiftCode += `    static let ${key}: CGFloat = ${numValue}\n`;
    });
  }

  // Generate typography tokens
  if (Object.keys(typography).length > 0) {
    swiftCode += `
}

// MARK: - Typography Tokens
struct TypographyTokens {
`;
    Object.entries(typography).forEach(([key, value]) => {
      const numValue = typeof value === 'string' ? parseFloat(value.replace('px', '')) : value;
      swiftCode += `    static let ${key}: CGFloat = ${numValue}\n`;
    });
  }

  // Generate size tokens
  if (Object.keys(sizes).length > 0) {
    swiftCode += `
}

// MARK: - Size Tokens
struct SizeTokens {
`;
    Object.entries(sizes).forEach(([key, value]) => {
      const numValue = typeof value === 'string' ? parseFloat(value.replace('px', '')) : value;
      swiftCode += `    static let ${key}: CGFloat = ${numValue}\n`;
    });
  }

  swiftCode += `
}`;

  return swiftCode;
}

// Export tokens in Kotlin/Android format
async function exportKotlinTokens() {
  const tokens = await exportTokens();
  let kotlinCode = `// Design Tokens for Android/Kotlin
// Generated from Figma

package com.yourpackage.tokens

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

// MARK: - Color Tokens
object ColorTokens {
`;

  const colors: any = {};
  const spacing: any = {};
  const typography: any = {};
  const sizes: any = {};

  function processTokens(obj: any, prefix: string = '') {
    for (const [key, value] of Object.entries(obj)) {
      if (value && typeof value === 'object' && '$type' in value) {
        const token = value as any;
        const tokenName = `${prefix}${key}`.replace(/[^a-zA-Z0-9]/g, '').replace(/^[0-9]/, '_$&');
        
        switch (token.$type) {
          case 'color':
            colors[tokenName] = token.$value;
            break;
          case 'dimension':
          case 'spacing':
            if (key.toLowerCase().includes('font') || key.toLowerCase().includes('size')) {
              typography[tokenName] = token.$value;
            } else {
              spacing[tokenName] = token.$value;
            }
            break;
          case 'fontSize':
            typography[tokenName] = token.$value;
            break;
          case 'fontFamily':
            typography[tokenName] = token.$value;
            break;
          default:
            sizes[tokenName] = token.$value;
        }
      } else if (value && typeof value === 'object') {
        processTokens(value, `${prefix}${key}`);
      }
    }
  }

  processTokens(tokens);

  // Generate color tokens
  if (Object.keys(colors).length > 0) {
    Object.entries(colors).forEach(([key, value]) => {
      const hexColor = value as string;
      const r = parseInt(hexColor.slice(1, 3), 16);
      const g = parseInt(hexColor.slice(3, 5), 16);
      const b = parseInt(hexColor.slice(5, 7), 16);
      kotlinCode += `    val ${key} = Color(0xFF${hexColor.slice(1).toUpperCase()})\n`;
    });
  }

  // Generate spacing tokens
  if (Object.keys(spacing).length > 0) {
    kotlinCode += `
}

// MARK: - Spacing Tokens
object SpacingTokens {
`;
    Object.entries(spacing).forEach(([key, value]) => {
      const numValue = typeof value === 'string' ? parseFloat(value.replace('px', '')) : value;
      kotlinCode += `    val ${key} = ${numValue}.dp\n`;
    });
  }

  // Generate typography tokens
  if (Object.keys(typography).length > 0) {
    kotlinCode += `
}

// MARK: - Typography Tokens
object TypographyTokens {
`;
    Object.entries(typography).forEach(([key, value]) => {
      const numValue = typeof value === 'string' ? parseFloat(value.replace('px', '')) : value;
      kotlinCode += `    val ${key} = ${numValue}.sp\n`;
    });
  }

  // Generate size tokens
  if (Object.keys(sizes).length > 0) {
    kotlinCode += `
}

// MARK: - Size Tokens
object SizeTokens {
`;
    Object.entries(sizes).forEach(([key, value]) => {
      const numValue = typeof value === 'string' ? parseFloat(value.replace('px', '')) : value;
      kotlinCode += `    val ${key} = ${numValue}.dp\n`;
    });
  }

  kotlinCode += `
}`;

  return kotlinCode;
}

// Export tokens in React/JavaScript format
async function exportReactTokens() {
  const tokens = await exportTokens();
  let reactCode = `// Design Tokens for React/JavaScript
// Generated from Figma

export const tokens = {
`;

  const colors: any = {};
  const spacing: any = {};
  const typography: any = {};
  const sizes: any = {};

  function processTokens(obj: any, prefix: string = '') {
    for (const [key, value] of Object.entries(obj)) {
      if (value && typeof value === 'object' && '$type' in value) {
        const token = value as any;
        const tokenName = `${prefix}${key}`.replace(/[^a-zA-Z0-9]/g, '').replace(/^[0-9]/, '_$&');
        
        switch (token.$type) {
          case 'color':
            colors[tokenName] = token.$value;
            break;
          case 'dimension':
          case 'spacing':
            if (key.toLowerCase().includes('font') || key.toLowerCase().includes('size')) {
              typography[tokenName] = token.$value;
            } else {
              spacing[tokenName] = token.$value;
            }
            break;
          case 'fontSize':
            typography[tokenName] = token.$value;
            break;
          case 'fontFamily':
            typography[tokenName] = token.$value;
            break;
          default:
            sizes[tokenName] = token.$value;
        }
      } else if (value && typeof value === 'object') {
        processTokens(value, `${prefix}${key}`);
      }
    }
  }

  processTokens(tokens);

  // Generate color tokens
  if (Object.keys(colors).length > 0) {
    reactCode += `  colors: {
`;
    Object.entries(colors).forEach(([key, value]) => {
      reactCode += `    ${key}: '${value}',\n`;
    });
    reactCode += `  },\n`;
  }

  // Generate spacing tokens
  if (Object.keys(spacing).length > 0) {
    reactCode += `  spacing: {
`;
    Object.entries(spacing).forEach(([key, value]) => {
      const numValue = typeof value === 'string' ? parseFloat(value.replace('px', '')) : value;
      reactCode += `    ${key}: '${numValue}px',\n`;
    });
    reactCode += `  },\n`;
  }

  // Generate typography tokens
  if (Object.keys(typography).length > 0) {
    reactCode += `  typography: {
`;
    Object.entries(typography).forEach(([key, value]) => {
      const numValue = typeof value === 'string' ? parseFloat(value.replace('px', '')) : value;
      reactCode += `    ${key}: '${numValue}px',\n`;
    });
    reactCode += `  },\n`;
  }

  // Generate size tokens
  if (Object.keys(sizes).length > 0) {
    reactCode += `  sizes: {
`;
    Object.entries(sizes).forEach(([key, value]) => {
      const numValue = typeof value === 'string' ? parseFloat(value.replace('px', '')) : value;
      reactCode += `    ${key}: '${numValue}px',\n`;
    });
    reactCode += `  },\n`;
  }

  reactCode += `};

export default tokens;`;

  return reactCode;
}

// Export tokens in CSS custom properties format
async function exportCSSTokens() {
  const tokens = await exportTokens();
  let cssCode = `/* Design Tokens for CSS Custom Properties */
/* Generated from Figma */

:root {
`;

  const colors: any = {};
  const spacing: any = {};
  const typography: any = {};
  const sizes: any = {};

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
              typography[tokenName] = token.$value;
            } else {
              spacing[tokenName] = token.$value;
            }
            break;
          case 'fontSize':
            typography[tokenName] = token.$value;
            break;
          case 'fontFamily':
            typography[tokenName] = token.$value;
            break;
          default:
            sizes[tokenName] = token.$value;
        }
      } else if (value && typeof value === 'object') {
        processTokens(value, `${prefix}${key}-`);
      }
    }
  }

  processTokens(tokens);

  // Generate color tokens
  if (Object.keys(colors).length > 0) {
    cssCode += `  /* Color Tokens */\n`;
    Object.entries(colors).forEach(([key, value]) => {
      cssCode += `  --color-${key}: ${value};\n`;
    });
  }

  // Generate spacing tokens
  if (Object.keys(spacing).length > 0) {
    cssCode += `  /* Spacing Tokens */\n`;
    Object.entries(spacing).forEach(([key, value]) => {
      const numValue = typeof value === 'string' ? parseFloat(value.replace('px', '')) : value;
      cssCode += `  --spacing-${key}: ${numValue}px;\n`;
    });
  }

  // Generate typography tokens
  if (Object.keys(typography).length > 0) {
    cssCode += `  /* Typography Tokens */\n`;
    Object.entries(typography).forEach(([key, value]) => {
      const numValue = typeof value === 'string' ? parseFloat(value.replace('px', '')) : value;
      cssCode += `  --font-${key}: ${numValue}px;\n`;
    });
  }

  // Generate size tokens
  if (Object.keys(sizes).length > 0) {
    cssCode += `  /* Size Tokens */\n`;
    Object.entries(sizes).forEach(([key, value]) => {
      const numValue = typeof value === 'string' ? parseFloat(value.replace('px', '')) : value;
      cssCode += `  --size-${key}: ${numValue}px;\n`;
    });
  }

  cssCode += `}`;

  return cssCode;
}

// Export tokens in SCSS variables format
async function exportSCSSTokens() {
  const tokens = await exportTokens();
  let scssCode = `// Design Tokens for SCSS Variables
// Generated from Figma

`;

  const colors: any = {};
  const spacing: any = {};
  const typography: any = {};
  const sizes: any = {};

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
              typography[tokenName] = token.$value;
            } else {
              spacing[tokenName] = token.$value;
            }
            break;
          case 'fontSize':
            typography[tokenName] = token.$value;
            break;
          case 'fontFamily':
            typography[tokenName] = token.$value;
            break;
          default:
            sizes[tokenName] = token.$value;
        }
      } else if (value && typeof value === 'object') {
        processTokens(value, `${prefix}${key}-`);
      }
    }
  }

  processTokens(tokens);

  // Generate color tokens
  if (Object.keys(colors).length > 0) {
    scssCode += `// Color Tokens\n`;
    Object.entries(colors).forEach(([key, value]) => {
      scssCode += `$color-${key}: ${value};\n`;
    });
    scssCode += `\n`;
  }

  // Generate spacing tokens
  if (Object.keys(spacing).length > 0) {
    scssCode += `// Spacing Tokens\n`;
    Object.entries(spacing).forEach(([key, value]) => {
      const numValue = typeof value === 'string' ? parseFloat(value.replace('px', '')) : value;
      scssCode += `$spacing-${key}: ${numValue}px;\n`;
    });
    scssCode += `\n`;
  }

  // Generate typography tokens
  if (Object.keys(typography).length > 0) {
    scssCode += `// Typography Tokens\n`;
    Object.entries(typography).forEach(([key, value]) => {
      const numValue = typeof value === 'string' ? parseFloat(value.replace('px', '')) : value;
      scssCode += `$font-${key}: ${numValue}px;\n`;
    });
    scssCode += `\n`;
  }

  // Generate size tokens
  if (Object.keys(sizes).length > 0) {
    scssCode += `// Size Tokens\n`;
    Object.entries(sizes).forEach(([key, value]) => {
      const numValue = typeof value === 'string' ? parseFloat(value.replace('px', '')) : value;
      scssCode += `$size-${key}: ${numValue}px;\n`;
    });
    scssCode += `\n`;
  }

  return scssCode;
}

// Export tokens in Flutter/Dart format
async function exportFlutterTokens() {
  const tokens = await exportTokens();
  let flutterCode = `// Design Tokens for Flutter/Dart
// Generated from Figma

import 'package:flutter/material.dart';

class DesignTokens {
`;

  const colors: any = {};
  const spacing: any = {};
  const typography: any = {};
  const sizes: any = {};

  function processTokens(obj: any, prefix: string = '') {
    for (const [key, value] of Object.entries(obj)) {
      if (value && typeof value === 'object' && '$type' in value) {
        const token = value as any;
        const tokenName = `${prefix}${key}`.replace(/[^a-zA-Z0-9]/g, '').replace(/^[0-9]/, '_$&');
        
        switch (token.$type) {
          case 'color':
            colors[tokenName] = token.$value;
            break;
          case 'dimension':
          case 'spacing':
            if (key.toLowerCase().includes('font') || key.toLowerCase().includes('size')) {
              typography[tokenName] = token.$value;
            } else {
              spacing[tokenName] = token.$value;
            }
            break;
          case 'fontSize':
            typography[tokenName] = token.$value;
            break;
          case 'fontFamily':
            typography[tokenName] = token.$value;
            break;
          default:
            sizes[tokenName] = token.$value;
        }
      } else if (value && typeof value === 'object') {
        processTokens(value, `${prefix}${key}`);
      }
    }
  }

  processTokens(tokens);

  // Generate color tokens
  if (Object.keys(colors).length > 0) {
    flutterCode += `  // Color Tokens
  static const Map<String, Color> colors = {
`;
    Object.entries(colors).forEach(([key, value]) => {
      const hexColor = value as string;
      const r = parseInt(hexColor.slice(1, 3), 16);
      const g = parseInt(hexColor.slice(3, 5), 16);
      const b = parseInt(hexColor.slice(5, 7), 16);
      flutterCode += `    '${key}': Color(0xFF${hexColor.slice(1).toUpperCase()}),\n`;
    });
    flutterCode += `  };\n\n`;
  }

  // Generate spacing tokens
  if (Object.keys(spacing).length > 0) {
    flutterCode += `  // Spacing Tokens
  static const Map<String, double> spacing = {
`;
    Object.entries(spacing).forEach(([key, value]) => {
      const numValue = typeof value === 'string' ? parseFloat(value.replace('px', '')) : value;
      flutterCode += `    '${key}': ${numValue},\n`;
    });
    flutterCode += `  };\n\n`;
  }

  // Generate typography tokens
  if (Object.keys(typography).length > 0) {
    flutterCode += `  // Typography Tokens
  static const Map<String, double> typography = {
`;
    Object.entries(typography).forEach(([key, value]) => {
      const numValue = typeof value === 'string' ? parseFloat(value.replace('px', '')) : value;
      flutterCode += `    '${key}': ${numValue},\n`;
    });
    flutterCode += `  };\n\n`;
  }

  // Generate size tokens
  if (Object.keys(sizes).length > 0) {
    flutterCode += `  // Size Tokens
  static const Map<String, double> sizes = {
`;
    Object.entries(sizes).forEach(([key, value]) => {
      const numValue = typeof value === 'string' ? parseFloat(value.replace('px', '')) : value;
      flutterCode += `    '${key}': ${numValue},\n`;
    });
    flutterCode += `  };\n\n`;
  }

  flutterCode += `}`;

  return flutterCode;
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

// Extract colors from variables for the color palette
function extractColors(variables: any): any {
  const colors: any = {};
  
  Object.entries(variables).forEach(([collectionName, variables]: [string, any]) => {
    // Look for Paint Styles collection that contains Umain colors
    if (collectionName === 'Paint Styles') {
      colors['Umain-colors/Value'] = {};
      
      (variables as any[]).forEach((variable: any) => {
        // Check if this is a Umain color paint style
        if (variable.type === 'PAINT_STYLE' && variable.name && variable.name.startsWith('Umain - colors/')) {
          const nameParts = variable.name.split('/');
          if (nameParts.length >= 3) {
            const colorFamily = nameParts[1]; // e.g., "Greyscale"
            const colorShade = nameParts[2];  // e.g., "900"
            
            if (!colors['Umain-colors/Value'][colorFamily]) {
              colors['Umain-colors/Value'][colorFamily] = {};
            }
            
            // Use the actual color value extracted from the paint style
            colors['Umain-colors/Value'][colorFamily][colorShade] = {
              value: variable.value || 'No value',
              type: 'color',
              description: variable.description || ''
            };
          }
        }
      });
    }
  });
  
  return colors;
}

// Generate color palette export
function generateColorPalette(colors: any): string {
  return JSON.stringify(colors, null, 2);
}

// Transform to Token Studio format
function transformToTokenStudio(tokens: any): any {
  console.log('transformToTokenStudio called with tokens:', Object.keys(tokens));
  
  const tokenStudio: any = {
    $themes: [],
    $metadata: {
      tokenSetOrder: []
    }
  };

  // Process each collection directly from Figma
  console.log('Available collections for Token Studio:', Object.keys(tokens));
  Object.entries(tokens).forEach(([collectionName, variables]: [string, any]) => {
    console.log(`Processing collection: ${collectionName} with ${(variables as any[]).length} variables`);
    console.log(`First few variables in ${collectionName}:`, (variables as any[]).slice(0, 3));
    
    // Dynamically process any collection based on its content
    const collectionTokens: any = {};
    
    (variables as any[]).forEach((variable: any) => {
      console.log(`Processing variable "${variable.name}" in collection "${collectionName}":`, {
        type: variable.type,
        value: variable.value,
        hasValue: variable.value !== null && variable.value !== undefined
      });
      
      if (variable.value !== null && variable.value !== undefined) {
        // Determine the token type based on variable type
        let tokenType = 'other';
        switch (variable.type) {
          case 'COLOR':
          case 'PAINT_STYLE':
            tokenType = 'color';
            break;
          case 'FLOAT':
          case 'DIMENSION':
            tokenType = 'number';
            break;
          case 'STRING':
            tokenType = 'string';
            break;
          case 'BOOLEAN':
            tokenType = 'boolean';
            break;
        }
        
        // Convert color values to proper hex format
        let tokenValue = variable.value;
        if (tokenType === 'color' && typeof variable.value === 'string' && variable.value.startsWith('rgba')) {
          const rgbaMatch = variable.value.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/);
          if (rgbaMatch) {
            const r = parseInt(rgbaMatch[1]);
            const g = parseInt(rgbaMatch[2]);
            const b = parseInt(rgbaMatch[3]);
            const a = parseFloat(rgbaMatch[4]);
            
            if (a === 1) {
              tokenValue = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
            } else {
              const alpha = Math.round(a * 255);
              tokenValue = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}${alpha.toString(16).padStart(2, '0')}`;
            }
          }
        }
        
        // Create nested structure based on variable name path
        const nameParts = variable.name.split('/');
        let current = collectionTokens;
        
        for (let i = 0; i < nameParts.length - 1; i++) {
          const part = nameParts[i];
          if (!current[part]) {
            current[part] = {};
          }
          current = current[part];
        }
        
        const finalKey = nameParts[nameParts.length - 1];
        const token: any = {
          $value: tokenValue,
          $type: tokenType
        };
        
        if (variable.description) {
          token.$description = variable.description;
        }
        
        current[finalKey] = token;
      }
    });
    
    // Add the collection to tokenStudio if it has tokens
    if (Object.keys(collectionTokens).length > 0) {
      tokenStudio[collectionName] = collectionTokens;
      console.log(`Added collection "${collectionName}" with ${Object.keys(collectionTokens).length} tokens`);
    } else {
      console.log(`Skipped collection "${collectionName}" - no valid tokens found`);
    }
  });

  // Set metadata token set order based on what we actually created
  const tokenSetOrder = Object.keys(tokenStudio).filter(key => key !== '$themes' && key !== '$metadata');
  tokenStudio.$metadata.tokenSetOrder = tokenSetOrder;

  // Clean up any tokens that don't have $value properties
  Object.keys(tokenStudio).forEach(key => {
    if (key !== '$themes' && key !== '$metadata') {
      const tokenSet = tokenStudio[key];
      if (typeof tokenSet === 'object') {
        Object.keys(tokenSet).forEach(tokenKey => {
          const token = tokenSet[tokenKey];
          if (typeof token === 'object' && !token.$value) {
            // Remove tokens without values
            delete tokenSet[tokenKey];
          }
        });
        
        // If the token set is now empty, remove it
        if (Object.keys(tokenSet).length === 0) {
          delete tokenStudio[key];
        }
      }
    }
  });

  // Update token set order after cleanup
  const finalTokenSetOrder = Object.keys(tokenStudio).filter(key => key !== '$themes' && key !== '$metadata');
  tokenStudio.$metadata.tokenSetOrder = finalTokenSetOrder;

  console.log('Token Studio structure created:', Object.keys(tokenStudio));
  console.log('Token set order:', tokenSetOrder);
  
  return tokenStudio;
}

// Listen for messages from the UI
figma.ui.onmessage = async (msg) => {
  if (msg.type === 'export-tokens') {
    try {
      console.log('Starting export-tokens...');
      const allVariables = await getAllVariables();
      console.log('Got variables:', Object.keys(allVariables));
      
      const selectedCollections = msg.selectedCollections || [];
      console.log('Selected collections:', selectedCollections);
      
      const filteredVariables = filterVariablesByCollections(allVariables, selectedCollections);
      console.log('Filtered variables:', Object.keys(filteredVariables));
      
      // Transform to Token Studio format
      console.log('Starting Token Studio transformation...');
      
      // Add timeout to prevent hanging
      const transformPromise = new Promise((resolve, reject) => {
        try {
          const result = transformToTokenStudio(filteredVariables);
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
      
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Token Studio transformation timed out after 10 seconds')), 10000);
      });
      
      const tokenStudioFormat = await Promise.race([transformPromise, timeoutPromise]);
      console.log('Token Studio transformation complete:', Object.keys(tokenStudioFormat as any));
      
      const jsonString = JSON.stringify(tokenStudioFormat, null, 2);
      console.log('JSON stringified, length:', jsonString.length);
      
      figma.ui.postMessage({ type: 'export-complete', jsonString });
      console.log('Message sent to UI');
    } catch (error) {
      console.error('Error in export-tokens:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      figma.ui.postMessage({ type: 'export-error', message: errorMessage });
      figma.notify('Error exporting tokens. See plugin console for details.', { error: true });
    }
  } else if (msg.type === 'export-style-dictionary') {
    try {
      const allVariables = await getAllVariables();
      const selectedCollections = msg.selectedCollections || [];
      const filteredVariables = filterVariablesByCollections(allVariables, selectedCollections);
      const platform = msg.platform || 'json';
      const output = await exportStyleDictionaryTokens(platform);
      figma.ui.postMessage({ 
        type: 'export-style-dictionary-complete', 
        output,
        platform,
        filename: getFilenameForPlatform(platform)
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      figma.ui.postMessage({ type: 'export-error', message: errorMessage });
      figma.notify('Error exporting Style Dictionary tokens. See plugin console for details.', { error: true });
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
  } else if (msg.type === 'get-colors') {
    try {
      const allVariables = await getAllVariables();
      const selectedCollections = msg.selectedCollections || [];
      const filteredVariables = filterVariablesByCollections(allVariables, selectedCollections);
      const colors = extractColors(filteredVariables);
      figma.ui.postMessage({ type: 'colors-loaded', colors });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      figma.ui.postMessage({ type: 'export-error', message: errorMessage });
      figma.notify('Error loading colors. See plugin console for details.', { error: true });
      console.error(error);
    }
  } else if (msg.type === 'export-colors') {
    try {
      const allVariables = await getAllVariables();
      const selectedCollections = msg.selectedCollections || [];
      const filteredVariables = filterVariablesByCollections(allVariables, selectedCollections);
      const colors = extractColors(filteredVariables);
      const colorPalette = generateColorPalette(colors);
      figma.ui.postMessage({ 
        type: 'export-colors-complete', 
        output: colorPalette,
        filename: 'color-palette.json'
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      figma.ui.postMessage({ type: 'export-error', message: errorMessage });
      figma.notify('Error exporting color palette. See plugin console for details.', { error: true });
      console.error(error);
    }
  } else if (msg.type === 'export-token-studio') {
    try {
      console.log('Starting Token Studio export...');
      const allVariables = await getAllVariables();
      console.log('All variables loaded:', Object.keys(allVariables));
      const selectedCollections = msg.selectedCollections || [];
      console.log('Selected collections:', selectedCollections);
      const filteredVariables = filterVariablesByCollections(allVariables, selectedCollections);
      console.log('Filtered variables:', Object.keys(filteredVariables));
      const tokenStudio = transformToTokenStudio(filteredVariables);
      console.log('Token Studio transformation complete:', Object.keys(tokenStudio));
      
      figma.ui.postMessage({
        type: 'export-token-studio-complete',
        output: JSON.stringify(tokenStudio, null, 2),
        filename: 'tokens-studio.json'
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      console.error('Token Studio export error:', error);
      figma.ui.postMessage({ type: 'export-error', message: errorMessage });
      figma.notify('Error exporting Token Studio format. See plugin console for details.', { error: true });
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
      console.log('Getting variables...');
      const variables = await getAllVariables();
      console.log('Variables retrieved, sending to UI:', variables);
      figma.ui.postMessage({ type: 'variables-loaded', variables });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      console.error('Error getting variables:', error);
      figma.ui.postMessage({ type: 'export-error', message: errorMessage });
    }
  } else if (msg.type === 'export-style-dictionary') {
    try {
      console.log('Starting Style Dictionary export...');
      const allVariables = await getAllVariables();
      const selectedCollections = msg.selectedCollections || [];
      const filteredVariables = filterVariablesByCollections(allVariables, selectedCollections);
      const platform = msg.platform || 'json';
      
      if (platform === 'all') {
        // Generate all platforms
        const platforms = ['css', 'scss', 'js', 'ts', 'ios', 'android', 'flutter', 'react-native'];
        const allOutputs: any = {};
        
        for (const p of platforms) {
          try {
            const output = await exportStyleDictionaryTokens(p);
            allOutputs[p] = output;
          } catch (err) {
            console.error(`Error generating ${p}:`, err);
            allOutputs[p] = `Error generating ${p}: ${err instanceof Error ? err.message : 'Unknown error'}`;
          }
        }
        
        figma.ui.postMessage({
          type: 'export-style-dictionary-complete',
          output: JSON.stringify(allOutputs, null, 2),
          platform: 'all',
          filename: 'all-platforms.json'
        });
      } else {
        // Generate single platform
        const output = await exportStyleDictionaryTokens(platform);
        figma.ui.postMessage({
          type: 'export-style-dictionary-complete',
          output: output,
          platform: platform,
          filename: getFilenameForPlatform(platform)
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      console.error('Style Dictionary export error:', error);
      figma.ui.postMessage({
        type: 'export-error',
        message: errorMessage
      });
      figma.notify('Error exporting Style Dictionary format. See plugin console for details.', { error: true });
    }
  }
};