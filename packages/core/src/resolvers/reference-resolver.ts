/**
 * Utility for resolving $ref references in OpenAPI specifications
 */

import type { OpenAPIV3 } from 'openapi-types';
import { TypeMapper } from '../utils';

export class ReferenceResolver {
  private readonly spec: OpenAPIV3.Document;
  
  constructor(spec: OpenAPIV3.Document) {
    this.spec = spec;
  }
  
  /**
   * Extract model name from a $ref string
   * Example: "#/components/schemas/LocationSettingsResponseDto" -> "LocationSettingsResponseDto"
   */
  static extractModelNameFromRef(ref: string): string {
    const parts = ref.split('/');
    const modelName = parts[parts.length - 1];
    return TypeMapper.toDartClassName(modelName);
  }
  
  /**
   * Check if a schema is a reference
   */
  static isReference(schema: any): schema is OpenAPIV3.ReferenceObject {
    return schema && typeof schema === 'object' && '$ref' in schema;
  }
  
  /**
   * Resolve a reference to its actual schema
   */
  resolveReference(ref: string): OpenAPIV3.SchemaObject | null {
    // Parse the reference path
    // Format: #/components/schemas/ModelName
    if (!ref.startsWith('#/')) {
      console.warn(`External references not supported: ${ref}`);
      return null;
    }
    
    const parts = ref.substring(2).split('/'); // Remove '#/' and split
    let current: any = this.spec;
    
    for (const part of parts) {
      if (!current || typeof current !== 'object') {
        return null;
      }
      current = current[part];
    }
    
    // If the resolved value is itself a reference, resolve it recursively
    if (ReferenceResolver.isReference(current)) {
      return this.resolveReference(current.$ref);
    }
    
    return current as OpenAPIV3.SchemaObject;
  }
  
  /**
   * Get the Dart type for a schema (handles both direct schemas and references)
   */
  getDartType(schema: OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject): string {
    if (ReferenceResolver.isReference(schema)) {
      // This is a reference to a model
      return ReferenceResolver.extractModelNameFromRef(schema.$ref);
    }
    
    // Direct schema - use TypeMapper
    const schemaObj = schema as OpenAPIV3.SchemaObject;
    
    // Handle arrays
    if (schemaObj.type === 'array' && schemaObj.items) {
      const itemType = this.getDartType(schemaObj.items);
      return `List<${itemType}>`;
    }
    
    // Handle objects with title (models)
    if (schemaObj.type === 'object' && schemaObj.title) {
      return TypeMapper.toDartClassName(schemaObj.title);
    }
    
    // Use TypeMapper for primitive types
    return TypeMapper.mapType(schemaObj);
  }
  
  // TODO: These methods may be needed for future functionality
  // Keeping them commented out to avoid unused warnings
  /*
  /**
   * Get response type from an operation
   * @internal May be used by other modules
   */
  /*
  _getResponseType(operation: OpenAPIV3.OperationObject): string {
    const responses = operation.responses;
    if (!responses) {
      return 'void';
    }
    
    // Check for successful response codes
    const successCodes = ['200', '201', '202', '204'];
    for (const code of successCodes) {
      const response = responses[code];
      if (!response) continue;
      
      // Handle reference responses
      if (ReferenceResolver.isReference(response)) {
        const resolved = this.resolveReference(response.$ref);
        if (resolved && (resolved as any).content?.['application/json']?.schema) {
          return this.getDartType((resolved as any).content['application/json'].schema);
        }
        continue;
      }
      
      // Handle direct response objects
      const responseObj = response as OpenAPIV3.ResponseObject;
      if (responseObj.content?.['application/json']?.schema) {
        return this.getDartType(responseObj.content['application/json'].schema);
      }
    }
    
    // Check default response
    if (responses.default) {
      if (ReferenceResolver.isReference(responses.default)) {
        const resolved = this.resolveReference(responses.default.$ref);
        if (resolved && (resolved as any).content?.['application/json']?.schema) {
          return this.getDartType((resolved as any).content['application/json'].schema);
        }
      } else {
        const defaultResponse = responses.default as OpenAPIV3.ResponseObject;
        if (defaultResponse.content?.['application/json']?.schema) {
          return this.getDartType(defaultResponse.content['application/json'].schema);
        }
      }
    }
    
    return 'dynamic';
  }
  */
  
