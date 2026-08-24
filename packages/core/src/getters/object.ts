/**
 * Handles object schema processing - aligned with Orval structure
 * This file mirrors orval/packages/core/src/getters/object.ts
 */

import { OpenAPIV3 } from 'openapi-types';
import { combineSchemas } from './combine';
import { TypeMapper } from '../utils';
import { TemplateManager } from '../templates/template-manager';
import { DartProperty } from '../types';

export interface ObjectResult {
  type: string;
  imports: string[];
  properties?: Map<string, PropertyInfo>;
  required?: string[];
  definition?: string;
}

export interface PropertyInfo {
  name: string;
  type: string;
  required: boolean;
  nullable: boolean;
  description?: string;
  defaultValue?: any;
  jsonKey?: string;
  /** `format: date` - serializes as YYYY-MM-DD rather than a full timestamp */
  dateOnly?: boolean;
}

/**
 * Process object schema - mirrors Orval's getObject
 */
export function getObject(
  item: OpenAPIV3.SchemaObject,
  name: string,
  context?: any
): ObjectResult {
  // Check for composition first (allOf, oneOf, anyOf)
  if (item.allOf || item.oneOf || item.anyOf) {
    const separator = item.allOf ? 'allOf' : item.oneOf ? 'oneOf' : 'anyOf';
    
    return combineSchemas(
      item,
      name,
      separator,
      context
    );
  }

  // Handle regular object with properties
  const importsSet: Set<string> = new Set();
  const properties = new Map<string, PropertyInfo>();
  const required = item.required || [];
  
  if (item.properties) {
    Object.entries(item.properties).forEach(([propName, propSchema]) => {
      const propInfo = processProperty(propName, propSchema, required.includes(propName), importsSet, context?.inlineTypes, context?.inlineEnums);
      properties.set(propName, propInfo);
    });
  }

  // Generate Freezed model
  const imports = Array.from(importsSet);
  const definition = generateObjectModel(name, properties, imports);

  return {
    type: TypeMapper.toDartClassName(name),
    imports,
    properties,
    required,
    definition
  };
}

/**
 * Process a single property
 */
