/**
 * Unified Headers Generator
 * Handles generation of header models for API endpoints with support for:
 * - Custom header configurations
 * - Smart matching strategies
 * - Header consolidation
 * - Reporting and analytics
 */

import { GeneratedFile } from '../types';
import { TypeMapper } from '../utils';
import { TemplateManager } from '../templates/template-manager';
import { HeaderParameter } from './endpoint-generator';

/**
 * Header definition configuration
 */
export interface HeaderDefinition {
  fields: string[] | { [fieldName: string]: any };
  required?: string[];
  description?: string;
}

/**
 * Headers generator configuration
 */
export interface HeadersConfig {
  // Define reusable header classes
  definitions?: { [className: string]: HeaderDefinition };

  // Matching strategy for finding appropriate header classes
  matchStrategy?: 'exact' | 'subset' | 'fuzzy';

  // Enable custom matching
  customMatch?: boolean;

  // Enable automatic consolidation
  customConsolidate?: boolean;

  // Minimum number of endpoints to trigger consolidation
  consolidationThreshold?: number;
}

/**
 * Internal model representation
 */
interface HeaderModel {
  className: string;
  fileName: string;
  headers: HeaderParameter[];
  isShared: boolean;
  usageCount?: number;
  endpoints?: string[];
}

/**
 * Unified Headers Generator
 */
export class HeadersGenerator {
  private templateManager: TemplateManager;
  private config: HeadersConfig;
  private headerModels: Map<string, HeaderModel> = new Map();
  private matchCache: Map<string, string | null> = new Map();
  private endpointToModelMap: Map<string, string> = new Map();

  constructor(config?: HeadersConfig) {
    this.templateManager = new TemplateManager();
    this.config = config || {};
  }

  /**
   * Get or create header model name for an endpoint
   */
  getHeaderModelName(methodName: string, headers: HeaderParameter[]): string | null {
    if (headers.length === 0) {
      return null;
    }

    // Try to find matching configured header class
    if (this.config.customMatch && this.config.definitions) {
      const matchedClass = this.findMatchingHeaderClass(methodName, headers);
      if (matchedClass) {
        this.registerHeaderUsage(matchedClass, methodName, headers, true);
        return matchedClass;
      }
    }

    // Create unique model name
    const uniqueClassName = TypeMapper.toDartClassName(methodName + 'Headers');
    this.registerHeaderUsage(uniqueClassName, methodName, headers, false);

    return uniqueClassName;
  }

  /**
   * Generate header model file for a specific endpoint
   */
  generateHeaderModel(methodName: string, headers: HeaderParameter[]): GeneratedFile | null {
    if (headers.length === 0) {
      return null;
    }

    const modelName = this.getHeaderModelName(methodName, headers);
    if (!modelName) {
      return null;
    }

    const model = this.headerModels.get(modelName);
    if (!model) {
      return null;
    }

    // Don't generate file for shared models here, they are generated in generateAllHeaderFiles
    if (model.isShared) {
      return null;
    }

    // Generate file for unique models
    return this.createHeaderFile(model);
  }

  /**
   * Generate all header files (both shared and unique)
   */
  generateAllHeaderFiles(): GeneratedFile[] {
    const files: GeneratedFile[] = [];

    // Apply consolidation if enabled
    if (this.config.customConsolidate) {
      this.consolidateHeaders();
    }

    // Generate files for all models
    for (const model of this.headerModels.values()) {
      const file = this.createHeaderFile(model);
      if (file) {
        files.push(file);
      }
    }

    return files;
  }

