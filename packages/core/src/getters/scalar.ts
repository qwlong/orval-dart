/**
 * Handles scalar type processing - aligned with Orval structure
 * This file mirrors orval/packages/core/src/getters/scalar.ts
 */

import { OpenAPIV3 } from 'openapi-types';
import { TypeMapper } from '../utils/type-mapper';

export interface ScalarResult {
  type: string;
  imports: string[];
  nullable?: boolean;
  format?: string;
  enum?: string[];
}

/**
 * Process scalar types - mirrors Orval's getScalar
 */
export function getScalar(
  item: OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject,
  name?: string
): ScalarResult {
  // Handle reference
  if ('$ref' in item) {
    const typeName = extractTypeFromRef(item.$ref);
    return {
      type: toPascalCase(typeName),
      imports: [`${toSnakeCase(typeName)}.dart`]
    };
  }

  const schema = item as OpenAPIV3.SchemaObject;
  
  // Handle enum
  if (schema.enum) {
    return getEnum(schema, name);
  }

  // Handle nullable patterns (OpenAPI 3.1 style)
  if (Array.isArray(schema.type)) {
    return handleTypeArray(schema.type as string[], schema);
  }

  // Handle basic scalar types
  const baseType = getBasicScalarType(schema);
  
  return {
    type: schema.nullable ? TypeMapper.toNullable(baseType) : baseType,
    imports: [],
    nullable: schema.nullable,
    format: schema.format
  };
}

/**
 * Get enum type
 */
function getEnum(schema: OpenAPIV3.SchemaObject, name?: string): ScalarResult {
  const enumName = name ? toPascalCase(name) : 'UnnamedEnum';
  
  return {
    type: enumName,
    imports: name ? [`${toSnakeCase(name)}.dart`] : [],
    enum: schema.enum as string[]
  };
}

/**
 * Handle OpenAPI 3.1 type arrays (e.g., ["string", "null"])
 */
function handleTypeArray(types: string[], schema: OpenAPIV3.SchemaObject): ScalarResult {
  const hasNull = types.includes('null');
  const nonNullTypes = types.filter(t => t !== 'null');
  
  if (nonNullTypes.length === 1) {
    const baseType = mapScalarType(nonNullTypes[0], schema.format);
    return {
      type: hasNull ? TypeMapper.toNullable(baseType) : baseType,
      imports: [],
      nullable: hasNull
    };
  }
  
  // Multiple non-null types - not a simple scalar
  return {
    type: 'dynamic',
    imports: []
  };
}

/**
 * Get basic scalar type
 */
function getBasicScalarType(schema: OpenAPIV3.SchemaObject): string {
  if (!schema.type) {
    return 'dynamic';
  }

  if (schema.type === 'array') {
    return getArrayType(schema);
  }

  if (schema.type === 'object') {
    return getObjectType(schema);
  }

  return mapScalarType(schema.type, schema.format);
}

/**
 * Map OpenAPI scalar type to Dart type
 */
function mapScalarType(type: string, format?: string): string {
  switch (type) {
    case 'string':
      if (format === 'date-time' || format === 'date') {
        return 'DateTime';
      }
      if (format === 'binary' || format === 'byte') {
        return 'Uint8List';
      }
      return 'String';
      
    case 'integer':
      if (format === 'int64') {
        return 'int'; // Dart's int is 64-bit
      }
      return 'int';
      
    case 'number':
      if (format === 'float') {
        return 'double';
      }
      return 'double';
      
    case 'boolean':
      return 'bool';
      
    default:
      return 'dynamic';
  }
}

/**
 * Get array type
 */
function getArrayType(schema: OpenAPIV3.SchemaObject): string {
  if (!schema.items) {
    return 'List<dynamic>';
  }

  const itemResult = getScalar(schema.items);
  return `List<${itemResult.type}>`;
}

/**
 * Get object type (for inline objects without properties)
 */
function getObjectType(schema: OpenAPIV3.SchemaObject): string {
  if (schema.additionalProperties) {
    if (typeof schema.additionalProperties === 'boolean') {
      return 'Map<String, dynamic>';
    }
    const valueResult = getScalar(schema.additionalProperties);
    return `Map<String, ${valueResult.type}>`;
  }
  
  if (schema.properties && Object.keys(schema.properties).length > 0) {
    // This should be handled by getObject, not scalar
    return 'Map<String, dynamic>';
  }
  
  return 'Map<String, dynamic>';
}

/**
 * Check if type is nullable (for OpenAPI 3.0 oneOf/anyOf patterns)
 */
export function isNullableScalar(schema: any): boolean {
  // Direct nullable flag
  if (schema.nullable === true) return true;
  
  // OpenAPI 3.1 type array with null
  if (Array.isArray(schema.type) && schema.type.includes('null')) return true;
  
  // oneOf/anyOf with null type
  if ((schema.oneOf || schema.anyOf) && Array.isArray(schema.oneOf || schema.anyOf)) {
    const items = schema.oneOf || schema.anyOf;
    if (items.length === 2) {
      return items.some((s: any) => s.type === 'null');
    }
  }
  
  return false;
}

/**
 * Extract non-null type from nullable pattern
 */
export function getNonNullType(schema: any): any {
  // OpenAPI 3.1 type array
  if (Array.isArray(schema.type)) {
    const nonNullTypes = schema.type.filter((t: string) => t !== 'null');
    if (nonNullTypes.length === 1) {
      return { ...schema, type: nonNullTypes[0], nullable: false };
    }
  }
  
  // oneOf/anyOf pattern
  const items = schema.oneOf || schema.anyOf;
  if (items && items.length === 2) {
    return items.find((s: any) => s.type !== 'null');
  }
  
  return schema;
}

// Helper functions

function extractTypeFromRef(ref: string): string {
  const parts = ref.split('/');
  return parts[parts.length - 1];
}

function toSnakeCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .toLowerCase();
}

function toPascalCase(str: string): string {
  return str
    .replace(/[-_](.)/g, (_, char) => char.toUpperCase())
    .replace(/^(.)/, (_, char) => char.toUpperCase());
}