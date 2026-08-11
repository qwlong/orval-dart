/**
 * Generate Dart model files using Freezed
 */

import { OpenAPIObject } from '../types';
import { DartGeneratorOptions, GeneratedFile } from '../types';
import { ModelGenerator } from './model-generator';
import { OpenAPIParser } from '../parser/openapi-parser';
import { ReferenceResolver } from '../resolvers';
import { combineSchemas } from '../getters/combine';
import { getObject } from '../getters/object';
import { hasComposition, hasDiscriminatedUnion, isEnum, isEmpty } from '../utils/assertion';
import { TypeMapper } from '../utils';

// Helper functions
// Use TypeMapper.toSnakeCase for consistent V2Meta/V2Dto handling
const toSnakeCase = (str: string): string => TypeMapper.toSnakeCase(str);

function extractDiscriminatorInfo(schema: any): any {
  if (!schema.properties) return null;

  let discriminatorProperty: string | undefined;
  let unionProperty: string | undefined;
  let discriminatorValues: string[] | undefined;
  let unionSchemas: any[] | undefined;
  let compositionType: 'oneOf' | 'anyOf' = 'oneOf';

  for (const [propName, propSchema] of Object.entries(schema.properties)) {
    const prop = propSchema as any;
    
    if (prop.enum && Array.isArray(prop.enum)) {
      discriminatorProperty = propName;
      discriminatorValues = prop.enum;
    }
    
    if (prop.oneOf) {
      unionProperty = propName;
      unionSchemas = prop.oneOf;
      compositionType = 'oneOf';
    } else if (prop.anyOf) {
      unionProperty = propName;
      unionSchemas = prop.anyOf;
      compositionType = 'anyOf';
    }
  }

  if (discriminatorProperty && unionProperty && unionSchemas) {
    return {
      propertyName: discriminatorProperty,
      discriminatorProperty,
      values: discriminatorValues,
      unionProperty,
      unionSchemas,
      compositionType
    };
  }

  return null;
}


/**
 * Extract and generate nested classes for inline object properties
 */
function extractInlineObjects(
  parentName: string,
  schema: any,
  schemas: Record<string, any>,
  files: GeneratedFile[],
  refResolver: ReferenceResolver,
  processedTypes: Set<string> = new Set()
): Map<string, string> {
  const inlineTypes = new Map<string, string>();
  
  if (!schema.properties || processedTypes.has(parentName)) return inlineTypes;
  processedTypes.add(parentName);
  
  Object.entries(schema.properties).forEach(([propName, propSchema]: [string, any]) => {
    // Check if this is an inline object (has properties but no $ref)
    if (propSchema.type === 'object' && propSchema.properties && !propSchema.$ref) {
      // Generate a name for the nested type
      const nestedTypeName = `${parentName}${propName.charAt(0).toUpperCase()}${propName.slice(1)}`;
      
      // Add to schemas so it gets processed
      schemas[nestedTypeName] = propSchema;
      
      // Map the property name to the nested type name
      inlineTypes.set(propName, nestedTypeName);
      
      // Recursively extract nested inline objects
      extractInlineObjects(nestedTypeName, propSchema, schemas, files, refResolver, processedTypes);
    }
  });
  
  return inlineTypes;
}

/**
 * Extract and generate enum types for inline enum properties
 */
function extractInlineEnums(
  parentName: string,
  schema: any,
  schemas: Record<string, any>,
  processedEnums: Set<string> = new Set()
): Map<string, string> {
  const inlineEnums = new Map<string, string>();

  if (processedEnums.has(parentName)) return inlineEnums;
  processedEnums.add(parentName);

  // Handle allOf composition
  if (schema.allOf && Array.isArray(schema.allOf)) {
    schema.allOf.forEach((subSchema: any) => {
      if (subSchema.properties) {
        Object.entries(subSchema.properties).forEach(([propName, propSchema]: [string, any]) => {
          // Check if this is an inline enum (has enum array but no $ref)
          if (propSchema.enum && Array.isArray(propSchema.enum) && !propSchema.$ref) {
            // Generate a name for the enum type
            const enumTypeName = `${parentName}${propName.charAt(0).toUpperCase()}${propName.slice(1)}Enum`;

            // Add to schemas as an enum schema
            schemas[enumTypeName] = {
              type: 'string',
              enum: propSchema.enum,
              description: propSchema.description || `Enum for ${propName}`
            };

            // Map the property name to the enum type name
            inlineEnums.set(propName, enumTypeName);
          }
        });
      }
    });
  }

  // Handle direct properties
  if (schema.properties) {
    Object.entries(schema.properties).forEach(([propName, propSchema]: [string, any]) => {
      // Check if this is an inline enum (has enum array but no $ref)
      if (propSchema.enum && Array.isArray(propSchema.enum) && !propSchema.$ref) {
        // Generate a name for the enum type
        const enumTypeName = `${parentName}${propName.charAt(0).toUpperCase()}${propName.slice(1)}Enum`;

        // Add to schemas as an enum schema
        schemas[enumTypeName] = {
          type: 'string',
          enum: propSchema.enum,
          description: propSchema.description || `Enum for ${propName}`
        };

        // Map the property name to the enum type name
        inlineEnums.set(propName, enumTypeName);
      }
    });
  }

  return inlineEnums;
}

