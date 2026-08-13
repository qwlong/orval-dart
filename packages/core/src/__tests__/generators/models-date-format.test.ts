/**
 * `format: date` is a calendar date, not a point in time. It maps to DateTime
 * like `date-time` does, but has to serialize back as YYYY-MM-DD.
 */

import { describe, it, expect } from 'vitest';
import { generateModels } from '../../generators/models';
import { EndpointGenerator } from '../../generators/endpoint-generator';
import { ParamsGenerator } from '../../generators/params-generator';

const spec = {
  openapi: '3.0.0',
  info: { title: 'Test API', version: '1.0.0' },
  paths: {},
  components: {
    schemas: {
      Post: {
        type: 'object',
        required: ['date'],
        properties: {
          date: { type: 'string', format: 'date' },
          maybeDate: { type: 'string', format: 'date', nullable: true },
          dates: { type: 'array', items: { type: 'string', format: 'date' } },
          createdAt: { type: 'string', format: 'date-time' },
          title: { type: 'string' }
        }
      },
      Timestamped: {
        type: 'object',
        properties: {
          createdAt: { type: 'string', format: 'date-time' }
        }
      },
      Report: {
        type: 'object',
        properties: {
          period: {
            type: 'object',
            properties: {
              from: { type: 'string', format: 'date' },
              at: { type: 'string', format: 'date-time' }
            }
          }
        }
      }
    }
  }
} as any;

async function generate(name: string): Promise<string> {
  const files = await generateModels(spec, {
    input: spec,
    output: { target: './test', mode: 'split', client: 'dio' }
  } as any);

  const file = files.find(f => f.path === `models/${name}.f.dart`);
  expect(file).toBeDefined();
  return file!.content;
}

/**
 * Run the whole query parameter path, the way ServiceGenerator does: the
 * annotation only reaches the model if the parameter keeps its schema format
 * on the way out of EndpointGenerator.
 */
function generateQueryParams(operation: any): string {
  const queryParams = new EndpointGenerator()
    .generateGetMethod('exportPdf', '/reports/pdf', operation)
    .queryParams;

  const file = new ParamsGenerator().generateQueryParamsModel('exportPdf', queryParams);
  expect(file).not.toBeNull();
  return file!.content;
}

describe('Date format serialization', () => {
  it('should annotate date properties with a date-only converter', async () => {
    const content = await generate('post');

    // Without this the default DateTime encoding sends a full timestamp,
    // which a `format: date` field rejects
    expect(content).toContain('class _DateOnlyConverter implements JsonConverter<DateTime, String>');
    expect(content).toContain('@_DateOnlyConverter()\n    required DateTime date,');
  });

  it('should annotate nullable and repeated date properties', async () => {
    const content = await generate('post');

    expect(content).toContain('@_DateOnlyConverter()\n    DateTime? maybeDate,');
    expect(content).toContain('@_DateOnlyConverter()\n    List<DateTime>? dates,');
  });

  it('should leave date-time properties alone', async () => {
    const content = await generate('post');

    expect(content).toContain('DateTime? createdAt,');
    expect(content).not.toContain('@_DateOnlyConverter()\n    DateTime? createdAt,');
  });

  it('should not emit the converter for models without date properties', async () => {
    const content = await generate('timestamped');

    expect(content).not.toContain('_DateOnlyConverter');
  });

  it('should annotate date properties of a nested inline object', async () => {
    // Nested objects are generated through getters/object.ts, a separate path
    const content = await generate('report_period');

    expect(content).toContain('class _DateOnlyConverter implements JsonConverter<DateTime, String>');
    expect(content).toContain('@_DateOnlyConverter()\n    DateTime? from,');
    expect(content).not.toContain('@_DateOnlyConverter()\n    DateTime? at,');
  });

  it('should annotate date query parameters', () => {
    const content = generateQueryParams({
      operationId: 'exportPdf',
      parameters: [
        { name: 'fromDate', in: 'query', required: true, schema: { type: 'string', format: 'date' } },
        { name: 'at', in: 'query', required: false, schema: { type: 'string', format: 'date-time' } }
      ],
      responses: { '200': { description: 'ok' } }
    });

    expect(content).toContain('class _DateOnlyConverter implements JsonConverter<DateTime, String>');
    expect(content).toContain('@_DateOnlyConverter()\n    required DateTime fromDate,');
    expect(content).not.toContain('@_DateOnlyConverter()\n    DateTime? at,');
  });

  it('should annotate repeated date query parameters', () => {
    const content = generateQueryParams({
      operationId: 'exportPdf',
      parameters: [
        {
          name: 'days',
          in: 'query',
          required: false,
          schema: { type: 'array', items: { type: 'string', format: 'date' } }
        }
      ],
      responses: { '200': { description: 'ok' } }
    });

    expect(content).toContain('@_DateOnlyConverter()\n    List<DateTime>? days,');
  });

  it('should not emit the converter for query parameters without dates', () => {
    const content = generateQueryParams({
      operationId: 'exportPdf',
      parameters: [
        { name: 'at', in: 'query', required: false, schema: { type: 'string', format: 'date-time' } }
      ],
      responses: { '200': { description: 'ok' } }
    });

    expect(content).not.toContain('_DateOnlyConverter');
  });
});
