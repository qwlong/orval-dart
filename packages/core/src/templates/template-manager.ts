/**
 * Template manager for loading and compiling Handlebars templates
 */

import Handlebars from 'handlebars';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// Get __dirname that works in both CJS and ESM
declare const __dirname: string | undefined;
let dirName: string;
if (typeof import.meta !== 'undefined' && import.meta.url) {
  // ESM
  const __filename = fileURLToPath(import.meta.url);
  dirName = path.dirname(__filename);
} else if (typeof __dirname !== 'undefined') {
  // CJS - __dirname is available
  dirName = __dirname;
} else {
  // Fallback - calculate from cwd
  dirName = path.join(process.cwd(), 'dorval/packages/core/dist');
}

/**
 * Locate a template file, which sits next to the compiled output in dist
 */
function resolveTemplatePath(templateName: string): string {
  const inTemplatesDir = path.join(dirName, 'templates', `${templateName}.hbs`);
  return fsSync.existsSync(inTemplatesDir)
    ? inTemplatesDir
    : path.join(dirName, `${templateName}.hbs`);
}

/**
 * Templates included by more than one other template, by partial name
 */
const FILE_PARTIALS: Record<string, string> = {
  dateOnlyConverter: 'date-only-converter'
};

const partialSources: Map<string, string> = new Map();

export class TemplateManager {
  private templates: Map<string, HandlebarsTemplateDelegate> = new Map();
  private handlebars: typeof Handlebars;

  constructor() {
    this.handlebars = Handlebars.create();
    this.registerHelpers();
    this.registerFilePartials();
  }

  /**
   * Load the shared partials from disk. Sources are cached across instances -
   * a TemplateManager is created per model, and these never change.
   */
  private registerFilePartials(): void {
    for (const [partialName, templateName] of Object.entries(FILE_PARTIALS)) {
      let source = partialSources.get(templateName);
      if (source === undefined) {
        source = fsSync.readFileSync(resolveTemplatePath(templateName), 'utf-8');
        partialSources.set(templateName, source);
      }
      this.handlebars.registerPartial(partialName, source);
    }
  }

  /**
   * Register custom Handlebars helpers
   */
  private registerHelpers(): void {
    // Helper to check if a value is not something
    this.handlebars.registerHelper('not', (value: any) => {
      return !value;
    });

    // Helper for logical OR
    this.handlebars.registerHelper('or', (...args: any[]) => {
      // Remove the last argument (Handlebars options object)
      const values = args.slice(0, -1);
      return values.some(v => v);
    });

    // Helper for logical AND
    this.handlebars.registerHelper('and', (...args: any[]) => {
      // Remove the last argument (Handlebars options object)
      const values = args.slice(0, -1);
      return values.every(v => v);
    });

    // Helper to check equality
    this.handlebars.registerHelper('eq', (a: any, b: any) => {
      return a === b;
    });

    // Helper to check inequality
    this.handlebars.registerHelper('neq', (a: any, b: any) => {
      return a !== b;
    });

    // Helper to decode HTML entities
    this.handlebars.registerHelper('decodeHtml', (text: string) => {
      if (!text) return '';
      
      // Decode common HTML entities
      return text
        .replace(/&#x27;/g, "'")
        .replace(/&#39;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&');
    });

    // Helper to format Dart documentation comments
    this.handlebars.registerHelper('dartDoc', (text: string, options?: any) => {
      if (!text) return '';
      
      // Decode HTML entities first
      text = text
        .replace(/&#x27;/g, "'")
        .replace(/&#39;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&');
      
      // Check if indentLevel is passed as a hash parameter
      const indentLevel = options?.hash?.indent ?? 2;
      const indentStr = ' '.repeat(indentLevel);
      
      // Normalize line endings and split by newlines
      const normalizedText = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      const lines = normalizedText.split('\n');
      
      // Filter out empty lines at the beginning and end
      while (lines.length > 0 && lines[0].trim() === '') {
        lines.shift();
      }
      while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
        lines.pop();
      }
      
      // Format each line with /// prefix, all with same indentation
      // Skip empty lines to avoid /// with no content
      const formattedLines = lines
        .filter(line => line.trim() !== '') // Skip empty lines
        .map((line) => {
          const trimmed = line.trim();
          return `${indentStr}/// ${trimmed}`;
        });
      
      const result = formattedLines.join('\n');
      
      // Use Handlebars.SafeString to prevent escaping
      return new this.handlebars.SafeString(result);
    });

    // Helper to convert to camelCase
    this.handlebars.registerHelper('camelCase', (str: string) => {
      return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    });

    // Helper to convert to PascalCase
    this.handlebars.registerHelper('pascalCase', (str: string) => {
      const camel = str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
      return camel.charAt(0).toUpperCase() + camel.slice(1);
    });

    // Helper to convert to snake_case
    this.handlebars.registerHelper('snakeCase', (str: string) => {
      return str
        .replace(/([A-Z])/g, '_$1')
        .toLowerCase()
        .replace(/^_/, '');
    });

    // Helper to add indentation
    this.handlebars.registerHelper('indent', (text: string, spaces: number) => {
      const indent = ' '.repeat(spaces);
      return text.split('\n').map(line => indent + line).join('\n');
    });

    // Helper to join array with separator
    this.handlebars.registerHelper('join', (array: any[], separator: string) => {
      if (!Array.isArray(array)) return '';
      return array.join(separator);
    });

    // Helper to wrap string in quotes, using raw string (r'...') if it contains $
    // This prevents Dart from trying to parse string interpolation
    this.handlebars.registerHelper('jsonKeyQuote', (str: string) => {
      if (!str) return "''";
      // If string contains $ (e.g., $if, $switch), use raw string literal
      if (str.includes('$')) {
        return `r'${str}'`;
      }
      // Otherwise use regular string
      return `'${str}'`;
    });
  }

  /**
   * Load and compile a template
   */
  async loadTemplate(templateName: string): Promise<HandlebarsTemplateDelegate> {
    // Check cache first
    if (this.templates.has(templateName)) {
      return this.templates.get(templateName)!;
    }

    const templateContent = await fs.readFile(resolveTemplatePath(templateName), 'utf-8');

    // Compile template
    const compiled = this.handlebars.compile(templateContent, {
      noEscape: false,
      strict: false
    });

    // Cache for future use
    this.templates.set(templateName, compiled);

    return compiled;
  }

  /**
   * Load template synchronously
   */
  loadTemplateSync(templateName: string): HandlebarsTemplateDelegate {
    // Check cache first
    if (this.templates.has(templateName)) {
      return this.templates.get(templateName)!;
    }

    const templateContent = fsSync.readFileSync(resolveTemplatePath(templateName), 'utf-8');

    // Compile template
    const compiled = this.handlebars.compile(templateContent, {
      noEscape: false,
      strict: false
    });

    // Cache for future use
    this.templates.set(templateName, compiled);

    return compiled;
  }

  /**
   * Render a template with data
   */
  render(templateName: string, data: any): string {
    const template = this.loadTemplateSync(templateName);
    const result = template(data);
    
    return result;
  }

  /**
   * Register a partial template
   */
  registerPartial(name: string, content: string): void {
    this.handlebars.registerPartial(name, content);
  }

  /**
   * Clear template cache
   */
  clearCache(): void {
    this.templates.clear();
  }
}