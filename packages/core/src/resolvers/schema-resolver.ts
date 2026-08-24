/**
 * Schema resolver for handling complex OpenAPI schema structures
 */
import { TypeMapper } from '../utils/type-mapper';


export interface ResolvedSchema {
  type: 'object' | 'array' | 'primitive' | 'enum' | 'composition' | 'reference';
  dartType: string;
  imports: string[];
  nullable?: boolean;
  description?: string;
  properties?: Map<string, ResolvedProperty>;
  required?: string[];
  composition?: {
    type: 'oneOf' | 'anyOf' | 'allOf';
    schemas: any[];
    discriminator?: any;
  };
}

export interface ResolvedProperty {
  name: string;
  dartType: string;
  required: boolean;
  nullable: boolean;
  description?: string;
  defaultValue?: any;
  jsonKey?: string;
}

export class SchemaResolver {
  private schemas: Record<string, any>;
  private resolvedCache: Map<string, ResolvedSchema> = new Map();
  private resolvingStack: Set<string> = new Set(); // For circular reference detection

  constructor(schemas: Record<string, any>) {
    this.schemas = schemas;
  }

  /**
   * Resolve a schema to its Dart representation
   */
  resolve(schema: any, name?: string): ResolvedSchema {
    // Check cache first
    const cacheKey = name || JSON.stringify(schema);
    if (this.resolvedCache.has(cacheKey)) {
      return this.resolvedCache.get(cacheKey)!;
    }

    // Check for circular reference
    if (name && this.resolvingStack.has(name)) {
      return {
        type: 'reference',
        dartType: name,
        imports: [],
        description: 'Circular reference'
      };
    }

    if (name) {
      this.resolvingStack.add(name);
    }

    try {
      const resolved = this.resolveSchema(schema, name);
      this.resolvedCache.set(cacheKey, resolved);
      return resolved;
    } finally {
      if (name) {
        this.resolvingStack.delete(name);
      }
    }
  }

  /**
   * Internal schema resolution
   */
  private resolveSchema(schema: any, name?: string): ResolvedSchema {
    // Handle $ref
    if (schema.$ref) {
      return this.resolveReference(schema.$ref);
    }

    // Handle composition (oneOf, anyOf, allOf)
    if (schema.oneOf || schema.anyOf || schema.allOf) {
      return this.resolveComposition(schema, name);
    }

    // Handle enum
    if (schema.enum) {
      return this.resolveEnum(schema, name);
    }

    // Handle array
    if (schema.type === 'array') {
      return this.resolveArray(schema);
    }

    // Handle object
    if (schema.type === 'object' || schema.properties) {
      return this.resolveObject(schema, name);
    }

    // Handle primitives
    return this.resolvePrimitive(schema);
  }

  /**
   * Resolve a $ref reference
   */
  private resolveReference(ref: string): ResolvedSchema {
    const parts = ref.split('/');
    const schemaName = parts[parts.length - 1];
    
    // Look up the referenced schema
    const referencedSchema = this.schemas[schemaName];
    if (!referencedSchema) {
      return {
        type: 'reference',
        dartType: this.toDartClassName(schemaName),
        imports: [`${this.toSnakeCase(schemaName)}.dart`]
      };
    }

    // Resolve the referenced schema
    const resolved = this.resolve(referencedSchema, schemaName);
    
    // Override the dart type to use the reference name
    return {
      ...resolved,
      dartType: this.toDartClassName(schemaName),
      imports: [`${this.toSnakeCase(schemaName)}.dart`]
    };
  }

  /**
   * Resolve composition schemas (oneOf, anyOf, allOf)
   */
  private resolveComposition(schema: any, name?: string): ResolvedSchema {
    const compositionType = schema.oneOf ? 'oneOf' : 
                           schema.anyOf ? 'anyOf' : 'allOf';
    
    const schemas = schema[compositionType];
    const discriminator = schema.discriminator;
    
    return {
      type: 'composition',
      dartType: name ? this.toDartClassName(name) : 'dynamic',
      imports: [],
      composition: {
        type: compositionType,
        schemas,
        discriminator
      }
    };
  }

