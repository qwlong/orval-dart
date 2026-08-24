/**
 * Array type handling - aligned with Orval structure
 * Processes array schemas and generates Dart List types
 */

import { OpenAPIV3 } from 'openapi-types';
import { TypeMapper } from '../utils/type-mapper';

export interface ArrayResult {
  type: string;
  imports: string[];
  nullable?: boolean;
  itemType?: string;
}

/**
 * Process array schema and return Dart List type
 */
export function getArray(
  schema: OpenAPIV3.ArraySchemaObject,
  name?: string,
  _context?: any
): ArrayResult {
  const imports: string[] = [];
  let itemType = 'dynamic';
  
  if (schema.items) {
    // Handle items schema
    if ('$ref' in schema.items) {
      // Reference to another schema
      const refName = extractTypeFromRef(schema.items.$ref);
      itemType = refName;
      imports.push(`${toSnakeCase(refName)}.f.dart`);
    } else {
      // Inline schema
      itemType = getScalarType(schema.items);
      
      // Handle nested arrays
      if (schema.items.type === 'array') {
        const nestedResult = getArray(schema.items as OpenAPIV3.ArraySchemaObject, name);
        itemType = nestedResult.type;
        imports.push(...nestedResult.imports);
      }
      
      // Handle objects
      if (schema.items.type === 'object') {
        itemType = 'Map<String, dynamic>';
      }
    }
  }
  
  // Build the List type
  const listType = `List<${itemType}>`;
  
  return {
    type: schema.nullable ? TypeMapper.toNullable(listType) : listType,
    imports,
    nullable: schema.nullable,
    itemType
  };
}

/**
 * Get scalar type from schema
 */
function getScalarType(schema: OpenAPIV3.SchemaObject): string {
  switch (schema.type) {
    case 'string':
      if (schema.format === 'date-time') return 'DateTime';
      if (schema.format === 'date') return 'DateTime';
      if (schema.format === 'binary') return 'Uint8List';
      if (schema.format === 'byte') return 'String'; // Base64 encoded
      return 'String';
    case 'integer':
      if (schema.format === 'int64') return 'int';
      if (schema.format === 'int32') return 'int';
      return 'int';
    case 'number':
      if (schema.format === 'float') return 'double';
      if (schema.format === 'double') return 'double';
      return 'double';
    case 'boolean':
      return 'bool';
    default:
      return 'dynamic';
  }
}

/**
 * Extract type name from $ref
 */
function extractTypeFromRef(ref: string): string {
  const parts = ref.split('/');
  return parts[parts.length - 1];
}

/**
 * Convert to snake_case
 */
function toSnakeCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .toLowerCase();
}

/**
 * Check if array contains enum items
 */
export function hasEnumItems(schema: OpenAPIV3.ArraySchemaObject): boolean {
  if (!schema.items) return false;
  
  if ('enum' in schema.items) {
    return true;
  }
  
  return false;
}

/**
 * Get array constraints
 */
export function getArrayConstraints(schema: OpenAPIV3.ArraySchemaObject): {
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
} {
  return {
    minItems: schema.minItems,
    maxItems: schema.maxItems,
    uniqueItems: schema.uniqueItems
  };
}

/**
 * Generate Dart List literal from example
 */
export function getArrayExample(
  schema: OpenAPIV3.ArraySchemaObject,
  example?: any[]
): string | undefined {
  if (!example || !Array.isArray(example)) {
    return undefined;
  }
  
  // Convert example to Dart list literal
  const items = example.map(item => {
    if (typeof item === 'string') {
      return `'${item}'`;
    }
    if (typeof item === 'number' || typeof item === 'boolean') {
      return String(item);
    }
    if (item === null) {
      return 'null';
    }
    return JSON.stringify(item);
  });
  
  return `[${items.join(', ')}]`;
}

/**
 * Check if array is nullable
 */
export function isNullableArray(schema: OpenAPIV3.ArraySchemaObject): boolean {
  return schema.nullable === true;
}

/**
 * Check if array items are nullable
 */
export function hasNullableItems(schema: OpenAPIV3.ArraySchemaObject): boolean {
  if (!schema.items) return false;
  
  if ('nullable' in schema.items) {
    return schema.items.nullable === true;
  }
  
  return false;
}

/**
 * Generate type-safe array getter
 */
export function generateArrayGetter(
  propertyName: string,
  arrayType: string,
  nullable: boolean
): string {
  const getterName = propertyName;
  const nullCheck = nullable ? '?' : '';
  
  return `List<${arrayType}>${nullCheck} get ${getterName};`;
}

/**
 * Handle tuple arrays (OpenAPI 3.1 prefixItems)
 */
export function getTupleArray(
  prefixItems: OpenAPIV3.SchemaObject[],
  _additionalItems?: OpenAPIV3.SchemaObject
): ArrayResult {
  // For Dart, we can't represent true tuples, so we use List<dynamic>
  // or create a custom class to represent the tuple
  
  const imports: string[] = [];
  
  // Collect types from prefix items
  const _types = prefixItems.map(item => {
    if ('$ref' in item) {
      const refName = extractTypeFromRef(item.$ref);
      imports.push(`${toSnakeCase(refName)}.f.dart`);
      return refName;
    }
    return getScalarType(item);
  });
  
  // For now, use List<dynamic> for tuples
  // In future, could generate a custom tuple class
  return {
    type: 'List<dynamic>',
    imports,
    nullable: false
  };
}