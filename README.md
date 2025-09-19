# Design Token Exporter - Figma Plugin

A Figma plugin that exports design tokens from your Figma variables and styles into a structured JSON format.

## Features

- **Figma Variables Support**: Exports modern Figma variables with proper nesting and mode support
- **Legacy Styles Support**: Also exports paint styles and text styles for backward compatibility
- **Token Format**: Outputs tokens in a standardized format with `$type`, `$value`, and `$description` properties
- **Mode Support**: Handles different variable modes (e.g., Light/Dark themes)
- **Alias Resolution**: Properly handles variable aliases and references

## Setup & Installation

### Prerequisites
- Node.js (version 14 or higher)
- Figma Desktop App

### Development Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Build the plugin:**
   ```bash
   npm run build
   ```

3. **For development with auto-rebuild:**
   ```bash
   npm run watch
   ```

### Installing in Figma

1. Open Figma Desktop App
2. Go to **Plugins** → **Development** → **Import plugin from manifest...**
3. Select the `manifest.json` file from this directory
4. The plugin will appear in your plugins list

## Usage

1. Open a Figma file with design variables or styles
2. Run the plugin from **Plugins** → **Design Token Exporter**
3. Click **"Export Tokens"** to extract all tokens
4. Copy the generated JSON using the **"Copy to Clipboard"** button

## Token Structure

The plugin exports tokens in this format:

```json
{
  "Semantic Colors": {
    "Light": {
      "primary": {
        "$type": "color",
        "$value": "#007aff",
        "$description": "Primary brand color"
      }
    }
  },
  "Typography": {
    "H1": {
      "$type": "number",
      "$value": 32,
      "$description": "Heading 1 font size"
    }
  }
}
```

## Supported Token Types

- **Colors**: From Figma variables and paint styles
- **Numbers**: Font sizes, line heights, spacing values
- **Text**: String values from text variables
- **Booleans**: Boolean variable values

## Development

### File Structure
- `code.ts` - Main plugin logic (TypeScript)
- `code.js` - Compiled JavaScript (generated)
- `ui.html` - Plugin UI interface
- `manifest.json` - Plugin configuration
- `package.json` - Dependencies and scripts
- `tsconfig.json` - TypeScript configuration

### Building
The TypeScript code needs to be compiled to JavaScript before the plugin can run in Figma. Use:

```bash
npm run build    # One-time build
npm run watch    # Watch mode for development
```

### Adding New Features
1. Modify `code.ts` for plugin logic
2. Update `ui.html` for UI changes
3. Run `npm run build` to compile
4. Test in Figma

## Troubleshooting

- **Plugin not loading**: Make sure `code.js` exists (run `npm run build`)
- **TypeScript errors**: Check that all dependencies are installed with `npm install`
- **Export issues**: Check the Figma console for error messages

## License

MIT


