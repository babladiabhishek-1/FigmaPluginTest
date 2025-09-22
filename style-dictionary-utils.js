"use strict";
// Style Dictionary integration utilities
Object.defineProperty(exports, "__esModule", { value: true });
exports.AVAILABLE_PLATFORMS = void 0;
exports.transformToStyleDictionary = transformToStyleDictionary;
exports.generateStyleDictionaryOutput = generateStyleDictionaryOutput;
// Transform tokens to Style Dictionary format
function transformToStyleDictionary(tokens) {
    const sdTokens = {};
    Object.entries(tokens).forEach(([collectionName, variables]) => {
        // Convert collection name to Style Dictionary format
        const categoryName = collectionName.toLowerCase().replace(/[^a-zA-Z0-9]/g, '');
        sdTokens[categoryName] = {};
        variables.forEach((variable) => {
            // Convert variable name to Style Dictionary format
            const tokenName = variable.name
                .toLowerCase()
                .replace(/[^a-zA-Z0-9]/g, '-')
                .replace(/-+/g, '-')
                .replace(/^-|-$/g, '');
            // Map Figma types to Style Dictionary types
            let sdType = 'other';
            switch (variable.type) {
                case 'COLOR':
                    sdType = 'color';
                    break;
                case 'FLOAT':
                    sdType = 'dimension';
                    break;
                case 'STRING':
                    sdType = 'string';
                    break;
                case 'BOOLEAN':
                    sdType = 'boolean';
                    break;
                default:
                    sdType = 'other';
            }
            sdTokens[categoryName][tokenName] = {
                value: variable.value,
                type: sdType,
                description: variable.description || ''
            };
        });
    });
    return sdTokens;
}
// Generate platform-specific output without Style Dictionary
async function generateStyleDictionaryOutput(tokens, platform) {
    // Transform tokens to Style Dictionary format
    const sdTokens = transformToStyleDictionary(tokens);
    // Generate platform-specific output
    switch (platform) {
        case 'css':
            return generateCSSOutput(sdTokens);
        case 'scss':
            return generateSCSSOutput(sdTokens);
        case 'js':
            return generateJSOutput(sdTokens);
        case 'ts':
            return generateTSOutput(sdTokens);
        case 'ios':
            return generateiOSOutput(sdTokens);
        case 'android':
            return generateAndroidOutput(sdTokens);
        case 'flutter':
            return generateFlutterOutput(sdTokens);
        case 'react-native':
            return generateReactNativeOutput(sdTokens);
        case 'json':
            return generateJSONOutput(sdTokens);
        default:
            return generateJSONOutput(sdTokens);
    }
}
// CSS Custom Properties generator
function generateCSSOutput(tokens) {
    let output = ':root {\n';
    Object.entries(tokens).forEach(([category, categoryTokens]) => {
        Object.entries(categoryTokens).forEach(([tokenName, token]) => {
            const cssVarName = `--${category}-${tokenName}`;
            output += `  ${cssVarName}: ${token.value};\n`;
        });
    });
    output += '}\n';
    return output;
}
// SCSS Variables generator
function generateSCSSOutput(tokens) {
    let output = '';
    Object.entries(tokens).forEach(([category, categoryTokens]) => {
        output += `// ${category}\n`;
        Object.entries(categoryTokens).forEach(([tokenName, token]) => {
            const scssVarName = `$${category}-${tokenName}`;
            output += `${scssVarName}: ${token.value};\n`;
        });
        output += '\n';
    });
    return output;
}
// JavaScript/ES6 generator
function generateJSOutput(tokens) {
    let output = 'export const designTokens = {\n';
    Object.entries(tokens).forEach(([category, categoryTokens]) => {
        output += `  ${category}: {\n`;
        Object.entries(categoryTokens).forEach(([tokenName, token]) => {
            output += `    ${tokenName}: '${token.value}',\n`;
        });
        output += '  },\n';
    });
    output += '};\n';
    return output;
}
// TypeScript generator
function generateTSOutput(tokens) {
    let output = 'export interface DesignTokens {\n';
    Object.entries(tokens).forEach(([category, categoryTokens]) => {
        output += `  ${category}: {\n`;
        Object.entries(categoryTokens).forEach(([tokenName, token]) => {
            output += `    ${tokenName}: string;\n`;
        });
        output += '  };\n';
    });
    output += '}\n\n';
    output += 'export const designTokens: DesignTokens = {\n';
    Object.entries(tokens).forEach(([category, categoryTokens]) => {
        output += `  ${category}: {\n`;
        Object.entries(categoryTokens).forEach(([tokenName, token]) => {
            output += `    ${tokenName}: '${token.value}',\n`;
        });
        output += '  },\n';
    });
    output += '};\n';
    return output;
}
// iOS Swift generator
function generateiOSOutput(tokens) {
    let output = 'import UIKit\n\n';
    output += 'class DesignTokens {\n';
    output += '  static let shared = DesignTokens()\n';
    output += '  private init() {}\n\n';
    Object.entries(tokens).forEach(([category, categoryTokens]) => {
        output += `  // MARK: - ${category}\n`;
        Object.entries(categoryTokens).forEach(([tokenName, token]) => {
            if (token.type === 'color') {
                const color = parseColor(token.value);
                output += `  static let ${tokenName} = UIColor(red: ${color.r}, green: ${color.g}, blue: ${color.b}, alpha: ${color.a})\n`;
            }
            else {
                output += `  static let ${tokenName} = "${token.value}"\n`;
            }
        });
        output += '\n';
    });
    output += '}\n';
    return output;
}
// Android Kotlin generator
function generateAndroidOutput(tokens) {
    let output = 'package com.example.designsystem\n\n';
    output += 'import androidx.compose.ui.graphics.Color\n\n';
    output += 'object DesignTokens {\n';
    Object.entries(tokens).forEach(([category, categoryTokens]) => {
        output += `    // ${category}\n`;
        Object.entries(categoryTokens).forEach(([tokenName, token]) => {
            if (token.type === 'color') {
                const color = parseColor(token.value);
                output += `    val ${tokenName} = Color(0x${color.hex})\n`;
            }
            else {
                output += `    val ${tokenName} = "${token.value}"\n`;
            }
        });
        output += '\n';
    });
    output += '}\n';
    return output;
}
// Flutter Dart generator
function generateFlutterOutput(tokens) {
    let output = 'import \'package:flutter/material.dart\';\n\n';
    output += 'class DesignTokens {\n';
    output += '  static const DesignTokens _instance = DesignTokens._();\n';
    output += '  factory DesignTokens() => _instance;\n';
    output += '  const DesignTokens._();\n\n';
    Object.entries(tokens).forEach(([category, categoryTokens]) => {
        output += `  // ${category}\n`;
        Object.entries(categoryTokens).forEach(([tokenName, token]) => {
            if (token.type === 'color') {
                const color = parseColor(token.value);
                output += `  static const Color ${tokenName} = Color(0x${color.hex});\n`;
            }
            else {
                output += `  static const String ${tokenName} = '${token.value}';\n`;
            }
        });
        output += '\n';
    });
    output += '}\n';
    return output;
}
// React Native generator
function generateReactNativeOutput(tokens) {
    let output = 'const designTokens = {\n';
    Object.entries(tokens).forEach(([category, categoryTokens]) => {
        output += `  ${category}: {\n`;
        Object.entries(categoryTokens).forEach(([tokenName, token]) => {
            output += `    ${tokenName}: '${token.value}',\n`;
        });
        output += '  },\n';
    });
    output += '};\n\n';
    output += 'export default designTokens;\n';
    return output;
}
// JSON generator
function generateJSONOutput(tokens) {
    return JSON.stringify(tokens, null, 2);
}
// Helper function to parse color values
function parseColor(colorValue) {
    // Handle hex colors
    if (colorValue.startsWith('#')) {
        const hex = colorValue.replace('#', '');
        const r = parseInt(hex.substr(0, 2), 16) / 255;
        const g = parseInt(hex.substr(2, 2), 16) / 255;
        const b = parseInt(hex.substr(4, 2), 16) / 255;
        const a = hex.length === 8 ? parseInt(hex.substr(6, 2), 16) / 255 : 1;
        return { r, g, b, a, hex: hex.toUpperCase() };
    }
    // Handle rgb/rgba colors
    if (colorValue.startsWith('rgb')) {
        const values = colorValue.match(/\d+/g);
        if (values && values.length >= 3) {
            const r = parseInt(values[0]) / 255;
            const g = parseInt(values[1]) / 255;
            const b = parseInt(values[2]) / 255;
            const a = values[3] ? parseInt(values[3]) / 255 : 1;
            const hex = ((Math.round(r * 255) << 24) | (Math.round(g * 255) << 16) | (Math.round(b * 255) << 8) | Math.round(a * 255)).toString(16).toUpperCase().padStart(8, '0');
            return { r, g, b, a, hex };
        }
    }
    // Default fallback
    return { r: 0, g: 0, b: 0, a: 1, hex: 'FF000000' };
}
// Available platforms
exports.AVAILABLE_PLATFORMS = [
    { id: 'css', name: 'CSS Custom Properties', description: 'CSS variables for web' },
    { id: 'scss', name: 'SCSS Variables', description: 'SCSS variables for web' },
    { id: 'js', name: 'JavaScript/ES6', description: 'ES6 module for web' },
    { id: 'ts', name: 'TypeScript', description: 'TypeScript definitions' },
    { id: 'ios', name: 'iOS Swift', description: 'Swift class for iOS' },
    { id: 'android', name: 'Android Kotlin', description: 'Kotlin class for Android' },
    { id: 'flutter', name: 'Flutter Dart', description: 'Dart class for Flutter' },
    { id: 'react-native', name: 'React Native', description: 'JavaScript module for React Native' },
    { id: 'json', name: 'JSON', description: 'Plain JSON format' }
];
