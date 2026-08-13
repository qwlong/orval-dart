/**
 * Enum handling utilities - aligned with Orval structure
 * Extracts and processes enum data from OpenAPI schemas
 */

import { OpenAPIV3 } from 'openapi-types';

export interface EnumValue {
  name: string;
  value: string | number | boolean | null;
  description?: string;
}

export interface EnumData {
  name: string;
  values: EnumValue[];
  description?: string;
  isString?: boolean;
  isNumeric?: boolean;
}

/**
 * Check if a schema represents an enum
 */
export function isEnum(schema: OpenAPIV3.SchemaObject): boolean {
  return Boolean(schema.enum && Array.isArray(schema.enum) && schema.enum.length > 0);
}

/**
 * Extract enum values from schema
 */
export function getEnumValues(schema: OpenAPIV3.SchemaObject): (string | number | null)[] {
  if (!isEnum(schema)) {
    return [];
  }
  return schema.enum || [];
}

/**
 * Dart reserved words, which cannot be used as identifiers at all
 */
const DART_RESERVED_WORDS = new Set([
  'assert', 'break', 'case', 'catch', 'class', 'const', 'continue', 'default',
  'do', 'else', 'enum', 'extends', 'false', 'final', 'finally', 'for', 'if',
  'in', 'is', 'new', 'null', 'rethrow', 'return', 'super', 'switch', 'this',
  'throw', 'true', 'try', 'var', 'void', 'while', 'with'
]);

/**
 * Names an enum cannot declare: `values` is generated for every enum, `index`
 * comes from Enum, and the rest are inherited from Object. Declaring any of
 * them is a conflicting_static_and_instance error. `name` and `compareTo` are
 * fine - those come from an extension and from Comparable.
 */
const ENUM_MEMBER_CONFLICTS = new Set([
  'values', 'index', 'hashCode', 'runtimeType', 'toString', 'noSuchMethod'
]);

/**
 * Build a Dart enum member name for a numeric value.
 *
 * `String(value)` is canonical for JS numbers, so distinct values keep
 * distinct names. The sign and the decimal point have to survive sanitizing:
 * stripped, `1.5` lands on integer `15` and `-1` loses its sign.
 */
export function numericEnumMemberName(value: number): string {
  const encoded = String(value)
    .replace(/-/g, 'Minus')
    .replace(/\./g, 'Point')
    .replace(/\+/g, 'Plus');

  return `value${encoded.charAt(0).toUpperCase()}${encoded.slice(1)}`;
}

/**
 * Reduce an arbitrary string value to a camelCase Dart identifier.
 * The result can still be empty or otherwise illegal - legalize it after.
 */
export function sanitizeEnumMemberName(value: string): string {
  const sanitized = value
    .replace(/[^a-zA-Z0-9_]/g, '_')  // Replace non-alphanumeric with underscore
    .replace(/_+/g, '_')              // Replace multiple underscores with single
    .replace(/^_+|_+$/g, '');         // Remove leading/trailing underscores

  const parts = sanitized.split('_');
  const camelCased = parts[0].toLowerCase() + parts.slice(1).map(p =>
    p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()
  ).join('');

  // Ensure it doesn't start with uppercase
  return camelCased.charAt(0).match(/[A-Z]/)
    ? camelCased.charAt(0).toLowerCase() + camelCased.slice(1)
    : camelCased;
}

/**
 * Turn a name Dart would reject into one it accepts. Sanitizing can empty a
 * name out entirely, leave it starting with a digit, or land it on a keyword
 * or on a member every enum already declares.
 */
export function legalizeEnumMemberName(name: string): string {
  const needsPrefix =
    name === '' ||
    /^\d/.test(name) ||
    DART_RESERVED_WORDS.has(name) ||
    ENUM_MEMBER_CONFLICTS.has(name);

  return needsPrefix
    ? `value${name.charAt(0).toUpperCase()}${name.slice(1)}`
    : name;
}

/**
 * Distinct enum values can still reduce to the same legal identifier -
 * `'Active'` and `'active'`, anything differing only in characters sanitizing
 * drops. Suffix the later ones so the enum compiles.
 *
 * Which value keeps the unsuffixed name follows the order they appear in the
 * spec, so reordering them renames members. Unavoidable without inventing
 * names from the values themselves, but worth knowing before reshuffling an
 * enum.
 */
