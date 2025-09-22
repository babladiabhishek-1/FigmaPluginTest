const StyleDictionary = require('style-dictionary');

module.exports = {
  source: ['tokens/**/*.json'],
  platforms: {
    // CSS Custom Properties
    css: {
      transformGroup: 'css',
      buildPath: 'dist/css/',
      files: [{
        destination: 'variables.css',
        format: 'css/variables'
      }]
    },
    
    // SCSS Variables
    scss: {
      transformGroup: 'scss',
      buildPath: 'dist/scss/',
      files: [{
        destination: 'variables.scss',
        format: 'scss/variables'
      }]
    },
    
    // JavaScript/ES6
    js: {
      transformGroup: 'js',
      buildPath: 'dist/js/',
      files: [{
        destination: 'tokens.js',
        format: 'javascript/es6'
      }]
    },
    
    // TypeScript
    ts: {
      transformGroup: 'js',
      buildPath: 'dist/ts/',
      files: [{
        destination: 'tokens.ts',
        format: 'typescript/es6-declarations'
      }]
    },
    
    // iOS Swift
    ios: {
      transformGroup: 'ios',
      buildPath: 'dist/ios/',
      files: [{
        destination: 'DesignTokens.swift',
        format: 'ios/swift/class.swift'
      }]
    },
    
    // Android Kotlin
    android: {
      transformGroup: 'android',
      buildPath: 'dist/android/',
      files: [{
        destination: 'DesignTokens.kt',
        format: 'android/colors'
      }, {
        destination: 'DesignTokensDimens.kt',
        format: 'android/dimens'
      }]
    },
    
    // Flutter Dart
    flutter: {
      transformGroup: 'flutter',
      buildPath: 'dist/flutter/',
      files: [{
        destination: 'design_tokens.dart',
        format: 'flutter/class.dart'
      }]
    },
    
    // React Native
    reactNative: {
      transformGroup: 'react-native',
      buildPath: 'dist/react-native/',
      files: [{
        destination: 'DesignTokens.js',
        format: 'javascript/module'
      }]
    },
    
    // JSON (for general use)
    json: {
      transformGroup: 'js',
      buildPath: 'dist/json/',
      files: [{
        destination: 'tokens.json',
        format: 'json/flat'
      }]
    }
  }
};