/**
 * Extract inline enums from path parameters (query, header, path, etc.)
 */
function extractParameterInlineEnums(
  spec: OpenAPIObject,
  schemas: Record<string, any>
): void {
  if (!spec.paths) return;

  Object.entries(spec.paths).forEach(([pathKey, pathItem]) => {
    if (!pathItem) return;

    // Process path-level parameters
    if (pathItem.parameters) {
      processParametersForEnums(pathItem.parameters, pathKey, schemas);
    }

    // Process operation-level parameters
    const operations = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'trace'];
    operations.forEach(method => {
      const operation = (pathItem as any)[method];
      if (operation && operation.parameters) {
        processParametersForEnums(operation.parameters, `${pathKey}_${method}`, schemas);
      }
    });
  });
}

/**
 * Process a list of parameters and extract inline enums
 *
 * Always generates context-specific enum names to avoid conflicts
 * Format: {Method}{PathContext}{ParamName}Enum
 * Example: GetV1LaborTargetsTypeEnum (for GET /v1/labor-targets with type parameter)
 */
function processParametersForEnums(
  parameters: any[],
  contextName: string,
  schemas: Record<string, any>
): void {
  parameters.forEach((param) => {
    // Skip references - they should already be in components/parameters
    if ('$ref' in param) return;

    const paramObj = param as any;
    if (!paramObj.schema) return;

    const schema = paramObj.schema;

    // Generate unique enum name for this parameter
    const contextParts = contextName.split('_');
    const method = contextParts.pop() || ''; // Extract method (last part)
    const pathContext = contextParts
      .join('_')
      .split('/')
      .filter(p => p)
      .join('_')
      .replace(/-/g, '_');

    const methodPrefix = TypeMapper.toDartClassName(method);
    const pathPart = TypeMapper.toDartClassName(pathContext);
    const paramName = TypeMapper.toDartClassName(paramObj.name);

    // Format: {Method}{PathContext}{ParamName}Enum
    const uniqueEnumTypeName = `${methodPrefix}${pathPart}${paramName}Enum`;

    // Check if this parameter has an inline enum (not a reference)
    if (schema.enum && Array.isArray(schema.enum) && !('$ref' in schema)) {
      // Check if this exact enum already exists
      if (schemas[uniqueEnumTypeName]) {
        const existing = schemas[uniqueEnumTypeName];
        if (JSON.stringify(existing.enum) === JSON.stringify(schema.enum)) {
          // Exact same enum already exists, skip
          return;
        }
        // Different enum values but same name+context - this shouldn't happen
        // but if it does, log a warning
        console.warn(`Enum name conflict: ${uniqueEnumTypeName} with different values`);
        return;
      }

      // Add to schemas with context-specific name
      schemas[uniqueEnumTypeName] = {
        type: schema.type || 'string',
        enum: schema.enum,
        description: paramObj.description || `Enum for ${paramObj.name} parameter`
      };
    }

    // Check if this parameter is an array with enum items
    // Example: { type: 'array', items: { type: 'string', enum: ['started', 'ended'] } }
    if (schema.type === 'array' && schema.items &&
        schema.items.enum && Array.isArray(schema.items.enum) &&
        !('$ref' in schema.items)) {
      // Check if this exact enum already exists
      if (schemas[uniqueEnumTypeName]) {
        const existing = schemas[uniqueEnumTypeName];
        if (JSON.stringify(existing.enum) === JSON.stringify(schema.items.enum)) {
          // Exact same enum already exists, skip
          return;
        }
        // Different enum values but same name+context - this shouldn't happen
        // but if it does, log a warning
        console.warn(`Enum name conflict: ${uniqueEnumTypeName} with different values`);
        return;
      }

      // Add to schemas with context-specific name (for the items enum)
      schemas[uniqueEnumTypeName] = {
        type: schema.items.type || 'string',
        enum: schema.items.enum,
        description: paramObj.description || `Enum for ${paramObj.name} parameter items`
      };
    }
  });
}

