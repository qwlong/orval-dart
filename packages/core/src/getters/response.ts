/**
 * Response handling - aligned with Orval structure
 * Processes API responses and generates Dart types
 */

import { OpenAPIV3 } from 'openapi-types';
import { TypeMapper } from '../utils/type-mapper';

export interface ResponseInfo {
  statusCode: string;
  type: string;
  description?: string;
  contentType: string;
  imports: string[];
  isSuccess: boolean;
  isError: boolean;
  nullable?: boolean;
}

export interface GroupedResponses {
  success: ResponseInfo[];
  errors: ResponseInfo[];
  defaultResponse?: ResponseInfo;
}

export interface ResponseResult {
  successType: string;
  errorType: string;
  imports: string[];
  responses: ResponseInfo[];
  grouped: GroupedResponses;
  hasMultipleSuccessTypes: boolean;
  hasMultipleErrorTypes: boolean;
}

/**
 * Process responses and generate types
 */
export function getResponse(
  responses: OpenAPIV3.ResponsesObject,
  operationName: string,
  _context?: any
): ResponseResult {
  const allResponses: ResponseInfo[] = [];
  const imports: string[] = [];
  
  // Process each response
  Object.entries(responses).forEach(([statusCode, response]) => {
    if ('$ref' in response) {
      // Handle reference
      const refName = extractRefName(response.$ref);
      imports.push(`models/${toSnakeCase(refName)}.f.dart`);
      
      allResponses.push({
        statusCode,
        type: refName,
        contentType: 'application/json',
        imports: [`models/${toSnakeCase(refName)}.f.dart`],
        isSuccess: isSuccessCode(statusCode),
        isError: isErrorCode(statusCode)
      });
    } else {
      // Direct response object
      const responseInfo = processResponse(statusCode, response, operationName);
      allResponses.push(responseInfo);
      imports.push(...responseInfo.imports);
    }
  });
  
  // Group responses
  const grouped = groupResponses(allResponses);
  
  // Determine success and error types
  const successTypes = [...new Set(grouped.success.map(r => r.type))];
  const errorTypes = [...new Set(grouped.errors.map(r => r.type))];
  
  const successType = successTypes.length === 0 
    ? 'void'
    : successTypes.length === 1 
    ? successTypes[0]
    : successTypes.join(' | '); // For Dart, might need a wrapper
  
  const errorType = errorTypes.length === 0
    ? 'void'
    : errorTypes.length === 1
    ? errorTypes[0]
    : 'dynamic'; // For errors, might use a base error type
  
  return {
    successType,
    errorType,
    imports: [...new Set(imports)],
    responses: allResponses,
    grouped,
    hasMultipleSuccessTypes: successTypes.length > 1,
    hasMultipleErrorTypes: errorTypes.length > 1
  };
}

/**
 * Process a single response
 */
function processResponse(
  statusCode: string,
  response: OpenAPIV3.ResponseObject,
  operationName: string
): ResponseInfo {
  const imports: string[] = [];
  let type = 'void';
  let contentType = 'application/json';
  
  // Check for response content
  if (response.content) {
    // Prefer JSON response
    if (response.content['application/json']) {
      contentType = 'application/json';
      const mediaType = response.content['application/json'];
      
      if (mediaType.schema) {
        const typeInfo = getResponseType(mediaType.schema, operationName);
        type = typeInfo.type;
        imports.push(...typeInfo.imports);
      }
    } else if (response.content['text/plain']) {
      contentType = 'text/plain';
      type = 'String';
    } else if (response.content['text/html']) {
      contentType = 'text/html';
      type = 'String';
    } else if (response.content['application/octet-stream']) {
      contentType = 'application/octet-stream';
      type = 'Uint8List';
      imports.push('dart:typed_data');
    } else if (response.content['image/png'] || 
               response.content['image/jpeg'] || 
               response.content['image/gif']) {
      contentType = Object.keys(response.content)[0];
      type = 'Uint8List';
      imports.push('dart:typed_data');
    } else {
      // Take the first content type
      const firstContentType = Object.keys(response.content)[0];
      if (firstContentType) {
        contentType = firstContentType;
        const mediaType = response.content[firstContentType];
        
        if (mediaType.schema) {
          const typeInfo = getResponseType(mediaType.schema, operationName);
          type = typeInfo.type;
          imports.push(...typeInfo.imports);
        }
      }
    }
  }
  
  // Handle 204 No Content
  if (statusCode === '204') {
    type = 'void';
  }
  
  return {
    statusCode,
    type,
    description: response.description,
    contentType,
    imports,
    isSuccess: isSuccessCode(statusCode),
    isError: isErrorCode(statusCode)
  };
}

/**
 * Get type from response schema
 */
