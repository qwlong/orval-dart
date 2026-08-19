import { describe, it, expect } from 'vitest';
import { generateModels } from '../../generators/models';

const specWith = (schemas: Record<string, any>) => ({
  openapi: '3.1.0',
  info: { title: 'Test API', version: '1.0.0' },
  paths: {},
  components: { schemas }
}) as any;

const generate = (spec: any) => generateModels(spec, {
  input: spec,
  output: { target: './test', mode: 'split', client: 'dio' }
} as any);

describe('a schema whose body is a $ref', () => {
  const base = { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] };

  it('should emit a typedef for an alias carrying sibling keywords', async () => {
    // OpenAPI 3.1 allows keywords next to $ref, and nestjs-zod emits `{ id, $ref }`
    // when a DTO is aliased under a second name
    const spec = specWith({
      OpenShiftResponseDto: base,
      OpenShiftResponseDtoV2: { id: 'OpenShiftResponseDtoV2', $ref: '#/components/schemas/OpenShiftResponseDto' }
    });
    const files = await generate(spec);

    const alias = files.find(f => f.path === 'models/open_shift_response_dto_v2.f.dart');
    expect(alias!.content).toContain('typedef OpenShiftResponseDtoV2 = OpenShiftResponseDto;');
    expect(alias!.content).toContain("import 'open_shift_response_dto.f.dart';");
    // The re-export is load-bearing: freezed writes its output as a `part of`
    // the referring model and resolves the typedef to the underlying class
    // there, so that class has to be in the referring file's scope
    expect(alias!.content).toContain("export 'open_shift_response_dto.f.dart';");
  });

  it('should emit a typedef for a bare $ref alias too', async () => {
    const spec = specWith({
      TimeOffRequestResponseDto: base,
      ManagersRequestsTimeOffRequestItemDto: { $ref: '#/components/schemas/TimeOffRequestResponseDto' }
    });
    const files = await generate(spec);

    const alias = files.find(f => f.path === 'models/managers_requests_time_off_request_item_dto.f.dart');
    expect(alias!.content).toContain(
      'typedef ManagersRequestsTimeOffRequestItemDto = TimeOffRequestResponseDto;'
    );
  });

  it('should leave referring models with an import that resolves', async () => {
    const spec = specWith({
      OpenShiftResponseDto: base,
      OpenShiftResponseDtoV2: { id: 'OpenShiftResponseDtoV2', $ref: '#/components/schemas/OpenShiftResponseDto' },
      ShiftResponseDto: {
        type: 'object',
        properties: {
          openShiftResponses: { type: 'array', items: { $ref: '#/components/schemas/OpenShiftResponseDtoV2' } }
        }
      }
    });
    const files = await generate(spec);

    // The referring model names the alias, so a file has to carry that name
    const referrer = files.find(f => f.path === 'models/shift_response_dto.f.dart');
    expect(referrer!.content).toContain("import 'open_shift_response_dto_v2.f.dart';");
    expect(referrer!.content).toContain('List<OpenShiftResponseDtoV2>?');

    const paths = new Set(files.map(f => f.path));
    for (const match of referrer!.content.matchAll(/^import '([a-z0-9_]+\.f\.dart)';$/gm)) {
      expect(paths.has(`models/${match[1]}`)).toBe(true);
    }

    expect(files.find(f => f.path === 'models/index.dart')!.content)
      .toContain("export 'open_shift_response_dto_v2.f.dart';");
  });

  it('should not treat a $ref carrying constraints as an alias', async () => {
    // A $ref with real keywords beside it is an override, not a second name
    const spec = specWith({
      Base: base,
      Narrowed: { $ref: '#/components/schemas/Base', type: 'object', properties: { extra: { type: 'string' } } }
    });
    const files = await generate(spec);

    const narrowed = files.find(f => f.path === 'models/narrowed.f.dart');
    expect(narrowed?.content ?? '').not.toContain('typedef Narrowed =');
  });
});
