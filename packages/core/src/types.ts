import type { OpenAPIV3 } from 'openapi-types';

export type OpenAPIObject = OpenAPIV3.Document;

export type DartClientType = 'dio' | 'http' | 'chopper' | 'retrofit' | 'custom';

export type DartOutputMode = 'single' | 'split' | 'tags';

export interface DartGeneratorOptions {
  input: string | OpenAPIObject;
  output: {
    target: string;
    mode?: DartOutputMode;
    client?: DartClientType;
    override?: {
      generator?: {
        freezed?: boolean;
        jsonSerializable?: boolean;
        nullSafety?: boolean;
        partFiles?: boolean;
        equatable?: boolean;
      };
      dio?: {
        baseUrl?: string;
        interceptors?: string[];
      };
      methodNaming?: 'operationId' | 'methodPath';  // New option for method naming strategy
      sharedHeaders?: Record<string, string[]>;  // Configurable shared header models (deprecated, use headers.definitions)
      headers?: {
        // Define custom header classes with their fields
        definitions?: {
          [className: string]: {
            fields: string[] | { [fieldName: string]: { type?: string; required?: boolean; description?: string } };
            required?: string[];  // List of required fields
            description?: string;  // Class description
            extends?: string;  // Inherit from another header class
          };
        };
        // Map endpoints to header classes using patterns
        mapping?: {
          [pattern: string]: string;  // Pattern (glob/regex) -> className
        };
        // Enable custom header matching
        customMatch?: boolean;
        // Matching strategy for custom header matching
        matchStrategy?: 'exact' | 'subset' | 'fuzzy';
        // Enable custom consolidation of similar headers
        customConsolidate?: boolean;
        // Minimum endpoints to trigger consolidation (default: 3)
        consolidationThreshold?: number;
        // Naming strategy for consolidated classes
        consolidationNaming?: 'smart' | 'sequential';
      };
      mutator?: {
        path: string;
        name: string;
        default?: boolean;
      };
    };
  };
  hooks?: {
    afterAllFilesWrite?: string | string[];
  };
}

// Client builder interfaces (similar to Orval)
export interface ClientGeneratorBuilder {
  client: ClientBuilder;
  header?: ClientHeaderBuilder;
  dependencies?: ClientDependenciesBuilder;
  footer?: ClientFooterBuilder;
}

export type ClientBuilder = (
  verbOptions: GeneratorVerbOptions,
  options: GeneratorOptions,
) => { implementation: string; imports: string[] };

export type ClientHeaderBuilder = (options: {
  title?: string;
  isRequestOptions?: boolean;
  isMutator?: boolean;
  hasAwaitedType?: boolean;
}) => string;

export type ClientDependenciesBuilder = (
  hasGlobalMutator: boolean,
  hasParamsSerializerOptions?: boolean,
) => GeneratorDependency[];

export type ClientFooterBuilder = (options: {
  operationNames: string[];
  title?: string;
  hasAwaitedType?: boolean;
}) => string;

export interface GeneratorDependency {
  exports: Array<{
    name: string;
    default?: boolean;
    values?: boolean;
    syntheticDefaultImport?: boolean;
  }>;
  dependency: string;
}

export interface GeneratorVerbOptions {
  verb: string;
  route: string;
  operationName: string;
  response: any;
  body?: any;
  headers?: any;
  queryParams?: any;
  pathParams?: any;
  props: any[];
  mutator?: any;
  override?: any;
  formData?: any;
  formUrlEncoded?: any;
  paramsSerializer?: any;
}

export interface GeneratorOptions {
  route: string;
  pathRoute: string;
  context: any;
  output: DartGeneratorOptions['output'];
}

export interface GeneratedFile {
  path: string;
  content: string;
  overwrite?: boolean;
}

export interface DartModel {
  name: string;
  properties: DartProperty[];
  imports: string[];
  isEnum?: boolean;
  enumValues?: string[];
  description?: string;
}

export interface DartProperty {
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

export interface DartEndpoint {
  name: string;
  method: string;
  path: string;
  parameters: DartParameter[];
  requestBody?: DartRequestBody;
  responses: DartResponse[];
  description?: string;
  deprecated?: boolean;
  tags?: string[];
}

export interface DartParameter {
  name: string;
  type: string;
  in: 'path' | 'query' | 'header' | 'cookie';
  required: boolean;
  description?: string;
}

export interface DartRequestBody {
  type: string;
  required: boolean;
  contentType?: string;
}

export interface DartResponse {
  status: string;
  type?: string;
  description?: string;
}

// Configuration types for defineConfig
export type DartConfig = {
  [project: string]: DartGeneratorOptions;
};

export type DartConfigExport = DartConfig | Promise<DartConfig> | (() => DartConfig | Promise<DartConfig>);