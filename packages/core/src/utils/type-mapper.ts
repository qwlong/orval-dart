/**
 * OpenAPI to Dart type mapping utilities
 */

import type { OpenAPIV3 } from 'openapi-types';

type SchemaObject = OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject;

/**
 * Basic type mapping from OpenAPI to Dart
 */
export const TYPE_MAP: Record<string, string> = {
  // Basic types
  'string': 'String',
  'integer': 'int',
  'number': 'double',
  'boolean': 'bool',
  'array': 'List',
  'object': 'Map<String, dynamic>',
  
  // Format specific mappings
  'string:date': 'DateTime',
  'string:date-time': 'DateTime',
  'string:byte': 'String', // Base64 encoded
  'string:binary': 'Uint8List',
  'string:email': 'String',
  'string:uuid': 'String',
  'string:uri': 'String',
  'string:hostname': 'String',
  'string:ipv4': 'String',
  'string:ipv6': 'String',
  'integer:int32': 'int',
  'integer:int64': 'int',
  'number:float': 'double',
  'number:double': 'double',
};

export class TypeMapper {
  /**
   * A `format: date` value is a calendar date, not a point in time. It maps to
   * DateTime like `date-time` does, but has to serialize back as YYYY-MM-DD.
   * Unwraps arrays and the wrappers that carry a single schema, so `array of
   * date`, `oneOf: [date, null]` and `allOf: [date]` are all recognised.
   *
   * A `$ref` is not followed: a scalar component schema does not generate a
   * DateTime field today, it generates a class of its own.
   */
  static isDateOnlySchema(schema?: SchemaObject): boolean {
    if (!schema || typeof schema !== 'object' || '$ref' in schema) {
      return false;
    }

    if (schema.format === 'date') {
      return true;
    }

    const items = (schema as OpenAPIV3.ArraySchemaObject).items;
    if (items && TypeMapper.isDateOnlySchema(items)) {
      return true;
    }

    return [schema.oneOf, schema.anyOf, schema.allOf].some(
      branches => Array.isArray(branches) && branches.some(branch => TypeMapper.isDateOnlySchema(branch))
    );
  }

  /**
   * Map OpenAPI type to Dart type
   */
  static mapType(schema: SchemaObject): string {
    if (!schema) {
      return 'dynamic';
    }

    // Handle $ref
    if ('$ref' in schema && schema.$ref) {
      const refName = this.extractTypeFromRef(schema.$ref);
      return this.toDartClassName(refName);
    }

    // Cast to non-reference schema for property access
    const nonRefSchema = schema as OpenAPIV3.SchemaObject;
    
    // Handle OpenAPI 3.1 type arrays (e.g., type: ["string", "null"])
    if (Array.isArray(nonRefSchema.type)) {
      const types = nonRefSchema.type as string[];
      const nonNullTypes = types.filter(t => t !== 'null');
      
      if (nonNullTypes.length === 1) {
        // Single type plus null - map the non-null type
        const baseSchema: OpenAPIV3.SchemaObject = { 
          ...nonRefSchema, 
          type: nonNullTypes[0] as any
        };
        return this.mapType(baseSchema);
      } else if (nonNullTypes.length > 1) {
        // Multiple types - return dynamic
        return 'dynamic';
      }
    }
    
    // Handle oneOf with nullable pattern
    if (nonRefSchema.oneOf && this.isNullableOneOf(nonRefSchema)) {
      const nonNullType = this.getNonNullTypeFromOneOf(nonRefSchema);
      return this.mapType(nonNullType);
    }
    
    // Handle arrays
    if (nonRefSchema.type === 'array') {
      const itemType = nonRefSchema.items ? this.mapType(nonRefSchema.items as SchemaObject) : 'dynamic';
      return `List<${itemType}>`;
    }

    // Handle objects with additionalProperties (Map)
    if (nonRefSchema.type === 'object' && nonRefSchema.additionalProperties) {
      const valueType = typeof nonRefSchema.additionalProperties === 'object'
        ? this.mapType(nonRefSchema.additionalProperties as SchemaObject)
        : 'dynamic';
      return `Map<String, ${valueType}>`;
    }

    // Handle objects with properties (custom class)
    if (nonRefSchema.type === 'object' && nonRefSchema.properties) {
      // This will be a custom model class name
      return nonRefSchema.title || 'Map<String, dynamic>';
    }

    // Handle enums
    if (nonRefSchema.enum && nonRefSchema.enum.length > 0) {
      return nonRefSchema.title || 'String';
    }

    // Handle oneOf/anyOf/allOf
    if (nonRefSchema.oneOf || nonRefSchema.anyOf) {
      return 'dynamic'; // Will be handled as union types later
    }

    if (nonRefSchema.allOf) {
      // Will be handled as composed model later
      return 'dynamic';
    }

    // Handle format-specific types
    const type = nonRefSchema.type as string;
    const format = nonRefSchema.format;
    
    if (format) {
      const key = `${type}:${format}`;
      if (TYPE_MAP[key]) {
        return TYPE_MAP[key];
      }
    }

    // Basic type mapping
    return TYPE_MAP[type] || 'dynamic';
  }

