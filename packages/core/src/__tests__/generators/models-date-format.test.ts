/**
 * `format: date` is a calendar date, not a point in time. It maps to DateTime
 * like `date-time` does, but has to serialize back as YYYY-MM-DD.
 */

import { describe, it, expect } from 'vitest';
import { generateModels } from '../../generators/models';
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

  it('should annotate date query parameters', () => {
    const generator = new ParamsGenerator();
    const file = generator.generateQueryParamsModel('exportPdf', [
      { dartName: 'fromDate', originalName: 'fromDate', required: true, type: 'DateTime', format: 'date' },
      { dartName: 'at', originalName: 'at', required: false, type: 'DateTime', format: 'date-time' }
    ]);

    expect(file).not.toBeNull();
    expect(file!.content).toContain('class _DateOnlyConverter implements JsonConverter<DateTime, String>');
    expect(file!.content).toContain('@_DateOnlyConverter()\n    required DateTime fromDate,');
    expect(file!.content).not.toContain('@_DateOnlyConverter()\n    DateTime? at,');
  });
});