  /**
   * Generate configured header files from definitions
   */
  generateConfiguredHeaderFiles(): GeneratedFile[] {
    if (!this.config.definitions) {
      return [];
    }

    const files: GeneratedFile[] = [];
    const generatedSignatures = new Set<string>();

    for (const [className, definition] of Object.entries(this.config.definitions)) {
      const fields = this.parseHeaderFields(definition);

      // Create signature to avoid duplicates
      const signature = this.createFieldSignature(fields);

      if (!generatedSignatures.has(signature)) {
        generatedSignatures.add(signature);

        const headersClassName = className.endsWith('Headers') ? className : className + 'Headers';
        const fileName = TypeMapper.toSnakeCase(className);

        const properties = fields.map(f => ({
          name: TypeMapper.toCamelCase(f.name.replace(/-/g, '_')),
          type: f.type || 'String',
          required: f.required,
          description: f.description || '',
          jsonKey: f.name
        }));

        const content = this.templateManager.render('freezed-headers-model', {
          className: headersClassName,
          fileName,
          description: definition.description || `Headers for ${className}`,
          properties,
          hasJsonKey: true,
          hasDescription: properties.some(p => p.description)
        });

        files.push({
          path: `models/headers/${fileName}.f.dart`,
          content
        });
      }
    }

    return files;
  }

  /**
   * Consolidate headers based on similarity
   */
  private consolidateHeaders(): void {
    const threshold = this.config.consolidationThreshold || 3;
    const signatureMap = new Map<string, string[]>();

    // Group models by signature
    for (const [modelName, model] of this.headerModels.entries()) {
      if (!model.isShared) {
        const signature = this.createHeaderSignature(model.headers);
        const models = signatureMap.get(signature) || [];
        models.push(modelName);
        signatureMap.set(signature, models);
      }
    }

    // Consolidate groups that meet threshold
    for (const [signature, modelNames] of signatureMap.entries()) {
      if (modelNames.length >= threshold) {
        // Create consolidated model name
        const consolidatedName = this.generateConsolidatedName(modelNames);

        // Get headers from first model
        const firstModel = this.headerModels.get(modelNames[0]);
        if (!firstModel) continue;

        // Create consolidated model
        const consolidatedModel: HeaderModel = {
          className: consolidatedName,
          fileName: TypeMapper.toSnakeCase(consolidatedName),
          headers: firstModel.headers,
          isShared: true,
          usageCount: modelNames.length,
          endpoints: modelNames
        };

        // Replace individual models with consolidated one
        this.headerModels.set(consolidatedName, consolidatedModel);

        // Update references
        for (const oldName of modelNames) {
          this.headerModels.delete(oldName);
          // Update endpoint mappings
          for (const [endpoint, model] of this.endpointToModelMap.entries()) {
            if (model === oldName) {
              this.endpointToModelMap.set(endpoint, consolidatedName);
            }
          }
        }
      }
    }
  }

  /**
   * Find matching header class from configuration
   */
  findMatchingHeaderClass(endpoint: string, headers: HeaderParameter[]): string | null {
    if (!this.config.definitions || headers.length === 0) {
      return null;
    }

    // Check cache first
    const signature = this.createHeaderSignature(headers);
    if (this.matchCache.has(signature)) {
      return this.matchCache.get(signature)!;
    }

    // Find best match based on strategy
    const matchedClass = this.findBestMatch(headers);

    // Cache the result
    this.matchCache.set(signature, matchedClass);

    return matchedClass;
  }

  /**
   * Find the best matching header definition
   */
  private findBestMatch(headers: HeaderParameter[]): string | null {
    if (!this.config.definitions) {
      return null;
    }

    const strategy = this.config.matchStrategy || 'exact';
    const headerNames = headers.map(h => h.originalName).sort();
    const requiredHeaders = headers.filter(h => h.required).map(h => h.originalName).sort();

    let bestMatch: { className: string; score: number } | null = null;

    for (const [className, definition] of Object.entries(this.config.definitions)) {
      const defFields = this.getFieldNames(definition);
      const defRequired = definition.required || defFields;

      if (strategy === 'exact') {
        // Exact match: same fields and same required status
        if (this.arraysEqual(headerNames, defFields) &&
            this.arraysEqual(requiredHeaders, [...defRequired].sort())) {
          return className;
        }
      } else if (strategy === 'subset') {
        // Subset match: endpoint headers are subset of definition
        if (this.isSubset(headerNames, defFields)) {
          const score = this.calculateMatchScore(headers, definition);
          if (!bestMatch || score > bestMatch.score) {
            bestMatch = { className, score };
          }
        }
      } else if (strategy === 'fuzzy') {
        // Fuzzy match: find best overlap
        const score = this.calculateFuzzyScore(headers, definition);
        if (score > 0 && (!bestMatch || score > bestMatch.score)) {
          bestMatch = { className, score };
        }
      }
    }

    return bestMatch?.className || null;
  }