function processProperty(
  propName: string,
  propSchema: any,
  isRequired: boolean,
  importsSet: Set<string>,
  inlineTypes?: Map<string, string>,
  inlineEnums?: Map<string, string>
): PropertyInfo {
  const dartName = TypeMapper.toDartPropertyName(propName);
  let dartType = 'dynamic';

  // Check if this property has an inline enum mapping
  if (inlineEnums?.has(propName)) {
    const enumTypeName = inlineEnums.get(propName)!;
    dartType = TypeMapper.toDartClassName(enumTypeName);
    importsSet.add(`${TypeMapper.toSnakeCase(enumTypeName)}.f.dart`);
  }
  // Check if this property has an inline type mapping
  else if (inlineTypes?.has(propName)) {
    const nestedTypeName = inlineTypes.get(propName)!;
    dartType = TypeMapper.toDartClassName(nestedTypeName);
    importsSet.add(`${TypeMapper.toSnakeCase(nestedTypeName)}.f.dart`);
  }
  // Handle $ref
  else if (propSchema.$ref) {
    const typeName = TypeMapper.extractTypeFromRef(propSchema.$ref);
    dartType = TypeMapper.toDartClassName(typeName);
    importsSet.add(`${TypeMapper.toSnakeCase(typeName)}.f.dart`);
  }
  // Handle allOf composition in property
  else if (propSchema.allOf) {
    // If allOf has a single $ref, treat it as a direct reference
    if (propSchema.allOf.length === 1 && propSchema.allOf[0].$ref) {
      const typeName = TypeMapper.extractTypeFromRef(propSchema.allOf[0].$ref);
      dartType = TypeMapper.toDartClassName(typeName);
      const importPath = `${TypeMapper.toSnakeCase(typeName)}.f.dart`;
      importsSet.add(importPath);
    } else {
      // Complex allOf at property level - for now use dynamic
      // TODO: Implement property-level allOf merging (root-level allOf is already working in model-generator.ts)
      // 
      // Example that currently returns 'dynamic' but should merge schemas:
      // UserProfile:
      //   properties:
      //     address:
      //       allOf:
      //         - $ref: '#/components/schemas/BaseAddress'  # has: street, city, country
      //         - type: object
      //           properties:
      //             postalCode:
      //               type: string
      //             apartmentNumber:
      //               type: integer
      // 
      // Expected: address should be a type with all properties from BaseAddress + postalCode + apartmentNumber
      // Current: address becomes 'dynamic'
      dartType = 'dynamic';
    }
  }
  // Handle composition in property
  else if (propSchema.oneOf || propSchema.anyOf) {
    // Check if this is a nullable pattern (oneOf with string and null)
    const schemas = propSchema.oneOf || propSchema.anyOf;
    
    // Handle single type in oneOf/anyOf (common in poorly structured OpenAPI specs)
    if (schemas.length === 1) {
      const singleSchema = schemas[0];
      if (singleSchema.$ref) {
        const typeName = TypeMapper.extractTypeFromRef(singleSchema.$ref);
        dartType = TypeMapper.toDartClassName(typeName);
        importsSet.add(`${TypeMapper.toSnakeCase(typeName)}.f.dart`);
      } else {
        dartType = getScalarType(singleSchema);
        // Add imports if needed for complex types
        if (dartType.startsWith('List<') && !dartType.includes('Map<String, dynamic>')) {
          const innerType = TypeMapper.extractInnerType(dartType);
          if (!isPrimitiveType(innerType) && innerType !== 'Map<String, dynamic>') {
            importsSet.add(`${TypeMapper.toSnakeCase(innerType)}.f.dart`);
          }
        }
      }
    }
    else if (schemas.length === 2) {
      const hasNull = schemas.some((s: any) => s.type === 'null');
      const nonNullSchema = schemas.find((s: any) => s.type !== 'null');
      
      if (hasNull && nonNullSchema) {
        // This is a nullable type pattern - type is inherently nullable
        // Check if nonNullSchema is a reference
        if (nonNullSchema.$ref) {
          const typeName = TypeMapper.extractTypeFromRef(nonNullSchema.$ref);
          dartType = TypeMapper.toDartClassName(typeName) + '?';
          importsSet.add(`${TypeMapper.toSnakeCase(typeName)}.f.dart`);
        } else {
          // For oneOf/anyOf with null, the type is already nullable
          dartType = TypeMapper.toNullable(getScalarType(nonNullSchema));
          // Add imports if needed
          if (dartType.startsWith('List<') && !dartType.includes('Map<String, dynamic>')) {
            const innerType = TypeMapper.extractInnerType(dartType);
            if (!isPrimitiveType(innerType) && innerType !== 'Map<String, dynamic>') {
              importsSet.add(`${TypeMapper.toSnakeCase(innerType)}.f.dart`);
            }
          }
        }
      } else {
        // Complex union type - use dynamic for now
        dartType = 'dynamic';
      }
    } else {
      // Complex union type - use dynamic for now
      dartType = 'dynamic';
    }
  }
  // Handle basic types
  else {
    dartType = getScalarType(propSchema);
    
    // Add imports for complex types
    if (dartType.startsWith('List<') && !dartType.includes('Map<String, dynamic>')) {
      const innerType = TypeMapper.extractInnerType(dartType);
      if (!isPrimitiveType(innerType) && innerType !== 'Map<String, dynamic>') {
        importsSet.add(`${TypeMapper.toSnakeCase(innerType)}.f.dart`);
      }
    }
    
    // Check if this is a Map with reference types that need imports
    if (propSchema.type === 'object' && propSchema.additionalProperties) {
      extractReferencesFromSchema(propSchema.additionalProperties, importsSet);
    }
    
    // Check if this is an array with reference types (not already handled above)
    if (propSchema.type === 'array' && propSchema.items?.$ref && 
        !dartType.includes('Map<String, dynamic>')) {
      const typeName = TypeMapper.extractTypeFromRef(propSchema.items.$ref);
      // Only add if not already added (Set handles deduplication automatically)
      const importPath = `${TypeMapper.toSnakeCase(typeName)}.f.dart`;
      importsSet.add(importPath);
    }
  }
  
  // Handle nullable (unless already handled by oneOf/anyOf with null)
  const isOneOfNullable = (propSchema.oneOf || propSchema.anyOf) && dartType.endsWith('?');
  const nullable = !isRequired || propSchema.nullable === true || isOneOfNullable;
  // Only add ? if not already nullable and should be nullable
  if (nullable && !isOneOfNullable) {
    dartType = TypeMapper.toNullable(dartType);
  }
  
  return {
    name: dartName,
    type: dartType,
    required: isRequired,
    nullable,
    description: propSchema.description,
    defaultValue: propSchema.default,
    // Always add jsonKey if names differ OR if propName contains $ (for raw string handling)
    jsonKey: (dartName !== propName || propName.includes('$')) ? propName : undefined,
    dateOnly: TypeMapper.isDateOnlySchema(propSchema)
  };
}