  /**
   * Resolve enum schema
   */
  private resolveEnum(schema: any, name?: string): ResolvedSchema {
    const enumName = name ? this.toDartClassName(name) : 'DynamicEnum';
    
    return {
      type: 'enum',
      dartType: enumName,
      imports: name ? [`${this.toSnakeCase(name)}.dart`] : [],
      description: schema.description
    };
  }

  /**
   * Resolve array schema
   */
  private resolveArray(schema: any): ResolvedSchema {
    if (!schema.items) {
      return {
        type: 'array',
        dartType: 'List<dynamic>',
        imports: []
      };
    }

    const itemResolved = this.resolve(schema.items);
    return {
      type: 'array',
      dartType: `List<${itemResolved.dartType}>`,
      imports: itemResolved.imports,
      nullable: schema.nullable
    };
  }

  /**
   * Resolve object schema
   */
  private resolveObject(schema: any, name?: string): ResolvedSchema {
    const properties = new Map<string, ResolvedProperty>();
    const imports: string[] = [];
    
    if (schema.properties) {
      Object.entries(schema.properties).forEach(([propName, propSchema]: [string, any]) => {
        const resolved = this.resolve(propSchema);
        const isRequired = schema.required?.includes(propName) || false;
        
        properties.set(propName, {
          name: this.toDartPropertyName(propName),
          dartType: resolved.dartType,
          required: isRequired,
          nullable: !isRequired || propSchema.nullable || false,
          description: propSchema.description,
          defaultValue: propSchema.default,
          jsonKey: propName !== this.toDartPropertyName(propName) ? propName : undefined
        });
        
        imports.push(...resolved.imports);
      });
    }
    
    return {
      type: 'object',
      dartType: name ? this.toDartClassName(name) : 'Map<String, dynamic>',
      imports: [...new Set(imports)],
      properties,
      required: schema.required,
      description: schema.description
    };
  }

  /**
   * Resolve primitive types
   */
  private resolvePrimitive(schema: any): ResolvedSchema {
    let dartType = 'dynamic';
    
    switch (schema.type) {
      case 'string':
        if (schema.format === 'date-time') {
          dartType = 'DateTime';
        } else if (schema.format === 'binary') {
          dartType = 'Uint8List';
        } else {
          dartType = 'String';
        }
        break;
      case 'integer':
        dartType = 'int';
        break;
      case 'number':
        dartType = 'double';
        break;
      case 'boolean':
        dartType = 'bool';
        break;
      case 'null':
        dartType = 'void';
        break;
    }
    
    // Handle nullable
    if (schema.nullable) {
      dartType = TypeMapper.toNullable(dartType);
    }
    
    return {
      type: 'primitive',
      dartType,
      imports: [],
      nullable: schema.nullable,
      description: schema.description
    };
  }

  /**
   * Check if a schema has composition
   */
  hasComposition(schema: any): boolean {
    return !!(schema.oneOf || schema.anyOf || schema.allOf);
  }

  /**
   * Check if a schema is nullable
   */
  isNullable(schema: any): boolean {
    // Direct nullable flag
    if (schema.nullable === true) return true;
    
    // OpenAPI 3.1 type array with null
    if (Array.isArray(schema.type) && schema.type.includes('null')) return true;
    
    // oneOf/anyOf with null type
    const composition = schema.oneOf || schema.anyOf;
    if (composition && Array.isArray(composition)) {
      return composition.some((s: any) => s.type === 'null');
    }
    
    return false;
  }

  /**
   * Convert to Dart class name (PascalCase)
   */
  private toDartClassName(name: string): string {
    return name
      .replace(/[-_](.)/g, (_, char) => char.toUpperCase())
      .replace(/^(.)/, (_, char) => char.toUpperCase());
  }

  /**
   * Convert to Dart property name (camelCase)
   */
  private toDartPropertyName(name: string): string {
    return name
      .replace(/[-_](.)/g, (_, char) => char.toUpperCase())
      .replace(/^(.)/, (_, char) => char.toLowerCase());
  }

  /**
   * Convert to snake_case for file names
   */
  private toSnakeCase(str: string): string {
    return str
      .replace(/([a-z])([A-Z])/g, '$1_$2')
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
      .toLowerCase()
      .replace(/^_+/, '');
  }
}