  /**
   * Register header usage
   */
  private registerHeaderUsage(
    modelName: string,
    endpoint: string,
    headers: HeaderParameter[],
    isShared: boolean
  ): void {
    this.endpointToModelMap.set(endpoint, modelName);

    if (!this.headerModels.has(modelName)) {
      this.headerModels.set(modelName, {
        className: modelName,
        fileName: TypeMapper.toSnakeCase(modelName),
        headers,
        isShared,
        usageCount: 1,
        endpoints: [endpoint]
      });
    } else {
      const model = this.headerModels.get(modelName)!;
      model.usageCount = (model.usageCount || 0) + 1;
      if (!model.endpoints) {
        model.endpoints = [];
      }
      model.endpoints.push(endpoint);
    }
  }

  /**
   * Create header file from model
   */
  private createHeaderFile(model: HeaderModel): GeneratedFile | null {
    const properties = model.headers.map(header => ({
      name: header.dartName,
      type: header.type || 'String',
      required: header.required,
      description: header.description,
      jsonKey: header.dartName !== header.originalName ? header.originalName : undefined,
      dateOnly: header.dateOnly
    }));

    const content = this.templateManager.render('freezed-headers-model', {
      className: model.className,
      fileName: model.fileName,
      description: model.isShared
        ? `Shared headers used by ${model.usageCount || 1} endpoints`
        : `Headers for ${model.className.replace(/Headers$/, '')}`,
      properties,
      hasJsonKey: properties.some(p => p.jsonKey),
      hasDescription: properties.some(p => p.description),
      hasDateOnlyConverter: properties.some(p => p.dateOnly)
    });

    return {
      path: `models/headers/${model.fileName}.f.dart`,
      content
    };
  }

  /**
   * Generate matching report
   */
  generateReport(): string {
    let report = '# Header Generation Report\n\n';

    // Statistics
    const totalModels = this.headerModels.size;
    const sharedModels = Array.from(this.headerModels.values()).filter(m => m.isShared).length;
    const uniqueModels = totalModels - sharedModels;

    report += `## Statistics\n`;
    report += `- Total header models: ${totalModels}\n`;
    report += `- Shared models: ${sharedModels}\n`;
    report += `- Unique models: ${uniqueModels}\n`;
    report += `- Total endpoints: ${this.endpointToModelMap.size}\n\n`;

    // Shared model usage
    if (sharedModels > 0) {
      report += `## Shared Model Usage\n`;
      for (const model of this.headerModels.values()) {
        if (model.isShared) {
          report += `- ${model.className}: ${model.usageCount || 1} endpoints\n`;
        }
      }
      report += '\n';
    }

    // Consolidation results
    if (this.config.customConsolidate) {
      const consolidatedCount = Array.from(this.headerModels.values())
        .filter(m => m.isShared && (m.usageCount || 0) >= (this.config.consolidationThreshold || 3))
        .length;

      if (consolidatedCount > 0) {
        report += `## Consolidation Results\n`;
        report += `- ${consolidatedCount} header classes were consolidated\n`;
        report += `- Threshold: ${this.config.consolidationThreshold || 3} endpoints\n\n`;
      }
    }

    return report;
  }