/**
 * Generate Freezed model for object using template system
 */
function generateObjectModel(
  name: string,
  properties: Map<string, PropertyInfo>,
  imports: string[]
): string {
  // Create a TemplateManager instance to render the template
  const templateManager = new TemplateManager();
  
  // Convert PropertyInfo map to DartProperty array
  const dartProperties: DartProperty[] = Array.from(properties.values()).map(prop => ({
    name: prop.name,
    type: prop.type,
    required: prop.required,
    nullable: prop.nullable,
    description: prop.description,
    defaultValue: prop.defaultValue,
    jsonKey: prop.jsonKey,
    dateOnly: prop.dateOnly
  }));
  
  const fileName = TypeMapper.toSnakeCase(name);
  const className = TypeMapper.toDartClassName(name);
  
  // Check for special imports
  const hasUint8List = dartProperties.some(p => p.type.includes('Uint8List'));
  const hasDateOnlyConverter = dartProperties.some(p => p.dateOnly);
  
  // Prepare template data - matching what ModelGenerator.renderModel does
  const templateData = {
    className,
    fileName,
    description: undefined,
    hasUint8List,
    hasDateOnlyConverter,
    additionalImports: imports.filter(imp => 
      !imp.includes('dart:') && 
      !imp.includes('freezed') && 
      !imp.includes('json_annotation')
    ),
    properties: dartProperties.map(prop => ({
      name: prop.name,
      type: prop.type,
      required: prop.required && !prop.defaultValue,
      nullable: prop.nullable,
      description: prop.description,
      jsonKey: prop.jsonKey,
      dateOnly: prop.dateOnly,
      defaultValue: formatDefaultValueForTemplate(prop.defaultValue, prop.type)
    }))
  };
  
  // Use TemplateManager to render the freezed-model template
  return templateManager.render('freezed-model', templateData);
}

/**
 * Format default value for template (matching ModelGenerator's formatDefaultValue)
 */
function formatDefaultValueForTemplate(value: any, type: string): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  
  // Format based on type
  if (type === 'String' || type === 'String?') {
    return `'${value}'`;
  }
  
  if (type === 'int' || type === 'double' || 
      type === 'int?' || type === 'double?') {
    return String(value);
  }
  
  if (type === 'bool' || type === 'bool?') {
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

/**
 * Get scalar type from schema
 */
function getScalarType(schema: any): string {
  switch (schema.type) {
    case 'string':
      if (schema.format === 'date-time') return 'DateTime';
      if (schema.format === 'date') return 'DateTime';
      if (schema.format === 'binary') return 'Uint8List';
      return 'String';
    case 'integer':
      return 'int';
    case 'number':
      return 'double';
    case 'boolean':
      return 'bool';
    case 'array':
      if (schema.items) {
        // Check if items have a $ref
        if (schema.items.$ref) {
          const typeName = TypeMapper.extractTypeFromRef(schema.items.$ref);
          return `List<${TypeMapper.toDartClassName(typeName)}>`;
        }
        // Recursively handle nested arrays
        const itemType = getScalarType(schema.items);
        return `List<${itemType}>`;
      }
      return 'List<dynamic>';
    case 'object':
      if (schema.additionalProperties) {
        // Check if additionalProperties has a $ref
        if (schema.additionalProperties.$ref) {
          const typeName = TypeMapper.extractTypeFromRef(schema.additionalProperties.$ref);
          return `Map<String, ${TypeMapper.toDartClassName(typeName)}>`;
        }
        // Check if additionalProperties is an array with $ref items
        if (schema.additionalProperties.type === 'array' && schema.additionalProperties.items?.$ref) {
          const typeName = TypeMapper.extractTypeFromRef(schema.additionalProperties.items.$ref);
          return `Map<String, List<${TypeMapper.toDartClassName(typeName)}>>`;
        }
        const valueType = getScalarType(schema.additionalProperties);
        return `Map<String, ${valueType}>`;
      }
      // Check if description hints at a more specific type
      if (schema.description) {
        const descLower = schema.description.toLowerCase();
        
        // Check if description suggests it's a boolean (common API spec mistake)
        if (descLower.includes('if true') || descLower.includes('boolean') || 
            descLower.includes('true/false') || descLower.includes('true or false') ||
            descLower.includes('whether')) {
          return 'bool';
        }
        
        // Skip status field inference - too ambiguous
        
        // Check for job/primary job (likely a complex object, but check if there's a JobDto)
        if (descLower.includes('primary job') || descLower === 'primary job') {
          // TODO: Could check if JobResponseDto exists and use that
          return 'JobResponseDto';
        }
      }
      // Check example to infer type
      if (schema.example) {
        // If example is a string that looks like a time/date/ID, this shouldn't be a Map
        if (typeof schema.example === 'string') {
          // Check for time pattern (HH:mm:ss)
          if (/^\d{2}:\d{2}:\d{2}$/.test(schema.example)) {
            return 'String';
          }
          // Check for date/datetime pattern
          if (/^\d{4}-\d{2}-\d{2}/.test(schema.example)) {
            return 'DateTime';
          }
          // Check for UUID pattern
          if (/^[a-f0-9-]+$/.test(schema.example) && schema.example.includes('-')) {
            return 'String';
          }
          // General string
          return 'String';
        }
        // If example is a number
        if (typeof schema.example === 'number') {
          return Number.isInteger(schema.example) ? 'int' : 'double';
        }
      }
      return 'Map<String, dynamic>';
    default:
      return 'dynamic';
  }
}

/**
 * Format default value for Dart
 */
function _formatDefaultValue(value: any, _type: string): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return `'${value}'`;
  if (typeof value === 'boolean') return value.toString();
  if (typeof value === 'number') return value.toString();
  if (Array.isArray(value)) return 'const []';
  if (typeof value === 'object') return 'const {}';
  return 'null';
}