export function uniqueEnumMemberName(name: string, usedNames: Set<string>): string {
  let unique = name;
  let suffix = 2;
  while (usedNames.has(unique)) {
    unique = `${name}${suffix}`;
    suffix++;
  }

  usedNames.add(unique);
  return unique;
}

/**
 * Convert enum value to valid Dart identifier.
 *
 * Names are not guaranteed unique on their own - run the result through
 * uniqueEnumMemberName when building a whole enum.
 */
export function enumValueToDartName(value: string | number | boolean | null): string {
  if (value === null || value === 'null') {
    return 'nullValue';
  }

  if (value === '') {
    return 'empty';
  }

  const baseName = typeof value === 'number'
    ? numericEnumMemberName(value)
    : sanitizeEnumMemberName(String(value));

  return legalizeEnumMemberName(baseName);
}

/**
 * Build the member list for an enum: one member per distinct value, each named
 * legally and uniquely within the enum.
 *
 * A null value gets no member. json_serializable decodes a null source to Dart
 * null without consulting the value map, so the member would be unreachable
 * through fromJson.
 *
 * Repeated values get one member between them. YAML parses `[1.0, 1]` and
 * `[0, -0]` to a single number each, and two members sharing a @JsonValue would
 * make the generated map ambiguous.
 */
export function buildEnumMembers(values: (string | number | boolean | null)[]): EnumValue[] {
  const seenValues = new Set<string | number | boolean>();
  const usedNames = new Set<string>();

  return values
    .filter(value => {
      if (value === null || seenValues.has(value)) {
        return false;
      }
      seenValues.add(value);
      return true;
    })
    .map(value => ({
      name: uniqueEnumMemberName(enumValueToDartName(value), usedNames),
      value,
      description: value === '' ? 'Empty string' : undefined
    }));
}

/**
 * Process enum schema into structured data
 */
export function getEnumData(
  name: string,
  schema: OpenAPIV3.SchemaObject
): EnumData | null {
  if (!isEnum(schema)) {
    return null;
  }
  
  // Could be extended with x-enum-descriptions
  const rawValues = getEnumValues(schema);
  const values: EnumValue[] = buildEnumMembers(rawValues);
  
  // Determine enum type
  const isString = rawValues.every(v => typeof v === 'string' || v === null);
  const isNumeric = rawValues.every(v => typeof v === 'number' || v === null);
  
  return {
    name,
    values,
    description: schema.description,
    isString,
    isNumeric
  };
}

/**
 * Get enum descriptions from x-enum-descriptions extension
 */
export function getEnumDescriptions(schema: OpenAPIV3.SchemaObject): Record<string, string> {
  const descriptions: Record<string, string> = {};
  
  // Check for x-enum-descriptions extension
  const xEnumDescriptions = (schema as any)['x-enum-descriptions'];
  if (xEnumDescriptions) {
    const enumDescriptions = xEnumDescriptions as Record<string, string>;
    Object.entries(enumDescriptions).forEach(([key, desc]) => {
      descriptions[key] = desc;
    });
  }
  
  // Check for x-enumNames (alternative format)
  const xEnumNames = (schema as any)['x-enumNames'];
  if (xEnumNames && Array.isArray(xEnumNames)) {
    const enumValues = getEnumValues(schema);
    const enumNames = xEnumNames as string[];
    enumValues.forEach((value, index) => {
      if (enumNames[index]) {
        descriptions[String(value)] = enumNames[index];
      }
    });
  }
  
  return descriptions;
}

/**
 * Generate Dart enum implementation
 */
export function getEnumImplementation(data: EnumData): string {
  // This returns the Dart code structure, not the actual template rendering
  // Template rendering should be done by the generator
  const enumValues = data.values.map(v => ({
    name: v.name,
    value: v.value,
    jsonValue: JSON.stringify(v.value)
  }));
  
  return JSON.stringify({
    enumName: data.name,
    description: data.description,
    values: enumValues
  });
}

/**
 * Check if a schema is a nullable enum
 */
export function isNullableEnum(schema: OpenAPIV3.SchemaObject): boolean {
  return isEnum(schema) && (
    schema.nullable === true ||
    Boolean(schema.enum && schema.enum.includes(null))
  );
}