  /**
   * Parse header fields from definition
   */
  private parseHeaderFields(definition: HeaderDefinition): Array<{
    name: string;
    type: string;
    required: boolean;
    description?: string;
  }> {
    if (Array.isArray(definition.fields)) {
      return definition.fields.map(name => ({
        name,
        type: 'String',
        required: definition.required?.includes(name) ?? true,
        description: undefined
      }));
    } else {
      return Object.entries(definition.fields).map(([name, info]) => ({
        name,
        type: typeof info === 'object' && info !== null && 'type' in info ?
          (info as any).type : 'String',
        required: typeof info === 'object' && info !== null && 'required' in info ?
          (info as any).required : (definition.required?.includes(name) ?? true),
        description: typeof info === 'object' && info !== null && 'description' in info ?
          (info as any).description : undefined
      }));
    }
  }

  /**
   * Helper methods
   */

  private createHeaderSignature(headers: HeaderParameter[]): string {
    return headers
      .map(h => `${h.originalName}:${h.required ? 'R' : 'O'}`)
      .sort()
      .join('|');
  }

  private createFieldSignature(fields: Array<{ name: string; required: boolean }>): string {
    return fields
      .map(f => `${f.name}:${f.required ? 'R' : 'O'}`)
      .sort()
      .join('|');
  }

  private getFieldNames(definition: HeaderDefinition): string[] {
    if (Array.isArray(definition.fields)) {
      return [...definition.fields].sort();
    }
    return Object.keys(definition.fields).sort();
  }

  private generateConsolidatedName(modelNames: string[]): string {
    // Extract common parts from model names
    const commonParts = modelNames[0]
      .replace(/Headers$/, '')
      .split(/(?=[A-Z])/)
      .filter(part =>
        modelNames.every(name => name.includes(part))
      );

    if (commonParts.length > 0) {
      return commonParts.join('') + 'Headers';
    }

    return 'SharedHeaders' + Math.random().toString(36).substr(2, 5);
  }

  private calculateMatchScore(
    headers: HeaderParameter[],
    definition: HeaderDefinition
  ): number {
    let score = 0;
    const defFields = this.getFieldNames(definition);
    const defRequired = definition.required || defFields;

    headers.forEach(header => {
      if (defFields.includes(header.originalName)) {
        score += 1;
        // Bonus points if required status matches
        const shouldBeRequired = defRequired.includes(header.originalName);
        if (header.required === shouldBeRequired) {
          score += 0.5;
        }
      }
    });

    // Penalty for extra fields in definition
    const extraFields = defFields.length - headers.length;
    score -= extraFields * 0.25;

    return score;
  }

  private calculateFuzzyScore(
    headers: HeaderParameter[],
    definition: HeaderDefinition
  ): number {
    const headerNames = headers.map(h => h.originalName);
    const defFields = this.getFieldNames(definition);

    // Calculate Jaccard similarity
    const intersection = headerNames.filter(h => defFields.includes(h));
    const union = new Set([...headerNames, ...defFields]);

    if (union.size === 0) return 0;

    return intersection.length / union.size;
  }

  private arraysEqual(a: string[], b: string[]): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  private isSubset(a: string[], b: string[]): boolean {
    return a.every(item => b.includes(item));
  }

  /**
   * Clear all models (for testing)
   */
  clear(): void {
    this.headerModels.clear();
    this.matchCache.clear();
    this.endpointToModelMap.clear();
  }

  /**
   * Get statistics
   */
  getStatistics(): {
    totalModels: number;
    sharedModels: number;
    uniqueModels: number;
    totalEndpoints: number;
    averageReuse: number;
  } {
    const models = Array.from(this.headerModels.values());
    const sharedModels = models.filter(m => m.isShared);

    const totalReuse = sharedModels.reduce((sum, m) => sum + (m.usageCount || 1), 0);
    const averageReuse = sharedModels.length > 0 ? totalReuse / sharedModels.length : 0;

    return {
      totalModels: models.length,
      sharedModels: sharedModels.length,
      uniqueModels: models.length - sharedModels.length,
      totalEndpoints: this.endpointToModelMap.size,
      averageReuse: Math.round(averageReuse * 100) / 100
    };
  }
}