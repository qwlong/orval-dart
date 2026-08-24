/**
 * Properties handling - aligned with Orval structure
 * Processes and organizes method properties/parameters
 */
import { TypeMapper } from '../utils/type-mapper';


export enum PropType {
  BODY = 'body',
  QUERY = 'query',
  PATH = 'path',
  HEADER = 'header',
  COOKIE = 'cookie'
}

export interface PropertyInfo {
  name: string;
  type: string;
  dartType: string;
  required: boolean;
  nullable?: boolean;
  defaultValue?: any;
  description?: string;
  propType: PropType;
  imports: string[];
}

export interface MethodProps {
  all: PropertyInfo[];
  body?: PropertyInfo;
  query: PropertyInfo[];
  path: PropertyInfo[];
  header: PropertyInfo[];
  cookie: PropertyInfo[];
  hasRequired: boolean;
  hasOptional: boolean;
  signature: string;
}

/**
 * Get all properties for a method
 */
export function getProps(
  body: any,
  queryParams: any[],
  pathParams: any[],
  headerParams: any[],
  cookieParams: any[],
  _operationName: string
): MethodProps {
  const all: PropertyInfo[] = [];
  
  // Process body
  let bodyProp: PropertyInfo | undefined;
  if (body) {
    bodyProp = {
      name: body.parameterName || 'body',
      type: body.type,
      dartType: body.type,
      required: !body.isOptional,
      nullable: body.nullable,
      description: body.description,
      propType: PropType.BODY,
      imports: body.imports || []
    };
    all.push(bodyProp);
  }
  
  // Process path parameters (always required)
  const pathProps = pathParams.map(param => ({
    name: param.dartName || param.name,
    type: param.type,
    dartType: param.type,
    required: true, // Path params are always required
    nullable: false,
    defaultValue: param.defaultValue,
    description: param.description,
    propType: PropType.PATH,
    imports: param.imports || []
  }));
  all.push(...pathProps);
  
  // Process query parameters
  const queryProps = queryParams.map(param => ({
    name: param.dartName || param.name,
    type: param.type,
    dartType: param.nullable ? TypeMapper.toNullable(param.type) : param.type,
    required: param.required || false,
    nullable: param.nullable,
    defaultValue: param.defaultValue,
    description: param.description,
    propType: PropType.QUERY,
    imports: param.imports || []
  }));
  all.push(...queryProps);
  
  // Process header parameters
  const headerProps = headerParams.map(param => ({
    name: param.dartName || param.name,
    type: param.type,
    dartType: param.nullable ? TypeMapper.toNullable(param.type) : param.type,
    required: param.required || false,
    nullable: param.nullable,
    defaultValue: param.defaultValue,
    description: param.description,
    propType: PropType.HEADER,
    imports: param.imports || []
  }));
  all.push(...headerProps);
  
  // Process cookie parameters
  const cookieProps = cookieParams.map(param => ({
    name: param.dartName || param.name,
    type: param.type,
    dartType: param.nullable ? TypeMapper.toNullable(param.type) : param.type,
    required: param.required || false,
    nullable: param.nullable,
    defaultValue: param.defaultValue,
    description: param.description,
    propType: PropType.COOKIE,
    imports: param.imports || []
  }));
  all.push(...cookieProps);
  
  // Check for required/optional
  const hasRequired = all.some(p => p.required);
  const hasOptional = all.some(p => !p.required);
  
  // Generate method signature
  const signature = generateMethodSignature(all);
  
  return {
    all,
    body: bodyProp,
    query: queryProps,
    path: pathProps,
    header: headerProps,
    cookie: cookieProps,
    hasRequired,
    hasOptional,
    signature
  };
}

/**
 * Generate method signature from properties
 */
