/**
 * Handles schema composition (allOf, oneOf, anyOf) - aligned with Orval structure
 * This file mirrors orval/packages/core/src/getters/combine.ts
 */

import { TemplateManager } from '../templates/template-manager';
import { TypeMapper } from '../utils/type-mapper';

// Separator type matching Orval
type Separator = 'allOf' | 'anyOf' | 'oneOf';

export interface CombineOptions {
  separator: Separator;
  discriminatorProperty?: string;
  discriminatorValues?: string[];
  nullable?: boolean;
}

export interface CombineResult {
  type: string;
  imports: string[];
  isSealed?: boolean;
  definition?: string;
}

/**
 * Main function to combine schemas - mirrors Orval's combineSchemas
 */
export function combineSchemas(
  schema: any,
  name: string,
  separator: Separator,
  context?: any
): CombineResult {
  // Get the schemas to combine
  const schemas = schema[separator];
  if (!schemas || !Array.isArray(schemas)) {
    return {
      type: 'dynamic',
      imports: []
    };
  }

  // Check for nullable pattern (oneOf/anyOf with null)
  if (isNullablePattern(separator, schemas)) {
    return handleNullablePattern(schemas);
  }

  // Check for discriminator - prefer context discriminator over schema discriminator
  const discriminator = context?.discriminator || extractDiscriminator(schema);
  
  // Handle based on separator type
  switch (separator) {
    case 'allOf':
      return combineAllOf(name, schemas, context);
    case 'oneOf':
      return combineOneOf(name, schemas, discriminator, context);
    case 'anyOf':
      return combineAnyOf(name, schemas, discriminator, context);
    default:
      return {
        type: 'dynamic',
        imports: []
      };
  }
}

/**
 * Combine allOf schemas - intersection type behavior
 */
function combineAllOf(
  name: string,
  schemas: any[],
  context?: any
): CombineResult {
  const imports: string[] = [];
  const properties = new Map<string, any>();
  const required = new Set<string>();
  
  // Merge all properties from all schemas
  schemas.forEach(schema => {
    if (schema.$ref) {
      const typeName = extractTypeFromRef(schema.$ref);
      imports.push(`${toSnakeCase(typeName)}.f.dart`);
      
      // Use refResolver if available to properly resolve the reference
      if (context?.refResolver) {
        const resolved = context.refResolver.resolveReference(schema.$ref);
        if (resolved) {
          // Recursively handle allOf in the referenced schema
          if (resolved.allOf) {
            const nestedResult = combineAllOf(typeName, resolved.allOf, context);
            // Merge nested properties
            nestedResult.imports.forEach(imp => imports.push(imp));
            // Get the properties from the resolved schema
            if (context?.schemas && context.schemas[typeName]) {
              const referencedSchema = context.schemas[typeName];
              if (referencedSchema.properties) {
                Object.entries(referencedSchema.properties).forEach(([key, value]) => {
                  properties.set(key, value);
                });
              }
              if (referencedSchema.required) {
                referencedSchema.required.forEach((req: string) => required.add(req));
              }
            }
          } else {
            // Regular reference without allOf
            if (resolved.properties) {
              Object.entries(resolved.properties).forEach(([key, value]) => {
                properties.set(key, value);
              });
            }
            if (resolved.required) {
              resolved.required.forEach((req: string) => required.add(req));
            }
          }
        }
      } else if (context?.schemas && context.schemas[typeName]) {
        // Fallback to using context.schemas if refResolver not available
        const referencedSchema = context.schemas[typeName];
        if (referencedSchema.properties) {
          Object.entries(referencedSchema.properties).forEach(([key, value]) => {
            properties.set(key, value);
          });
        }
        if (referencedSchema.required) {
          referencedSchema.required.forEach((req: string) => required.add(req));
        }
      }
    } else if (schema.properties) {
      Object.entries(schema.properties).forEach(([key, value]) => {
        properties.set(key, value);
      });
      if (schema.required) {
        schema.required.forEach((req: string) => required.add(req));
      }
    }
  });

  // Generate Freezed class with all combined properties
  const definition = generateFreezedClass(name, properties, required, imports);
  
  return {
    type: name,
    imports,
    definition
  };
}