// Helper functions

function _extractTypeFromRef(ref: string): string {
  const parts = ref.split('/');
  return parts[parts.length - 1];
}

// TypeMapper helper not available, implementing locally
function _extractInnerType(type: string): string {
  const match = type.match(/^(?:List|Map)<(.+)>$/);
  return match ? match[1] : type;
}

function isPrimitiveType(type: string): boolean {
  // Remove nullable markers for checking
  const cleanType = type.replace(/\?$/, '');

  // Basic primitive types
  const basicPrimitives = ['String', 'int', 'double', 'bool', 'dynamic', 'DateTime', 'Uint8List'];
  if (basicPrimitives.includes(cleanType)) {
    return true;
  }

  // Map types (any Map<String, ...> is considered primitive for import purposes)
  if (cleanType === 'Map<String, dynamic>' || cleanType.startsWith('Map<String, ')) {
    return true;
  }

  // List types - recursively check if it's a list of primitives
  if (cleanType.startsWith('List<')) {
    // Extract inner type (e.g., List<List<int>> -> List<int>)
    const innerMatch = cleanType.match(/^List<(.+)>$/);
    if (innerMatch) {
      const innerType = innerMatch[1];
      // Recursively check if inner type is primitive
      return isPrimitiveType(innerType);
    }
  }

  return false;
}

function _toSnakeCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .toLowerCase();
}

function _toCamelCase(str: string): string {
  // Handle kebab-case and snake_case
  return str
    .replace(/[-_](.)/g, (_, char) => char.toUpperCase())
    .replace(/^(.)/, (_, char) => char.toLowerCase());
}

function _toPascalCase(str: string): string {
  // Handle kebab-case and snake_case
  return str
    .replace(/[-_](.)/g, (_, char) => char.toUpperCase())
    .replace(/^(.)/, (_, char) => char.toUpperCase());
}

/**
 * Recursively extract references from schema for imports
 */
function extractReferencesFromSchema(schema: any, importsSet: Set<string>): void {
  if (!schema) return;

  // Handle direct $ref
  if (schema.$ref) {
    const typeName = TypeMapper.extractTypeFromRef(schema.$ref);
    const importPath = `${TypeMapper.toSnakeCase(typeName)}.f.dart`;
    importsSet.add(importPath);
  }

  // Handle arrays with $ref items
  if (schema.type === 'array' && schema.items) {
    extractReferencesFromSchema(schema.items, importsSet);
  }

  // Handle objects with additionalProperties
  if (schema.type === 'object' && schema.additionalProperties) {
    extractReferencesFromSchema(schema.additionalProperties, importsSet);
  }

  // Handle composition (allOf, oneOf, anyOf)
  ['allOf', 'oneOf', 'anyOf'].forEach(key => {
    if (schema[key] && Array.isArray(schema[key])) {
      schema[key].forEach((subSchema: any) => {
        extractReferencesFromSchema(subSchema, importsSet);
      });
    }
  });
}