function getResponseType(
  schema: OpenAPIV3.ReferenceObject | OpenAPIV3.SchemaObject,
  operationName: string
): { type: string; imports: string[]; nullable?: boolean } {
  const imports: string[] = [];

  if ('$ref' in schema) {
    const refName = extractRefName(schema.$ref);
    imports.push(`models/${toSnakeCase(refName)}.f.dart`);
    return { type: refName, imports };
  }

  // Check for oneOf nullable pattern (e.g., oneOf: [Type, null])
  if (schema.oneOf && TypeMapper.isNullableOneOf(schema)) {
    const nonNullSchema = TypeMapper.getNonNullTypeFromOneOf(schema);
    const baseTypeInfo = getResponseType(nonNullSchema, operationName);
    // Mark as nullable by adding ? to the type
    const nullableType = TypeMapper.toNullable(baseTypeInfo.type);
    return {
      type: nullableType,
      imports: baseTypeInfo.imports,
      nullable: true
    };
  }

  // Check for anyOf nullable pattern
  if (schema.anyOf && Array.isArray(schema.anyOf) && schema.anyOf.length === 2) {
    const hasNull = schema.anyOf.some((s: any) => s && typeof s === 'object' && s.type === 'null');
    const nonNullSchema = schema.anyOf.find((s: any) => s && typeof s === 'object' && s.type !== 'null');

    if (hasNull && nonNullSchema) {
      const baseTypeInfo = getResponseType(nonNullSchema as any, operationName);
      const nullableType = TypeMapper.toNullable(baseTypeInfo.type);
      return {
        type: nullableType,
        imports: baseTypeInfo.imports,
        nullable: true
      };
    }
  }

  // Handle inline schema
  switch (schema.type) {
    case 'object':
      if (schema.properties) {
        // Could generate inline response type
        const typeName = `${toPascalCase(operationName)}Response`;
        // TODO: Generate inline model
        return { type: typeName, imports };
      }
      return { type: 'Map<String, dynamic>', imports };

    case 'array':
      if (schema.items) {
        const itemType = getResponseType(schema.items, operationName);
        imports.push(...itemType.imports);
        return { type: `List<${itemType.type}>`, imports };
      }
      return { type: 'List<dynamic>', imports };

    case 'string':
      if (schema.format === 'binary') {
        imports.push('dart:typed_data');
        return { type: 'Uint8List', imports };
      }
      return { type: 'String', imports };

    case 'integer':
      return { type: 'int', imports };

    case 'number':
      return { type: 'double', imports };

    case 'boolean':
      return { type: 'bool', imports };

    default:
      return { type: 'dynamic', imports };
  }
}

/**
 * Group responses by success/error
 */
function groupResponses(responses: ResponseInfo[]): GroupedResponses {
  const grouped: GroupedResponses = {
    success: [],
    errors: []
  };
  
  responses.forEach(response => {
    if (response.statusCode === 'default') {
      grouped.defaultResponse = response;
    } else if (response.isSuccess) {
      grouped.success.push(response);
    } else {
      grouped.errors.push(response);
    }
  });
  
  return grouped;
}

/**
 * Check if status code represents success
 */
function isSuccessCode(statusCode: string): boolean {
  if (statusCode === 'default') return false;
  const code = parseInt(statusCode);
  return !isNaN(code) && code >= 200 && code < 300;
}

/**
 * Check if status code represents error
 */
function isErrorCode(statusCode: string): boolean {
  if (statusCode === 'default') return true;
  const code = parseInt(statusCode);
  return !isNaN(code) && code >= 400;
}

/**
 * Extract name from $ref
 */
function extractRefName(ref: string): string {
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
 * Convert to PascalCase
 */
function toPascalCase(str: string): string {
  if (str.includes('_')) {
    return str.split('_').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    ).join('');
  }
  if (str.includes('-')) {
    return str.split('-').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    ).join('');
  }
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Generate response handling code
 */
export function generateResponseHandling(
  response: ResponseResult,
  options?: {
    throwOnError?: boolean;
    wrapInResult?: boolean;
  }
): string {
  if (options?.wrapInResult) {
    // Generate Result<Success, Error> type handling
    return `Result<${response.successType}, ${response.errorType}>`;
  }
  
  // Simple response type
  return response.successType;
}

/**
 * Check if response is binary (file download)
 */
export function isBinaryResponse(response: ResponseInfo): boolean {
  return response.type === 'Uint8List' || 
         response.contentType.startsWith('image/') ||
         response.contentType === 'application/octet-stream' ||
         response.contentType === 'application/pdf';
}

/**
 * Check if response is void (no content)
 */
export function isVoidResponse(response: ResponseInfo): boolean {
  return response.type === 'void' || response.statusCode === '204';
}