export function generateMethodSignature(props: PropertyInfo[]): string {
  // Sort props: required path params first, then required others, then optional
  const sorted = sortProperties(props);
  
  const params = sorted.map(prop => {
    const required = prop.required && !prop.defaultValue ? 'required ' : '';
    const nullable = prop.nullable || !prop.required ? '?' : '';
    const defaultValue = prop.defaultValue ? ` = ${formatDefaultValue(prop.defaultValue, prop.type)}` : '';
    
    return `${required}${prop.dartType}${nullable} ${prop.name}${defaultValue}`;
  });
  
  // If all params are optional, wrap in brackets
  if (params.length > 0 && !props.some(p => p.required && !p.defaultValue)) {
    return `{${params.join(', ')}}`;
  }
  
  // Mix of required and optional - required first, optional in brackets
  const requiredParams = sorted.filter(p => p.required && !p.defaultValue);
  const optionalParams = sorted.filter(p => !p.required || p.defaultValue);
  
  if (requiredParams.length > 0 && optionalParams.length > 0) {
    const reqStr = requiredParams.map(p => `${p.dartType} ${p.name}`).join(', ');
    const optStr = optionalParams.map(p => {
      const nullable = p.nullable || !p.required ? '?' : '';
      const defaultValue = p.defaultValue ? ` = ${formatDefaultValue(p.defaultValue, p.type)}` : '';
      return `${p.dartType}${nullable} ${p.name}${defaultValue}`;
    }).join(', ');
    
    return `${reqStr}, {${optStr}}`;
  }
  
  return params.join(', ');
}

/**
 * Sort properties by type and requirement
 */
function sortProperties(props: PropertyInfo[]): PropertyInfo[] {
  const order = {
    [PropType.PATH]: 1,
    [PropType.BODY]: 2,
    [PropType.QUERY]: 3,
    [PropType.HEADER]: 4,
    [PropType.COOKIE]: 5
  };
  
  return [...props].sort((a, b) => {
    // Required before optional
    if (a.required !== b.required) {
      return a.required ? -1 : 1;
    }
    
    // Then by type
    return order[a.propType] - order[b.propType];
  });
}

/**
 * Format default value for Dart
 */
function formatDefaultValue(value: any, type: string): string {
  if (value === null) return 'null';
  if (value === undefined) return 'null';
  
  if (type === 'String') {
    return `'${value}'`;
  }
  
  if (type === 'bool') {
    return String(value);
  }
  
  if (type === 'int' || type === 'double') {
    return String(value);
  }
  
  if (type.startsWith('List')) {
    return 'const []';
  }
  
  if (type.startsWith('Map')) {
    return 'const {}';
  }
  
  return JSON.stringify(value);
}

/**
 * Generate parameter object class for complex parameter sets
 */
export function generateParameterClass(
  operationName: string,
  props: PropertyInfo[]
): string {
  const className = `${toPascalCase(operationName)}Parameters`;
  
  const properties = props.map(prop => {
    const nullable = prop.nullable || !prop.required ? '?' : '';
    const required = prop.required ? 'required ' : '';
    const jsonKey = prop.name !== toCamelCase(prop.name) 
      ? `@JsonKey(name: '${prop.name}') ` 
      : '';
    
    return `  ${jsonKey}${required}${prop.dartType}${nullable} ${toCamelCase(prop.name)},`;
  });
  
  return `@freezed
class ${className} with _\$${className} {
  const factory ${className}({
${properties.join('\n')}
  }) = _${className};

  factory ${className}.fromJson(Map<String, dynamic> json) =>
      _\$${className}FromJson(json);
}`;
}

/**
 * Check if should use parameter object
 */
export function shouldUseParameterObject(props: PropertyInfo[]): boolean {
  // Use parameter object if more than 3 parameters
  // or if there are complex types
  return props.length > 3 || 
         props.some(p => p.type.includes('<') || p.type.includes('Map'));
}

/**
 * Get property documentation
 */
export function getPropertyDocs(prop: PropertyInfo): string {
  const lines: string[] = [];
  
  if (prop.description) {
    lines.push(`/// ${prop.description}`);
  }
  
  if (prop.defaultValue !== undefined) {
    lines.push(`/// Default: ${prop.defaultValue}`);
  }
  
  if (prop.nullable) {
    lines.push(`/// Nullable: true`);
  }
  
  return lines.join('\n');
}

/**
 * Convert to PascalCase
 */
function toPascalCase(str: string): string {
  return str
    .split(/[-_\s]+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
}

/**
 * Convert to camelCase
 */
function toCamelCase(str: string): string {
  const pascal = toPascalCase(str);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}