  /**
   * Get request body type from an operation
   * @internal May be used by other modules
   */
  /*
  _getRequestBodyType(operation: OpenAPIV3.OperationObject): string | null {
    if (!operation.requestBody) {
      return null;
    }
    
    let requestBody: OpenAPIV3.RequestBodyObject;
    
    if (ReferenceResolver.isReference(operation.requestBody)) {
      const resolved = this.resolveReference(operation.requestBody.$ref);
      if (!resolved) {
        return null;
      }
      requestBody = resolved as unknown as OpenAPIV3.RequestBodyObject;
    } else {
      requestBody = operation.requestBody as OpenAPIV3.RequestBodyObject;
    }
    
    // Check for JSON content
    if (requestBody.content?.['application/json']?.schema) {
      return this.getDartType(requestBody.content['application/json'].schema);
    }
    
    // Check for form data
    if (requestBody.content?.['multipart/form-data']?.schema) {
      return 'FormData';
    }
    
    // Check for URL encoded
    if (requestBody.content?.['application/x-www-form-urlencoded']?.schema) {
      return 'FormData';
    }
    
    return null;
  }
  */
  
  /**
   * Generic resolve method that resolves any $ref in the spec
   */
  resolve(obj: any): any {
    if (!obj || typeof obj !== 'object') {
      return obj;
    }
    
    if (ReferenceResolver.isReference(obj)) {
      const resolved = this.resolveReference(obj.$ref);
      // Always return the original object if reference can't be resolved
      return resolved || obj;
    }
    
    return obj;
  }
  