/**
 * Combine oneOf schemas - union type with exactly one match
 */
function combineOneOf(
  name: string,
  schemas: any[],
  discriminator?: any,
  _context?: any
): CombineResult {
  const imports: string[] = [];
  
  // If we have a discriminator, generate sealed class
  if (discriminator) {
    return generateSealedClass(name, schemas, discriminator, imports);
  }
  
  // Without discriminator, generate wrapper
  return generateUnionWrapper(name, schemas, imports);
}

/**
 * Combine anyOf schemas - union type with multiple possible matches
 */
function combineAnyOf(
  name: string,
  schemas: any[],
  discriminator?: any,
  context?: any
): CombineResult {
  // Similar to oneOf but allows multiple matches
  // For Dart, we handle this similarly with sealed classes
  return combineOneOf(name, schemas, discriminator, context);
}

/**
 * Check if this is a nullable pattern
 */
function isNullablePattern(separator: Separator, schemas: any[]): boolean {
  if ((separator === 'oneOf' || separator === 'anyOf') && schemas.length === 2) {
    const hasNull = schemas.some(s => s.type === 'null');
    const hasNonNull = schemas.some(s => s.type !== 'null');
    return hasNull && hasNonNull;
  }
  return false;
}

/**
 * Handle nullable pattern - returns nullable type
 */
function handleNullablePattern(schemas: any[]): CombineResult {
  const nonNullSchema = schemas.find(s => s.type !== 'null');
  if (!nonNullSchema) {
    return { type: 'dynamic', imports: [] };
  }
  
  const baseType = extractType(nonNullSchema);
  const imports: string[] = [];
  
  if (!isPrimitiveType(baseType)) {
    imports.push(`${toSnakeCase(baseType)}.dart`);
  }
  
  return {
    type: TypeMapper.toNullable(baseType),
    imports
  };
}

/**
 * Extract discriminator from schema
 */
function extractDiscriminator(schema: any): any {
  if (schema.discriminator) {
    if (typeof schema.discriminator === 'string') {
      return { propertyName: schema.discriminator };
    }
    return schema.discriminator;
  }
  
  // Check for discriminated union pattern in properties
  if (schema.properties) {
    for (const [propName, propSchema] of Object.entries(schema.properties)) {
      const prop = propSchema as any;
      if (prop.enum && Array.isArray(prop.enum)) {
        // This might be a discriminator
        for (const [otherPropName, otherPropSchema] of Object.entries(schema.properties)) {
          const otherProp = otherPropSchema as any;
          if (otherProp.oneOf || otherProp.anyOf) {
            const unionSchemas = otherProp.oneOf || otherProp.anyOf;
            
            // Only consider it a discriminated union if:
            // 1. There are multiple schemas in the union
            // 2. Or there's a single schema that is a reference (not a primitive type)
            if (unionSchemas.length > 1 || 
                (unionSchemas.length === 1 && unionSchemas[0].$ref)) {
              return {
                propertyName: propName,
                values: prop.enum,
                unionProperty: otherPropName,
                unionSchemas: unionSchemas
              };
            }
          }
        }
      }
    }
  }
  
  return null;
}

/**
 * Generate sealed class for discriminated union
 */