  /**
   * Map OpenAPI type to Dart type with null safety
   */
  static mapTypeWithNullability(schema: SchemaObject, required: boolean = true): string {
    const baseType = this.mapType(schema);
    
    // In Dart, add ? for nullable types
    if (!required && baseType !== 'dynamic') {
      return `${baseType}?`;
    }
    
    return baseType;
  }

  /**
   * Extract type name from $ref
   */
  static extractTypeFromRef(ref: string): string {
    if (!ref || typeof ref !== 'string') {
      return '';
    }
    
    // Handle external references (e.g., 'external.yaml#/components/schemas/User')
    let actualRef = ref;
    if (ref.includes('#')) {
      actualRef = ref.substring(ref.indexOf('#'));
    }
    
    // Check if it's a valid reference path
    if (!actualRef.startsWith('#/')) {
      return '';
    }
    
    // Must have a valid path structure
    const parts = actualRef.split('/');
    if (parts.length < 3) {
      return '';
    }
    
    // Validate that it's a proper reference path
    const _validPaths = ['components', 'definitions'];
    const validSubPaths = ['schemas', 'parameters', 'responses', 'examples', 'requestBodies', 'headers', 'securitySchemes', 'links', 'callbacks'];
    
    // Check if it's a valid component reference
    if (parts[1] === 'components') {
      if (!validSubPaths.includes(parts[2])) {
        return '';
      }
    } else if (parts[1] !== 'definitions') {
      // If not components or definitions, it's invalid
      return '';
    }
    
    // #/components/schemas/Pet -> Pet
    // #/definitions/BaseEntity -> BaseEntity
    return parts[parts.length - 1] || '';
  }

  /**
   * Convert OpenAPI property name to Dart property name
   */
  static toDartPropertyName(name: string): string {
    // Special case: preserve names starting with $ (e.g., $if, $switch, $match)
    // These are valid Dart identifiers even if the part after $ is a keyword
    // because $ makes them different from the keyword itself
    if (name.startsWith('$')) {
      return name;  // Return as-is (e.g., $if, $switch, $else)
    }

    // Handle all uppercase with underscores first (USER_NAME -> userName)
    if (name === name.toUpperCase() && name.includes('_')) {
      const parts = name.toLowerCase().split('_');
      return parts[0] + parts.slice(1).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('');
    }

    // First, replace invalid characters with separators
    // Replace common separators and special characters with hyphens temporarily
    let result = name
      .replace(/[^\w.-]/g, '-')  // Replace all non-word chars (except .-) with hyphens
      .replace(/[-_]([a-zA-Z])/g, (_, letter) => letter.toUpperCase())  // Convert to camelCase
      .replace(/\.([a-zA-Z])/g, (_, letter) => letter.toUpperCase());   // Handle dots

    // Remove any remaining special characters
    result = result.replace(/[^\w]/g, '');

    // If the result is all uppercase (and not a single char), convert to lowercase
    if (result === result.toUpperCase() && result.length > 1) {
      result = result.toLowerCase();
    }

    // Ensure first character is lowercase for camelCase
    if (result.length > 0) {
      result = result.charAt(0).toLowerCase() + result.slice(1);
    }

    // If name starts with a number, prefix with underscore
    if (result.length > 0 && /^\d/.test(result)) {
      result = `$${result}`;
    }

    // If result is empty or invalid, use a default name
    if (!result || result.length === 0) {
      result = 'property';
    }

    // Escape reserved keywords by adding underscore suffix
    if (this.isDartReservedKeyword(result)) {
      result = `${result}_`;
    }

    return result;
  }
  
  /**
   * List of Dart reserved keywords
   */
  private static readonly DART_RESERVED_KEYWORDS = new Set([
    'abstract', 'as', 'assert', 'async', 'await', 'break', 'case', 'catch',
    'class', 'const', 'continue', 'covariant', 'default', 'deferred', 'do',
    'dynamic', 'else', 'enum', 'export', 'extends', 'extension', 'external',
    'factory', 'false', 'final', 'finally', 'for', 'Function', 'get', 'hide',
    'if', 'implements', 'import', 'in', 'interface', 'is', 'late', 'library',
    'mixin', 'new', 'null', 'on', 'operator', 'part', 'required', 'rethrow',
    'return', 'sealed', 'set', 'show', 'static', 'super', 'switch', 'sync',
    'this', 'throw', 'true', 'try', 'typedef', 'var', 'void', 'when', 'while',
    'with', 'yield'
  ]);