export async function generateModels(
  spec: OpenAPIObject,
  _options: DartGeneratorOptions
): Promise<GeneratedFile[]> {
  const files: GeneratedFile[] = [];
  const generator = new ModelGenerator();
  
  // Parse spec to get schemas - don't dereference yet to preserve $refs
  const parser = new OpenAPIParser();
  await parser.parseWithoutDereference(spec);
  const schemas = parser.getSchemas();
  
  // Create ReferenceResolver with the full spec
  const refResolver = new ReferenceResolver(spec);
  generator.setReferenceResolver(refResolver);

  // Extract inline enums from path parameters BEFORE processing schemas
  // This ensures parameter enums are added to schemas and processed like any other enum
  extractParameterInlineEnums(spec, schemas);

  // First pass: extract inline objects and enums and add them as schemas
  const inlineObjectMappings = new Map<string, Map<string, string>>();
  const inlineEnumMappings = new Map<string, Map<string, string>>();
  const schemasToProcess = [...Object.entries(schemas)];
  const processedSchemas = new Set<string>();
  const processedEnums = new Set<string>();
  
  // Keep processing until no new schemas are added
  while (schemasToProcess.length > 0) {
    const [name, schema] = schemasToProcess.shift()!;
    if (processedSchemas.has(name)) continue;
    processedSchemas.add(name);
    
    // Extract inline objects
    const inlineTypes = extractInlineObjects(name, schema, schemas, files, refResolver);
    if (inlineTypes.size > 0) {
      inlineObjectMappings.set(name, inlineTypes);
      // Add newly created schemas to the processing queue
      inlineTypes.forEach((typeName) => {
        if (schemas[typeName] && !processedSchemas.has(typeName)) {
          schemasToProcess.push([typeName, schemas[typeName]]);
        }
      });
    }
    
    // Extract inline enums
    const inlineEnums = extractInlineEnums(name, schema, schemas, processedEnums);
    if (inlineEnums.size > 0) {
      inlineEnumMappings.set(name, inlineEnums);
      // Add newly created enum schemas to the processing queue
      inlineEnums.forEach((enumName) => {
        if (schemas[enumName] && !processedSchemas.has(enumName)) {
          schemasToProcess.push([enumName, schemas[enumName]]);
        }
      });
    }
  }
  
  // Generate model for each schema
  Object.entries(schemas).forEach(([name, schema]) => {
    // Skip completely empty schemas (no type, no properties, no composition)
    if (isEmpty(schema)) {
      console.log(`Skipping empty model: ${name}`);
      return;
    }

    // Note: Empty objects (type: "object" with no properties) are now handled by ModelGenerator
    // which generates typedef = Map<String, dynamic> for them

    // Check if it's an enum
    if (isEnum(schema)) {
      const enumFile = generator.generateEnum(
        name,
        schema.enum as (string | number | null)[],
        schema.description
      );
      files.push(enumFile);
      return;
    }

    // Skip root-level array types
    if (schema.type === 'array') {
      // These should be handled as List<Model> in the usage context
      return;
    }

    // Check for discriminated union pattern (property with enum + property with oneOf/anyOf)
    if (hasDiscriminatedUnion(schema)) {
      // Extract discriminator info
      const discriminatorInfo = extractDiscriminatorInfo(schema);
      if (discriminatorInfo) {
        const result = combineSchemas(
          { [discriminatorInfo.compositionType]: discriminatorInfo.unionSchemas },
          name,
          discriminatorInfo.compositionType,
          { discriminator: discriminatorInfo }
        );
        
        if (result.definition) {
          files.push({
            path: `models/${toSnakeCase(name)}.f.dart`,
            content: result.definition
          });
          return;
        }
      }
    }

    // Check for top-level composition (oneOf/anyOf/allOf)
    if (hasComposition(schema)) {
      const compositionType = schema.allOf ? 'allOf' : schema.oneOf ? 'oneOf' : 'anyOf';
      const result = combineSchemas(schema, name, compositionType, { schemas, refResolver });
      
      if (result.definition) {
        files.push({
          path: `models/${toSnakeCase(name)}.f.dart`,
          content: result.definition
        });
        return;
      }
    }

    // Handle regular object schemas (including empty objects)
    // First check if it's an empty object - ModelGenerator will handle it
    const isEmptyObject = schema.type === 'object' &&
                         (!schema.properties || Object.keys(schema.properties).length === 0) &&
                         !schema.allOf && !schema.oneOf && !schema.anyOf;

    if (isEmptyObject) {
      // Empty object - let ModelGenerator create a typedef
      const file = generator.generateModel(name, schema);
      files.push(file);
    } else {
      // Regular object with properties
      const inlineTypes = inlineObjectMappings.get(name);
      const inlineEnums = inlineEnumMappings.get(name);
      const objectResult = getObject(schema, name, { schemas, refResolver, inlineTypes, inlineEnums });
      if (objectResult.definition) {
        files.push({
          path: `models/${toSnakeCase(name)}.f.dart`,
          content: objectResult.definition
        });
      }
    }
  });
  
  // Generate index file that exports all models
  const indexContent = generateIndexFile(files);
  files.push({
    path: 'models/index.dart',
    content: indexContent
  });
  
  return files;
}

/**
 * Generate index file that exports all models
 */
function generateIndexFile(files: GeneratedFile[]): string {
  const exports = files
    .filter(f => f.path !== 'models/index.dart')
    .map(f => {
      const fileName = f.path.replace('models/', '').replace('enums/', '').replace('.dart', '');
      return `export '${fileName}.dart';`;
    })
    .join('\n');

  // Always try to export params/index.dart and headers/index.dart
  // The actual Dart files will only exist if params/headers were generated
  // Dart will handle the missing imports at compile time
  let indexContent = `// Generated index file for models
${exports}`;

  // For now, we don't export params and headers since they're generated separately
  // and we can't know at this point if they'll exist
  // This will be fixed in a future version with better orchestration

  return indexContent + '\n';
}