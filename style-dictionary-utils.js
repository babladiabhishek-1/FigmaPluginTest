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
// Generate Style Dictionary output for a specific platform
async function generateStyleDictionaryOutput(tokens, platform) {
    // @ts-ignore - Style Dictionary is loaded at runtime
    const StyleDictionary = require('style-dictionary');
    // Transform tokens to Style Dictionary format
    const sdTokens = transformToStyleDictionary(tokens);
    // Create a temporary config for the specific platform
    const config = {
        source: [],
        platforms: {
            [platform]: {
                transformGroup: getTransformGroup(platform),
                buildPath: 'temp/',
                files: [{
                        destination: 'output',
                        format: getFormat(platform)
                    }]
            }
        }
    };
    // Register the tokens as a source
    StyleDictionary.registerSource({
        name: 'figma-tokens',
        tokens: sdTokens
    });
    // Build for the specific platform
    const builder = StyleDictionary.extend(config);
    const result = await builder.buildPlatform(platform);
    return result.files[0].contents;
}
// Get the appropriate transform group for a platform
function getTransformGroup(platform) {
    const transformGroups = {
        'css': 'css',
        'scss': 'scss',
        'js': 'js',
        'ts': 'js',
        'ios': 'ios',
        'android': 'android',
        'flutter': 'flutter',
        'react-native': 'react-native',
        'json': 'js'
    };
    return transformGroups[platform] || 'js';
}
// Get the appropriate format for a platform
function getFormat(platform) {
    const formats = {
        'css': 'css/variables',
        'scss': 'scss/variables',
        'js': 'javascript/es6',
        'ts': 'typescript/es6-declarations',
        'ios': 'ios/swift/class.swift',
        'android': 'android/colors',
        'flutter': 'flutter/class.dart',
        'react-native': 'javascript/module',
        'json': 'json/flat'
    };
    return formats[platform] || 'json/flat';
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