function generateSealedClass(
  name: string,
  schemas: any[],
  discriminator: any,
  imports: string[]
): CombineResult {
  const templateManager = new TemplateManager();
  const discriminatorProperty = discriminator.propertyName || discriminator.discriminatorProperty || 'itemType';
  const discriminatorValues = discriminator.values || ['shift', 'time_off_request'];
  const unionProperty = discriminator.unionProperty || 'item';
  
  // Handle schemas from discriminated union pattern
  const unionSchemas = discriminator.unionSchemas || schemas;
  
  // Build union data for template
  const unions = unionSchemas.map((schema: any, index: number) => {
    const typeName = extractType(schema);
    if (typeName && typeName !== 'dynamic') {
      // Handle List types - extract the inner type for imports
      if (typeName.startsWith('List<')) {
        const innerType = typeName.match(/List<(.+)>/)?.[1];
        if (innerType && !isPrimitiveType(innerType) && innerType !== 'Map<String, dynamic>') {
          imports.push(`${toSnakeCase(innerType)}.f.dart`);
        }
      } else if (!isPrimitiveType(typeName)) {
        imports.push(`${toSnakeCase(typeName)}.f.dart`);
      }
      
      const discriminatorValue = discriminatorValues?.[index] || 
                                 getDiscriminatorValue(schema, discriminatorProperty, index);
      const factoryName = toCamelCase(discriminatorValue);
      
      return {
        factoryName,
        pascalFactoryName: toPascalCase(factoryName),
        discriminatorProperty,
        discriminatorValue,
        unionProperty,
        type: typeName,
        properties: [
          {
            name: unionProperty,
            type: typeName,
            required: true
          }
        ]
      };
    }
    return null;
  }).filter(Boolean);

  // Remove duplicates from imports
  const uniqueImports = [...new Set(imports.filter(imp => imp))];
  
  // Prepare template data
  const templateData = {
    className: name,
    fileName: toSnakeCase(name),
    imports: uniqueImports,
    unions,
    discriminatorProperty,
    unionProperty,
    customFromJson: false // Set to true if you want custom fromJson
  };
  
  // Render using template
  const definition = templateManager.render('freezed-union', templateData);

  return {
    type: name,
    imports,
    isSealed: true,
    definition
  };
}

/**
 * Generate union wrapper for non-discriminated unions
 */
function generateUnionWrapper(
  name: string,
  schemas: any[],
  imports: string[]
): CombineResult {
  const types: string[] = [];
  
  schemas.forEach(schema => {
    const typeName = extractType(schema);
    if (typeName && typeName !== 'dynamic') {
      types.push(typeName);
      if (!isPrimitiveType(typeName)) {
        imports.push(`${toSnakeCase(typeName)}.f.dart`);
      }
    }
  });

  const fileName = toSnakeCase(name);
  // Remove duplicates from imports
  const uniqueImports = [...new Set(imports.filter(imp => imp))];
  
  const definition = `import 'package:freezed_annotation/freezed_annotation.dart';
${uniqueImports.map(imp => `import '${imp}';`).join('\n')}

part '${fileName}.f.freezed.dart';
part '${fileName}.f.g.dart';

@freezed
sealed class ${name} with _\$${name} {
  const ${name}._();
  
  const factory ${name}({
    required dynamic value, // Can be: ${types.join(', ')}

  }) = _${name};

  factory ${name}.fromJson(Map<String, dynamic> json) {
    // Try to parse as each type
${generateTryParsing(types)}
    
    throw Exception('Could not parse ${name} from JSON');
  }
  
  // Type-safe getters
${generateTypeGetters(types)}
}
`;

  return {
    type: name,
    imports,
    definition
  };
}

/**
 * Generate Freezed class definition using template
 */