  /**
   * Check if a name is a Dart reserved keyword
   */
  static isDartReservedKeyword(name: string): boolean {
    return this.DART_RESERVED_KEYWORDS.has(name);
  }

  /**
   * Extract inner type from List<T> or Map<K,V>
   */
  static extractInnerType(type: string): string {
    // Remove nullable marker if present for pattern matching
    const cleanType = type.endsWith('?') ? type.slice(0, -1) : type;

    // Match List<Type>
    const listMatch = cleanType.match(/^List<(.+)>$/);
    if (listMatch) {
      return listMatch[1];
    }

    // Match Map<String, Type>
    const mapMatch = cleanType.match(/^Map<String,\s*(.+)>$/);
    if (mapMatch) {
      return mapMatch[1];
    }

    return type;
  }

  /**
   * Convert to camelCase (specifically for parameter names)
   */
  static toCamelCase(name: string): string {
    // Handle special cases for headers (x-api-key -> xApiKey)
    let result = name.replace(/[-_]([a-z])/gi, (_, letter) => letter.toUpperCase());
    
    // Ensure first letter is lowercase
    if (result.length > 0) {
      result = result.charAt(0).toLowerCase() + result.slice(1);
    }
    
    // Escape reserved keywords by adding underscore suffix
    if (this.isDartReservedKeyword(result)) {
      result = `${result}_`;
    }
    
    return result;
  }

  /**
   * Convert to Dart class name (PascalCase)
   */
  static toDartClassName(name: string): string {
    // Handle all-caps acronyms (APIResponse -> ApiResponse)
    let result = name.replace(/([A-Z])([A-Z]+)([A-Z][a-z]|$)/g, (match, p1, p2, p3) => {
      if (p3) {
        // APIResponse -> Api + Response
        return p1 + p2.toLowerCase() + p3;
      } else {
        // End of string, e.g. API -> Api
        return p1 + p2.toLowerCase();
      }
    });
    
    // If already in PascalCase after acronym handling, return
    if (/^[A-Z][a-zA-Z0-9]*$/.test(result) && !result.includes('_') && !result.includes(' ')) {
      return result;
    }
    
    // Replace non-word characters (except underscore) with spaces
    const normalized = result.replace(/[^\w_]+/g, ' ');
    
    // Split by spaces and underscores
    const words = normalized.split(/[\s_]+/).filter(word => word.length > 0);
    
    // Capitalize first letter of each word and join
    return words.map(word => {
      // If the word is already mixed case, keep its casing
      if (/[a-z]/.test(word) && /[A-Z]/.test(word)) {
        return word.charAt(0).toUpperCase() + word.slice(1);
      }
      // Otherwise capitalize first letter, rest lowercase
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    }).join('');
  }

  /**
   * Convert to snake_case for file names
   */
  static toSnakeCase(str: string): string {
    // Handle camelCase and PascalCase by inserting underscores
    let result = str
      // Special handling for V2Dto, V2Meta patterns - add underscore before Dto/Meta that follows V2
      .replace(/V2(Dto|Meta)/g, 'V2_$1')
      // Insert underscore before uppercase letters that follow lowercase letters
      .replace(/([a-z])([A-Z])/g, '$1_$2')
      // Insert underscore before uppercase letters that follow numbers
      .replace(/([0-9])([A-Z])/g, '$1_$2')
      // Handle sequences of uppercase letters followed by lowercase (e.g., XMLHttp -> XML_Http)
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2');
    
    // Convert to lowercase and clean up
    return result
      .toLowerCase()
      .replace(/\s+/g, '_')  // Replace spaces with underscores
      .replace(/[^\w]+/g, '_')  // Replace non-word characters with underscores
      .replace(/^_+/, '')  // Remove leading underscores
      .replace(/_+/g, '_')  // Replace multiple underscores with single
      .replace(/_+$/, '');  // Remove trailing underscores
  }

  /**
   * Convert to PascalCase
   */
  static toPascalCase(str: string): string {
    return str
      .replace(/[-_\s]+(.)?/g, (_, char) => char ? char.toUpperCase() : '')
      .replace(/^(.)/, (_, char) => char.toUpperCase());
  }

  /**
   * Get Dart imports needed for a type
   */
  static getImportsForType(type: string): string[] {
    const imports: string[] = [];

    if (type.includes('DateTime')) {
      // DateTime is built-in, no import needed
    }

    if (type.includes('Uint8List')) {
      imports.push('dart:typed_data');
    }

    return imports;
  }

  /**
   * Check if type needs JSON serialization annotation
   */
  static needsJsonAnnotation(schema: SchemaObject, propertyName: string): boolean {
    // Check if property name differs from JSON key
    const dartName = this.toDartPropertyName(propertyName);
    
    // Need annotation if names are different or if it's a DateTime
    if (dartName !== propertyName) {
      return true;
    }

    const type = this.mapType(schema);
    if (type === 'DateTime') {
      return true;
    }

    return false;
  }

