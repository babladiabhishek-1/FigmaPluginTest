// NextGen Export - Clean Figma Plugin
// Simple collections and export functionality
// Show the plugin UI
figma.showUI(__html__, { width: 800, height: 600 });
// Simple color conversion utility
function rgbaToHex(r, g, b, a) {
    const toHex = (n) => Math.round(n * 255).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}${a < 1 ? toHex(a) : ''}`;
}
// Resolve variable alias recursively to get actual value
function resolveVariableAlias(variableId, modeId, variablesById, depth = 0) {
    var _a;
    if (depth > 10) {
        console.warn(`Max resolution depth reached for variable ${variableId}`);
        return null;
    }
    const variable = variablesById.get(variableId);
    if (!variable) {
        console.warn(`Variable not found: ${variableId}`);
        return null;
    }
    const value = (_a = variable.valuesByMode) === null || _a === void 0 ? void 0 : _a[modeId];
    if (!value) {
        console.warn(`No value found for variable ${variable.name} (${variableId}) in mode ${modeId}`);
        return null;
    }
    console.log(`RESOLVING: ${variable.name} (depth: ${depth})`, {
        value,
        valueType: typeof value,
        hasType: typeof value === 'object' && value !== null ? 'type' in value : false
    });
    // If it's an alias, resolve it recursively
    if (typeof value === 'object' && value !== null) {
        const valueAny = value;
        if (valueAny.type === 'VARIABLE_ALIAS' && valueAny.id) {
            console.log(`RESOLVING ALIAS CHAIN: ${variable.name} -> ${valueAny.id} (depth: ${depth})`);
            return resolveVariableAlias(valueAny.id, modeId, variablesById, depth + 1);
        }
        else {
            // Return the actual value (COLOR, FLOAT, STRING, BOOLEAN)
            console.log(`FOUND FINAL VALUE: ${variable.name} -> ${valueAny.type}`, valueAny);
            return valueAny;
        }
    }
    console.log(`FOUND PRIMITIVE VALUE: ${variable.name} -> ${typeof value}`, value);
    return value;
}
// Get all variables and collections
async function getAllVariables() {
    var _a;
    try {
        console.log('Getting Figma variables and collections...');
        const variables = await figma.variables.getLocalVariablesAsync();
        const variableCollections = await figma.variables.getLocalVariableCollectionsAsync();
        console.log(`Found ${variableCollections.length} collections and ${variables.length} variables`);
        // Build variables by ID map for alias resolution
        const variablesById = new Map(variables.map(v => [v.id, v]));
        // Build simple categorized structure
        const categorizedVariables = {};
        for (const collection of variableCollections) {
            const collectionName = collection.name;
            const varsInCollection = variables.filter(v => v.variableCollectionId === collection.id);
            console.log(`Processing collection: ${collectionName} with ${varsInCollection.length} variables`);
            for (const mode of collection.modes) {
                const modeName = mode.name;
                const setKey = `${collectionName}/${modeName}`;
                categorizedVariables[setKey] = [];
                for (const variable of varsInCollection) {
                    const value = (_a = variable.valuesByMode) === null || _a === void 0 ? void 0 : _a[mode.modeId];
                    if (value) {
                        let finalValue = 'No value';
                        let finalType = 'unknown';
                        // Debug logging for palette colors
                        if (variable.name.toLowerCase().includes('palette') || variable.name.toLowerCase().includes('fuchsia') || variable.name.toLowerCase().includes('greyscale')) {
                            console.log(`DEBUG PALETTE: ${variable.name}`, {
                                value,
                                valueType: typeof value,
                                resolvedType: variable.resolvedType,
                                hasType: typeof value === 'object' && value !== null ? 'type' in value : false,
                                hasValue: typeof value === 'object' && value !== null ? 'value' in value : false
                            });
                        }
                        // Handle different value types - resolve aliases recursively
                        if (typeof value === 'object' && value !== null) {
                            const valueAny = value;
                            if (valueAny.type === 'VARIABLE_ALIAS' && valueAny.id) {
                                // Resolve the alias chain to get the actual value
                                console.log(`RESOLVING ALIAS: ${variable.name} -> ${valueAny.id}`);
                                const resolvedValue = resolveVariableAlias(valueAny.id, mode.modeId, variablesById);
                                if (resolvedValue && typeof resolvedValue === 'object' && resolvedValue !== null) {
                                    const resolvedAny = resolvedValue;
                                    if (resolvedAny.type === 'COLOR' && resolvedAny.value) {
                                        const { r, g, b, a } = resolvedAny.value;
                                        finalValue = rgbaToHex(r, g, b, a);
                                        finalType = 'color';
                                        console.log(`ALIAS RESOLVED: ${variable.name} -> ${finalValue}`);
                                    }
                                    else if (resolvedAny.type === 'FLOAT' && typeof resolvedAny.value === 'number') {
                                        finalValue = resolvedAny.value.toString();
                                        finalType = 'number';
                                    }
                                    else if (resolvedAny.type === 'STRING' && typeof resolvedAny.value === 'string') {
                                        finalValue = resolvedAny.value;
                                        finalType = 'string';
                                    }
                                    else if (resolvedAny.type === 'BOOLEAN' && typeof resolvedAny.value === 'boolean') {
                                        finalValue = resolvedAny.value.toString();
                                        finalType = 'boolean';
                                    }
                                    else {
                                        finalValue = `{${valueAny.id}}`;
                                        finalType = 'alias';
                                        console.log(`ALIAS NOT RESOLVED: ${variable.name} -> ${resolvedAny.type}`);
                                    }
                                }
                                else {
                                    finalValue = `{${valueAny.id}}`;
                                    finalType = 'alias';
                                    console.log(`ALIAS RESOLUTION FAILED: ${variable.name} -> ${valueAny.id}`);
                                }
                            }
                            else if (valueAny.type === 'COLOR' && valueAny.value) {
                                const { r, g, b, a } = valueAny.value;
                                finalValue = rgbaToHex(r, g, b, a);
                                finalType = 'color';
                                console.log(`DIRECT COLOR: ${variable.name} -> ${finalValue}`);
                            }
                            else if (valueAny.type === 'FLOAT' && typeof valueAny.value === 'number') {
                                finalValue = valueAny.value.toString();
                                finalType = 'number';
                            }
                            else if (valueAny.type === 'STRING' && typeof valueAny.value === 'string') {
                                finalValue = valueAny.value;
                                finalType = 'string';
                            }
                            else if (valueAny.type === 'BOOLEAN' && typeof valueAny.value === 'boolean') {
                                finalValue = valueAny.value.toString();
                                finalType = 'boolean';
                            }
                            else {
                                console.log(`UNKNOWN OBJECT TYPE for ${variable.name}:`, {
                                    type: valueAny.type,
                                    value: valueAny.value,
                                    keys: Object.keys(valueAny)
                                });
                            }
                        }
                        else if (typeof value === 'number') {
                            finalValue = value.toString();
                            finalType = 'number';
                        }
                        else if (typeof value === 'string') {
                            finalValue = value;
                            finalType = 'string';
                        }
                        else if (typeof value === 'boolean') {
                            finalValue = value.toString();
                            finalType = 'boolean';
                        }
                        else {
                            console.log(`UNKNOWN PRIMITIVE TYPE for ${variable.name}:`, {
                                value,
                                type: typeof value
                            });
                        }
                        const variableData = {
                            id: variable.id,
                            name: variable.name,
                            type: finalType,
                            value: finalValue,
                            collection: collectionName,
                            mode: modeName,
                            description: variable.description || ''
                        };
                        categorizedVariables[setKey].push(variableData);
                    }
                }
                console.log(`Collection ${setKey} has ${categorizedVariables[setKey].length} variables`);
            }
        }
        console.log('Returning categorized variables:', Object.keys(categorizedVariables));
        return categorizedVariables;
    }
    catch (error) {
        console.error('Error getting variables:', error);
        return {};
    }
}
// Handle messages from UI
figma.ui.onmessage = async (msg) => {
    console.log('Received message:', msg.type);
    if (msg.type === 'get-variables') {
        try {
            const variables = await getAllVariables();
            figma.ui.postMessage({ type: 'variables-loaded', variables });
        }
        catch (error) {
            console.error('Error getting variables:', error);
            figma.ui.postMessage({ type: 'export-error', message: 'Failed to load variables' });
        }
    }
    if (msg.type === 'export-tokens') {
        try {
            const variables = await getAllVariables();
            figma.ui.postMessage({ type: 'export-complete', jsonString: JSON.stringify(variables, null, 2) });
        }
        catch (error) {
            console.error('Error exporting tokens:', error);
            figma.ui.postMessage({ type: 'export-error', message: 'Failed to export tokens' });
        }
    }
};