function generateFreezedClass(
  name: string,
  properties: Map<string, any>,
  required: Set<string>,
  imports: string[]
): string {
  const templateManager = new TemplateManager();
  const fileName = toSnakeCase(name);
  
  // Convert properties map to array for template
  const templateProperties = Array.from(properties.entries()).map(([propName, propSchema]) => {
    const dartName = toCamelCase(propName);
    let dartType = extractType(propSchema);
    const isRequired = required.has(propName);
    const nullable = !isRequired || propSchema.nullable;
    
    // Add imports for referenced types
    if (propSchema.$ref) {
      const refType = extractTypeFromRef(propSchema.$ref);
      const importFile = `${toSnakeCase(refType)}.f.dart`;
      if (!imports.includes(importFile)) {
        imports.push(importFile);
      }
      dartType = refType;
    }
    
    return {
      name: dartName,
      type: dartType + (nullable && !dartType.endsWith('?') ? '?' : ''),
      required: isRequired,
      nullable,
      description: propSchema.description,
      jsonKey: dartName !== propName ? propName : undefined,
      defaultValue: propSchema.default ? formatDefaultValue(propSchema.default, dartType) : undefined
    };
  });

  // Remove duplicates from imports
  const uniqueImports = [...new Set(imports.filter(imp => imp))];
  
  // Check for special imports
  const hasUint8List = templateProperties.some(p => p.type.includes('Uint8List'));
  
  // Prepare template data
  const templateData = {
    className: name,
    fileName,
    description: undefined,
    hasUint8List,
    additionalImports: uniqueImports.filter(imp => 
      !imp.includes('dart:') && 
      !imp.includes('freezed') && 
      !imp.includes('json_annotation')
    ),
    properties: templateProperties
  };

  // Render using the regular model template
  return templateManager.render('freezed-model', templateData);
}

/**
 * Format default value for template
 */
function formatDefaultValue(value: any, type: string): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  
  if (type === 'String') {
    return `'${value}'`;
  }
  
  if (type === 'int' || type === 'double') {
    return String(value);
  }
  
  if (type === 'bool') {
    return String(value);
  }
  
  if (type.startsWith('List')) {
    return 'const []';
  }
  
  if (type.startsWith('Map')) {
    return 'const {}';
  }
  
  return null;
}

// Helper functions

function extractType(schema: any): string {
  if (schema.$ref) {
    return extractTypeFromRef(schema.$ref);
  }
  
  switch (schema.type) {
    case 'string':
      return schema.format === 'date-time' ? 'DateTime' : 'String';
    case 'integer':
      return 'int';
    case 'number':
      return 'double';
    case 'boolean':
      return 'bool';
    case 'array':
      return schema.items ? `List<${extractType(schema.items)}>` : 'List<dynamic>';
    case 'object':
      return 'Map<String, dynamic>';
    default:
      return 'dynamic';
  }
}

function extractTypeFromRef(ref: string): string {
  const parts = ref.split('/');
  return parts[parts.length - 1];
}

function isPrimitiveType(type: string): boolean {
  return ['String', 'int', 'double', 'bool', 'dynamic', 'DateTime'].includes(type) ||
         type.startsWith('List') || type.startsWith('Map');
}

function toSnakeCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .toLowerCase();
}

function toCamelCase(str: string): string {
  if (str.includes('_')) {
    const parts = str.split('_');
    return parts[0] + parts.slice(1).map(p => 
      p.charAt(0).toUpperCase() + p.slice(1)
    ).join('');
  }
  return str.charAt(0).toLowerCase() + str.slice(1);
}

function toPascalCase(str: string): string {
  if (str.includes('_')) {
    return str.split('_').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join('');
  }
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function getDiscriminatorValue(schema: any, discriminatorProperty: string, index: number): string {
  if (schema.properties && schema.properties[discriminatorProperty]) {
    const prop = schema.properties[discriminatorProperty];
    if (prop.const) return prop.const;
    if (prop.enum && prop.enum.length > 0) return prop.enum[0];
  }
  
  const typeName = extractType(schema);
  return typeName ? toSnakeCase(typeName) : `type_${index}`;
}

function generateTryParsing(types: string[]): string {
  return types.map(type => `    try {
      return ${type}.fromJson(json);
    } catch (_) {}`).join('\n');
}

function generateTypeGetters(types: string[]): string {
  return types.map(type => {
    const _getterName = toCamelCase(type);
    return `  ${type}? get as${type} => value is ${type} ? value as ${type} : null;`;
  }).join('\n');
}