  /**
   * Generate JsonKey annotation
   */
  static generateJsonKeyAnnotation(schema: SchemaObject, propertyName: string): string | null {
    if (!this.needsJsonAnnotation(schema, propertyName)) {
      return null;
    }

    const annotations: string[] = [];
    const dartName = this.toDartPropertyName(propertyName);

    // Add name annotation if different
    if (dartName !== propertyName) {
      annotations.push(`name: '${propertyName}'`);
    }

    if (annotations.length > 0) {
      return `@JsonKey(${annotations.join(', ')})`;
    }

    return null;
  }

  /**
   * Generate default value for a type
   */
  static getDefaultValue(schema: SchemaObject): string | null {
    if ('$ref' in schema) {
      return null;
    }
    
    const nonRefSchema = schema as OpenAPIV3.SchemaObject;
    
    if (nonRefSchema.default !== undefined) {
      const type = this.mapType(schema);
      
      if (type === 'String') {
        return `'${nonRefSchema.default}'`;
      }
      
      if (type === 'int' || type === 'double') {
        return String(nonRefSchema.default);
      }
      
      if (type === 'bool') {
        return String(nonRefSchema.default);
      }

      if (type.startsWith('List')) {
        return 'const []';
      }

      if (type.startsWith('Map')) {
        return 'const {}';
      }
    }

    return null;
  }

  /**
   * Check if a schema is using oneOf pattern for nullable types
   * Both patterns are valid in OpenAPI 3.0:
   * 1. nullable: true (recommended in OpenAPI 3.0.x)
   * 2. oneOf: [{type: "string"}, {type: "null"}] (valid, especially for complex nullable unions)
   */
  static isNullableOneOf(schema: OpenAPIV3.SchemaObject): boolean {
    if (!schema.oneOf || !Array.isArray(schema.oneOf) || schema.oneOf.length !== 2) {
      return false;
    }
    
    // Check if one of the schemas is null type
    const hasNull = schema.oneOf.some((s: any) => 
      s && typeof s === 'object' && s.type === 'null'
    );
    
    // Check if the other schema is a non-null type
    const hasNonNull = schema.oneOf.some((s: any) => 
      s && typeof s === 'object' && (
        (s.type && s.type !== 'null') || 
        s.$ref
      )
    );
    
    return hasNull && hasNonNull;
  }

  /**
   * Extract the non-null type from a nullable oneOf pattern
   */
  static getNonNullTypeFromOneOf(schema: OpenAPIV3.SchemaObject): SchemaObject {
    if (!schema.oneOf || !this.isNullableOneOf(schema)) {
      return schema;
    }

    // Find the non-null schema (could be a type or a $ref)
    // We want schemas that either have a $ref OR have a type that's not 'null'
    const nonNullSchema = schema.oneOf.find((s: any) =>
      s && typeof s === 'object' && (s.$ref || (s.type && s.type !== 'null'))
    );

    return nonNullSchema || { type: 'string' };
  }

  /**
   * Check if a schema is nullable (either via nullable: true or oneOf pattern)
   */
  static isNullable(schema: SchemaObject): boolean {
    if (!schema || typeof schema !== 'object') {
      return true; // Treat null/undefined as nullable
    }
    if ('$ref' in schema) {
      return false;
    }
    
    const nonRefSchema = schema as OpenAPIV3.SchemaObject;
    
    // Check OpenAPI 3.0 nullable property
    if (nonRefSchema.nullable === true) {
      return true;
    }
    
    // Check OpenAPI 3.1 type array pattern (e.g., type: ["string", "null"])
    if (Array.isArray(nonRefSchema.type)) {
      const types = nonRefSchema.type as string[];
      return types.includes('null');
    }
    
    // Check oneOf pattern for nullable
    if (this.isNullableOneOf(nonRefSchema)) {
      return true;
    }
    
    // Check anyOf pattern for nullable
    if (nonRefSchema.anyOf && Array.isArray(nonRefSchema.anyOf)) {
      return nonRefSchema.anyOf.some((s: any) => s && s.type === 'null');
    }
    
    return false;
  }

  /**
   * Get base type from nullable schema
   */
  static getBaseTypeFromNullable(schema: SchemaObject): SchemaObject {
    if ('$ref' in schema) {
      return schema;
    }
    
    const nonRefSchema = schema as OpenAPIV3.SchemaObject;
    
    // If using oneOf nullable pattern, extract the non-null type
    if (this.isNullableOneOf(nonRefSchema)) {
      return this.getNonNullTypeFromOneOf(nonRefSchema);
    }
    
    // Otherwise return the schema as-is (nullable flag will be handled separately)
    return schema;
  }
}