  /**
   * Deep resolve that handles nested references
   */
  resolveDeep(obj: any, visited: Set<string> = new Set()): any {
    if (!obj || typeof obj !== 'object') {
      return obj;
    }
    
    if (ReferenceResolver.isReference(obj)) {
      if (visited.has(obj.$ref)) {
        // Circular reference detected
        return { $ref: obj.$ref };
      }
      visited.add(obj.$ref);
      const resolved = this.resolveReference(obj.$ref);
      return resolved ? this.resolveDeep(resolved, visited) : null;
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.resolveDeep(item, visited));
    }
    
    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      if (key === 'allOf' && Array.isArray(value)) {
        // Special handling for allOf - merge the schemas
        const merged = this.mergeAllOf(value);
        Object.assign(result, this.resolveDeep(merged, visited));
      } else {
        result[key] = this.resolveDeep(value, visited);
      }
    }
    return result;
  }
  
  /**
   * Get model type from a schema
   */
  getModelType(schema: any, nullable: boolean = true): string {
    const type = this.getDartType(schema);
    return nullable ? type : TypeMapper.toNullable(type);
  }
  
  /**
   * Get imports needed for a schema
   */
  getImports(schema: any): string[] {
    const imports: Set<string> = new Set();
    
    const addImportsForType = (s: any) => {
      if (!s || typeof s !== 'object') {
        return;
      }
      
      if (ReferenceResolver.isReference(s)) {
        const modelName = ReferenceResolver.extractModelNameFromRef(s.$ref);
        const fileName = TypeMapper.toSnakeCase(modelName);
        
        // Check if it's an enum
        const resolved = this.resolveReference(s.$ref);
        if (resolved && (resolved as OpenAPIV3.SchemaObject).enum) {
          imports.add(`${fileName}.dart`);
        } else {
          imports.add(`${fileName}.f.dart`);
        }
      } else if ((s as OpenAPIV3.SchemaObject)?.type === 'array' && (s as OpenAPIV3.ArraySchemaObject).items) {
        addImportsForType((s as OpenAPIV3.ArraySchemaObject).items);
      } else if ((s as OpenAPIV3.SchemaObject)?.type === 'string' && (s as OpenAPIV3.SchemaObject).format === 'binary') {
        imports.add('dart:typed_data');
      } else if ((s as OpenAPIV3.SchemaObject)?.type === 'object' && (s as OpenAPIV3.SchemaObject).properties) {
        // Check properties for imports
        for (const prop of Object.values((s as OpenAPIV3.SchemaObject).properties!)) {
          addImportsForType(prop);
        }
      }
    };
    
    if (Array.isArray(schema)) {
      schema.forEach(addImportsForType);
    } else {
      addImportsForType(schema);
    }
    
    return Array.from(imports);
  }
  
  /**
   * Check if a reference creates a circular dependency
   */
  isCircularReference(ref: string, path: string[] = []): boolean {
    // Simple check: if the reference is already in the path, it's circular
    return path.includes(ref);
  }
  
  /**
   * Merge allOf schemas into a single schema
   */
  mergeAllOf(schemaOrArray: any): OpenAPIV3.SchemaObject {
    // Handle both array and object with allOf property
    const schemas = Array.isArray(schemaOrArray) ? schemaOrArray : (schemaOrArray?.allOf || []);
    
    const merged: OpenAPIV3.SchemaObject = {
      type: 'object',
      properties: {},
      required: []
    };
    
    for (const schema of schemas) {
      let resolved: OpenAPIV3.SchemaObject;
      
      if (ReferenceResolver.isReference(schema)) {
        const r = this.resolveReference(schema.$ref);
        if (!r) continue;
        resolved = r;
      } else {
        resolved = schema;
      }
      
      // Merge properties
      if (resolved.properties) {
        merged.properties = { ...merged.properties, ...resolved.properties };
      }
      
      // Merge required arrays
      if (resolved.required) {
        merged.required = [...new Set([...(merged.required || []), ...resolved.required])];
      }
      
      // Merge other properties
      if (resolved.description && !merged.description) {
        merged.description = resolved.description;
      }
    }
    
    return merged;
  }
  
  /**
   * Get schema name from a reference
   */
  getSchemaName(ref: any): string | null {
    if (!ref || typeof ref !== 'string') {
      if (ReferenceResolver.isReference(ref)) {
        return this.getSchemaName(ref.$ref);
      }
      return null;
    }
    
    if (!ref.startsWith('#/components/schemas/')) {
      return null;
    }
    
    const parts = ref.split('/');
    return parts[parts.length - 1] || null;
  }

  /**
   * Helper method to recursively collect imports from a schema
   * This handles nested arrays (List<List<Model>>) and complex types
   */
  private collectImportsFromSchema(schema: any, imports: string[]): void {
    if (!schema || typeof schema !== 'object') {
      return;
    }

    // Handle $ref - add import for the referenced model
    if (ReferenceResolver.isReference(schema)) {
      const modelName = this.getSchemaName(schema.$ref);
      if (modelName) {
        const fileName = TypeMapper.toSnakeCase(modelName);
        const importPath = `${fileName}.f.dart`;
        // Only add if not already present
        if (!imports.includes(importPath)) {
          imports.push(importPath);
        }
      }
      return;
    }

    const schemaObj = schema as OpenAPIV3.SchemaObject;

    // Handle array types - recursively process items
    if (schemaObj.type === 'array' && schemaObj.items) {
      this.collectImportsFromSchema(schemaObj.items, imports);
      return;
    }

    // Handle object with additionalProperties (Map<String, T>)
    if (schemaObj.type === 'object' && schemaObj.additionalProperties) {
      if (typeof schemaObj.additionalProperties === 'object') {
        this.collectImportsFromSchema(schemaObj.additionalProperties, imports);
      }
      return;
    }

    // Handle oneOf/anyOf - collect imports from all branches
    if (schemaObj.oneOf) {
      for (const subSchema of schemaObj.oneOf) {
        this.collectImportsFromSchema(subSchema, imports);
      }
      return;
    }

    if (schemaObj.anyOf) {
      for (const subSchema of schemaObj.anyOf) {
        this.collectImportsFromSchema(subSchema, imports);
      }
      return;
    }

    // Handle allOf - collect imports from all branches
    if (schemaObj.allOf) {
      for (const subSchema of schemaObj.allOf) {
        this.collectImportsFromSchema(subSchema, imports);
      }
      return;
    }
  }

  /**
   * Resolve property type and its imports
   */
  resolvePropertyType(propSchema: any, isRequired: boolean): { type: string; imports: string[] } {
    const imports: string[] = [];
    let type: string;
    
    // Handle allOf composition in property
    if (propSchema && propSchema.allOf) {
      // If allOf has a single $ref, treat it as a direct reference
      if (propSchema.allOf.length === 1 && propSchema.allOf[0].$ref) {
        const modelName = this.getSchemaName(propSchema.allOf[0].$ref);
        if (modelName) {
          const className = TypeMapper.toDartClassName(modelName);
          const fileName = TypeMapper.toSnakeCase(modelName);
          imports.push(`${fileName}.f.dart`);
          type = className;
          
          // Add nullable if not required
          if (!isRequired) {
            type = TypeMapper.toNullable(type);
          }
        } else {
          type = 'dynamic';
        }
      } else {
        // Complex allOf - for now use dynamic
        // TODO: Implement proper allOf merging
        type = 'dynamic';
      }
    }
    // Handle oneOf/anyOf composition in property
    else if (propSchema && (propSchema.oneOf || propSchema.anyOf)) {
      const schemas = propSchema.oneOf || propSchema.anyOf;
      
      // Check if this is a nullable pattern (oneOf with type and null)
      if (schemas.length === 2) {
        const hasNull = schemas.some((s: any) => s.type === 'null');
        const nonNullSchema = schemas.find((s: any) => s.type !== 'null');
        
        if (hasNull && nonNullSchema) {
          // This is a nullable type pattern
          if (nonNullSchema.$ref) {
            const modelName = this.getSchemaName(nonNullSchema.$ref);
            if (modelName) {
              const className = TypeMapper.toDartClassName(modelName);
              const fileName = TypeMapper.toSnakeCase(modelName);
              imports.push(`${fileName}.f.dart`);
              type = TypeMapper.toNullable(className); // Already nullable due to oneOf with null
            } else {
              type = 'dynamic';
            }
          } else {
            // Regular schema that's nullable
            type = TypeMapper.toNullable(TypeMapper.mapType(nonNullSchema));
          }
        } else {
          // Complex oneOf/anyOf - use dynamic for now
          type = 'dynamic';
        }
      } else if (schemas.length === 1 && schemas[0].$ref) {
        // Single ref in oneOf/anyOf
        const modelName = this.getSchemaName(schemas[0].$ref);
        if (modelName) {
          const className = TypeMapper.toDartClassName(modelName);
          const fileName = TypeMapper.toSnakeCase(modelName);
          imports.push(`${fileName}.f.dart`);
          type = className;
          
          // Add nullable if not required
          if (!isRequired) {
            type = TypeMapper.toNullable(type);
          }
        } else {
          type = 'dynamic';
        }
      } else {
        // Complex oneOf/anyOf - use dynamic for now
        type = 'dynamic';
      }
    }
    else if (ReferenceResolver.isReference(propSchema)) {
      // Handle direct $ref
      const modelName = this.getSchemaName(propSchema.$ref);
      if (modelName) {
        const className = TypeMapper.toDartClassName(modelName);
        const fileName = TypeMapper.toSnakeCase(modelName);
        imports.push(`${fileName}.f.dart`);
        type = className;
        
        // Add nullable if not required
        if (!isRequired) {
          type = TypeMapper.toNullable(type);
        }
      } else {
        type = 'dynamic';
      }
    } else {
      // Handle regular schema
      const schema = propSchema as OpenAPIV3.SchemaObject;
      type = TypeMapper.mapType(schema);

      // Check if needs nullable
      const isNullable = TypeMapper.isNullable(schema);
      const hasDefault = schema && schema.default !== undefined;
      const needsNullable = (!isRequired && !hasDefault) || isNullable;

      if (needsNullable) {
        type = TypeMapper.toNullable(type);
      }

      // Check for special imports
      if (type.includes('Uint8List')) {
        imports.push('dart:typed_data');
      }

      // Handle array types - recursively process items
      if (schema.type === 'array' && schema.items) {
        this.collectImportsFromSchema(schema.items, imports);
      }
    }
    
    return { type, imports };
  }
}