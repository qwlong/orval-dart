/**
 * Schema type assertions - aligned with Orval structure
 * This file mirrors orval/packages/core/src/utils/assertion.ts
 */

import { OpenAPIV3 } from 'openapi-types';

/**
 * Check if value is a schema object (not a reference)
 */
export function isSchema(x: any): x is OpenAPIV3.SchemaObject {
  if (!x || typeof x !== 'object') {
    return false;
  }

  // References are not schemas
  if ('$ref' in x) {
    return false;
  }

  // Check for schema-specific properties
  if ('type' in x || 'properties' in x || 'items' in x) {
    return true;
  }

  // Check for composition
  const combine = x.allOf || x.anyOf || x.oneOf;
  if (Array.isArray(combine)) {
    return true;
  }

  // Check for other schema properties
  if ('enum' in x || 'const' in x || 'nullable' in x) {
    return true;
  }

  return false;
}

/**
 * Check if value is a reference object
 */
export function isReference(x: any): x is OpenAPIV3.ReferenceObject {
  return x && typeof x === 'object' && '$ref' in x;
}

/**
 * Check if schema has composition (allOf, oneOf, anyOf)
 */
export function hasComposition(schema: any): boolean {
  return !!(schema.allOf || schema.oneOf || schema.anyOf);
}

/**
 * Check if schema is an enum
 */
export function isEnum(schema: any): boolean {
  return schema && Array.isArray(schema.enum) && schema.enum.length > 0;
}

/**
 * Whether an enum can be expressed as a Dart enum.
 *
 * json_serializable only accepts String, int or null in a `@JsonValue`, so a
 * set of decimals or booleans has no representation - the file it produces
 * cannot be built. Those schemas keep their scalar Dart type instead, and the
 * allowed values stay a server-side constraint.
 */
export function isRepresentableEnum(schema: any): boolean {
  if (!isEnum(schema)) {
    return false;
  }

  const values = schema.enum.filter((value: any) => value !== null);
  if (values.length === 0) {
    return false;
  }

  const allStrings = values.every((value: any) => typeof value === 'string');
  // Beyond the safe range the literal either loses precision or overflows
  // Dart's int, and JS starts printing it in exponent notation
  const allIntegers = values.every((value: any) => Number.isSafeInteger(value));

  return allStrings || allIntegers;
}

/**
 * Check if schema is an object type
 */
export function isObject(schema: any): boolean {
  if (!isSchema(schema)) return false;
  
  return schema.type === 'object' || 
         Boolean(schema.properties && Object.keys(schema.properties).length > 0);
}

/**
 * Check if schema is an array type
 */
export function isArray(schema: any): boolean {
  if (!isSchema(schema)) return false;
  
  return schema.type === 'array';
}

/**
 * Check if schema is a primitive type
 */
export function isPrimitive(schema: any): boolean {
  if (!isSchema(schema)) return false;
  
  const primitiveTypes = ['string', 'number', 'integer', 'boolean', 'null'];
  
  if (typeof schema.type === 'string') {
    return primitiveTypes.includes(schema.type);
  }
  
  // OpenAPI 3.1 type arrays
  if (Array.isArray(schema.type)) {
    return (schema.type as string[]).every((t: string) => primitiveTypes.includes(t));
  }
  
  return false;
}

/**
 * Check if schema has discriminator
 */
export function hasDiscriminator(schema: any): boolean {
  return !!(schema.discriminator);
}

/**
 * Check if schema has discriminated union pattern
 * (property with enum + property with oneOf/anyOf)
 */
export function hasDiscriminatedUnion(schema: any): boolean {
  if (!schema.properties) {
    return false;
  }

  // Check if this is an object type (explicit or implicit)
  if (schema.type && schema.type !== 'object') {
    return false;
  }

  let hasEnumProperty = false;
  let hasValidUnionProperty = false;

  for (const propSchema of Object.values(schema.properties)) {
    const prop = propSchema as any;
    
    if (prop.enum && Array.isArray(prop.enum)) {
      hasEnumProperty = true;
    }
    
    if (prop.oneOf || prop.anyOf) {
      const unionSchemas = prop.oneOf || prop.anyOf;
      // Only consider it a valid union for discriminated pattern if:
      // 1. There are multiple schemas in the union
      // 2. Or there's a single schema that is a reference (not a primitive type)
      if (unionSchemas.length > 1 || 
          (unionSchemas.length === 1 && unionSchemas[0].$ref)) {
        hasValidUnionProperty = true;
      }
    }
  }

  return hasEnumProperty && hasValidUnionProperty;
}

/**
 * Get composition type
 */
export function getCompositionType(schema: any): 'allOf' | 'oneOf' | 'anyOf' | null {
  if (schema.allOf) return 'allOf';
  if (schema.oneOf) return 'oneOf';
  if (schema.anyOf) return 'anyOf';
  return null;
}

/**
 * Check if schema is nullable
 */
export function isNullable(schema: any): boolean {
  // Direct nullable flag (OpenAPI 3.0)
  if (schema.nullable === true) return true;
  
  // Type array with null (OpenAPI 3.1)
  if (Array.isArray(schema.type) && schema.type.includes('null')) return true;
  
  // oneOf/anyOf with null
  const composition = schema.oneOf || schema.anyOf;
  if (composition && Array.isArray(composition) && composition.length === 2) {
    return composition.some((s: any) => s.type === 'null');
  }
  
  return false;
}

/**
 * Check if schema is required
 */
export function isRequired(propertyName: string, parentSchema: any): boolean {
  return parentSchema.required && 
         Array.isArray(parentSchema.required) && 
         parentSchema.required.includes(propertyName);
}

/**
 * Check if schema should create an interface (vs type alias)
 */
export function shouldCreateInterface(schema: OpenAPIV3.SchemaObject): boolean {
  return (
    (!schema.type || schema.type === 'object') &&
    !schema.allOf &&
    !schema.oneOf &&
    !schema.anyOf &&
    !isReference(schema) &&
    !schema.nullable &&
    !schema.enum
  );
}

/**
 * Check if schema is empty (no meaningful content)
 */
/**
 * Keys that can sit next to a `$ref` without making the schema more than an
 * alias. `id` is what nestjs-zod emits when a DTO is aliased under a new name.
 */
const REF_ALIAS_METADATA_KEYS = new Set([
  '$ref', '$id', '$schema', '$comment', 'id', 'title', 'description',
  'example', 'examples', 'deprecated', 'readOnly', 'writeOnly', 'default'
]);

/**
 * Whether a schema is nothing but a reference to another one.
 *
 * OpenAPI 3.1 allows keywords alongside `$ref`, so `{ id, $ref }` is a whole
 * schema body that means "another name for that one". Anything carrying real
 * constraints of its own is not an alias but a reference with an override, and
 * is left to the paths that already handle it.
 */
export function isRefAlias(schema: any): boolean {
  if (!schema || typeof schema !== 'object' || typeof schema.$ref !== 'string') {
    return false;
  }

  return Object.keys(schema).every(key => REF_ALIAS_METADATA_KEYS.has(key));
}

export function isEmpty(schema: any): boolean {
  if (!isSchema(schema)) return true;
  
  // Has type or composition
  if (schema.type || hasComposition(schema)) return false;
  
  // Has properties
  if (schema.properties && Object.keys(schema.properties).length > 0) return false;
  
  // Has enum
  if (schema.enum && schema.enum.length > 0) return false;
  
  // Has const
  if ('const' in schema) return false;
  
  return true;
}