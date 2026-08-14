import { describe, it, expect } from 'vitest';
import { ModelGenerator, generateDartCode } from '../../generators';
import { generateModels } from '../../generators/models';

const specWith = (schemas: Record<string, any>) => ({
  openapi: '3.0.0',
  info: { title: 'Test API', version: '1.0.0' },
  paths: {},
  components: { schemas }
}) as any;

const booleanSpec = specWith({ Toggle: { type: 'boolean', enum: [true, false] } });
const decimalSpec = specWith({ Scale: { type: 'number', enum: [1.5, 2.5] } });
const integerSpec = specWith({ DayOfWeek: { type: 'integer', enum: [-1, 1, 2] } });
const inlineBooleanSpec = specWith({
  Holder: { type: 'object', properties: { flag: { type: 'boolean', enum: [true, false] } } }
});

describe('Enum Generation', () => {
  const generator = new ModelGenerator();

  it('should generate enum with string values', () => {
    const result = generator.generateEnum(
      'PetStatus',
      ['available', 'pending', 'sold'],
      'Pet status in the store'
    );

    expect(result.path).toBe('models/pet_status.f.dart');
    expect(result.content).toContain('enum PetStatus');
    expect(result.content).toContain("@JsonValue('available')");
    expect(result.content).toContain('available');
    expect(result.content).toContain("@JsonValue('pending')");
    expect(result.content).toContain('pending');
    expect(result.content).toContain("@JsonValue('sold')");
    expect(result.content).toContain('sold');
    expect(result.content).toContain('Pet status in the store');
    expect(result.content).toContain('PetStatus fromValue(String? value)');
    expect(result.content).toContain('extension PetStatusExtension on PetStatus');
    // Should have unknown fallback value
    expect(result.content).toContain("@JsonValue('unknown')");
    expect(result.content).toContain('unknown');
  });

  it('should handle enum values with special characters', () => {
    const result = generator.generateEnum(
      'OrderStatus',
      ['in-progress', 'completed', '404_error', '1_pending'],
      undefined
    );

    expect(result.content).toContain("@JsonValue('in-progress')");
    expect(result.content).toContain('inProgress');
    expect(result.content).toContain("@JsonValue('completed')");
    expect(result.content).toContain('completed');
    // 404_error starts with a number after replacing special chars, so it gets value prefix
    expect(result.content).toContain("@JsonValue('404_error')");
    expect(result.content).toContain("@JsonValue('1_pending')");
  });

  it('should handle numeric enum values', () => {
    const result = generator.generateEnum(
      'HttpStatus',
      ['200', '404', '500'],
      'HTTP status codes'
    );

    expect(result.content).toContain("@JsonValue('200')");
    expect(result.content).toContain('value200');
    expect(result.content).toContain("@JsonValue('404')");
    expect(result.content).toContain('value404');
    expect(result.content).toContain("@JsonValue('500')");
    expect(result.content).toContain('value500');
  });

  it('should generate proper fromValue and toJson methods', () => {
    const result = generator.generateEnum(
      'TestEnum',
      ['val1', 'val2'],
      undefined
    );

    expect(result.content).toContain('enum TestEnum');
    expect(result.content).toContain('@JsonValue');
    expect(result.content).toContain('extension TestEnumExtension on TestEnum');
    expect(result.content).toContain('String get value');
    expect(result.content).toContain('TestEnum fromValue(String? value)');
    // Should return unknown for unrecognized values
    expect(result.content).toContain('return TestEnum.unknown');
  });

  it('should add unknown fallback value for forward compatibility', () => {
    const result = generator.generateEnum(
      'StatusEnum',
      ['active', 'inactive'],
      'Status values'
    );

    // Should have unknown value added automatically
    expect(result.content).toContain("@JsonValue('unknown')");
    expect(result.content).toContain('unknown');

    // fromValue should return non-nullable type
    expect(result.content).toContain('StatusEnum fromValue(String? value)');
    expect(result.content).not.toContain('StatusEnum? fromValue');

    // Should return unknown for null input
    expect(result.content).toContain('if (value == null) return StatusEnum.unknown');

    // Should return unknown for unrecognized values
    expect(result.content).toContain('return StatusEnum.unknown');
  });

  it('should not add duplicate unknown if already present', () => {
    const result = generator.generateEnum(
      'MyEnum',
      ['value1', 'unknown', 'value2'],
      undefined
    );

    // Count occurrences of @JsonValue('unknown')
    const matches = result.content.match(/@JsonValue\('unknown'\)/g);
    expect(matches?.length).toBe(1);
  });

  it('should serialize numeric enum values as numbers', () => {
    const result = generator.generateEnum(
      'DayOfWeek',
      [1, 2, 3, 4, 5, 6, 7],
      'Day of the week (1-7, where 1 is Monday and 7 is Sunday)'
    );

    // Quoting these would send "1" instead of 1 and break decoding on the way back
    expect(result.content).toContain('@JsonValue(1)');
    expect(result.content).toContain('@JsonValue(7)');
    expect(result.content).not.toContain("@JsonValue('1')");
    expect(result.content).toContain('value1');
    expect(result.content).toContain('value7');
  });

  it('should expose numeric enums through a num-based extension', () => {
    const result = generator.generateEnum('DayOfWeek', [1, 2, 3], undefined);

    expect(result.content).toContain('num get value');
    expect(result.content).toContain('static DayOfWeek? fromValue(num? value)');
    expect(result.content).toContain('return 1;');
    expect(result.content).toContain('case 1:');

    expect(result.content).not.toContain('String get value');
    expect(result.content).not.toContain('fromValue(String? value)');
  });

  it('should not add an unknown fallback to numeric enums', () => {
    const result = generator.generateEnum('HttpCode', [200, 404, 500], undefined);

    // No numeric value is safe to reserve as a sentinel
    expect(result.content).not.toContain('unknown');
    expect(result.content).toContain('if (value == null) return null;');
    expect(result.content).toContain('return null;');
  });

  it('should keep numeric-looking string values quoted', () => {
    const result = generator.generateEnum('HttpStatus', ['200', '404'], undefined);

    expect(result.content).toContain("@JsonValue('200')");
    expect(result.content).not.toContain('@JsonValue(200)');
    expect(result.content).toContain('String get value');
    expect(result.content).toContain("@JsonValue('unknown')");
  });

  it('should respect a declared string type over the value runtime type', () => {
    // YAML parses an unquoted `enum: [1, 2]` into JS numbers, but under
    // `type: string` the server still sends "1"
    const result = generator.generateEnum('Status', [1, 2], undefined, 'string');

    expect(result.content).toContain("@JsonValue('1')");
    expect(result.content).not.toContain('@JsonValue(1)');
    expect(result.content).toContain('String get value');
  });

  it('should treat integer and number types as numeric', () => {
    for (const type of ['integer', 'number']) {
      const result = generator.generateEnum('Code', [1, 2], undefined, type);
      expect(result.content).toContain('@JsonValue(1)');
      expect(result.content).toContain('num get value');
    }
  });

  it('should keep nullable numeric enums numeric', () => {
    const result = generator.generateEnum('DayOfWeek', [1, 2, null], undefined, 'integer');

    expect(result.content).toContain('@JsonValue(1)');
    expect(result.content).toContain('@JsonValue(2)');
    expect(result.content).not.toContain("@JsonValue('1')");
    expect(result.content).toContain('num get value');
  });

  it('should leave null out of numeric enum members', () => {
    const result = generator.generateEnum('DayOfWeek', [1, 2, null], undefined, 'integer');

    // json_serializable decodes a null source to Dart null without consulting
    // the value map, so a nullValue member could never come back from fromJson
    expect(result.content).not.toContain('nullValue');
    expect(result.content).not.toContain('@JsonValue(null)');
    expect(result.content).toContain('if (value == null) return null;');
  });

  it('should fall back to the string branch for mixed value types', () => {
    const result = generator.generateEnum('Mixed', [1, 'two'], undefined);

    expect(result.content).toContain("@JsonValue('1')");
    expect(result.content).toContain("@JsonValue('two')");
    expect(result.content).toContain('String get value');
  });

  describe('member names Dart would reject', () => {
    it('should keep the sign and the decimal point of numeric values', () => {
      const result = generator.generateEnum('Scale', [-1, -2.5, 1.5, 15], undefined, 'number');

      // Sanitizing used to drop both, leaving -1 named '1' and landing 1.5 on 15
        // Separators matter here - a bare toContain('value15') is also satisfied
      // by value150
      expect(result.content).toContain('  valueMinus1,');
      expect(result.content).toContain('  valueMinus2Point5,');
      expect(result.content).toContain('  value1Point5,');
      expect(result.content).toContain('  value15\n');
    });

    it('should keep exponent notation legal', () => {
      const result = generator.generateEnum('Big', [1e21], undefined, 'number');

      expect(result.content).toContain('  value1ePlus21\n');
    });

    it('should prefix Dart reserved words', () => {
      const result = generator.generateEnum('Reserved', ['new', 'class', 'default'], undefined, 'string');

      expect(result.content).toContain('valueNew');
      expect(result.content).toContain('valueClass');
      expect(result.content).toContain('valueDefault');
      // The @JsonValue keeps the original spelling
      expect(result.content).toContain("@JsonValue('new')");
    });

    it('should prefix names an enum already declares', () => {
      const result = generator.generateEnum('Builtins', ['values', 'index'], undefined, 'string');

      // `values` is generated for every enum, `index` comes from Enum
      expect(result.content).toContain('valueValues');
      expect(result.content).toContain('valueIndex');
    });

    it('should leave a member named value alone', () => {
      const result = generator.generateEnum('Named', ['value'], undefined, 'string');

      // Enum members are static and the extension getter is an instance
      // member, so these do not collide
      expect(result.content).toContain('@JsonValue(\'value\')\n  value');
    });

    it('should give sanitized-away values a usable name', () => {
      const result = generator.generateEnum('Unicode', ['日本', '-'], undefined, 'string');

      // Both sanitize down to an empty string, which is not an identifier
      expect(result.content).toContain('@JsonValue(\'日本\')\n  value');
      expect(result.content).toContain('@JsonValue(\'-\')\n  value2');
    });
  });

  describe('values Dart or Handlebars would rewrite', () => {
    it('should escape what Dart reads as syntax', () => {
      const result = generator.generateEnum('Tricky', ["it's", '$foo', 'C:\\path'], undefined, 'string');

      // A bare quote closes the literal and `$` starts an interpolation
      expect(result.content).toContain("@JsonValue('it\\'s')");
      expect(result.content).toContain("@JsonValue('\\$foo')");
      expect(result.content).toContain("@JsonValue('C:\\\\path')");
    });

    it('should keep values Handlebars would HTML-escape intact', () => {
      const result = generator.generateEnum('Web', ['a=b', 'a&b', 'x>y'], undefined, 'string');

      // Escaping is on for templates, and `a&#x3D;b` compiles fine while
      // sending the wrong thing over the wire
      expect(result.content).toContain("@JsonValue('a=b')");
      expect(result.content).toContain("@JsonValue('a&b')");
      expect(result.content).toContain("@JsonValue('x>y')");
      expect(result.content).not.toContain('&#x3D;');
      expect(result.content).not.toContain('&amp;');
      expect(result.content).not.toContain('&gt;');
    });
  });

  describe('colliding member names', () => {
    it('should suffix values that differ only in case', () => {
      const result = generator.generateEnum('Status', ['Active', 'active'], undefined, 'string');

      expect(result.content).toContain('  active,');
      expect(result.content).toContain('  active2');
    });

    it('should suffix values that differ only in separators', () => {
      const result = generator.generateEnum('Sep', ['a-b', 'a_b'], undefined, 'string');

      expect(result.content).toContain('  aB,');
      expect(result.content).toContain('  aB2');
    });

    it('should collapse repeated values onto one member', () => {
      const result = generator.generateEnum('Same', [1.0, 1], undefined, 'number');

      // YAML parses both to the same number, and two members sharing a
      // @JsonValue would make the generated map ambiguous
      expect(result.content.match(/@JsonValue\(1\)/g)?.length).toBe(1);
      expect(result.content).not.toContain('value12');
    });
  });

  describe('values Dart cannot express', () => {
    it('should not generate a Dart enum for a single boolean value', async () => {
      // A one-value boolean enum is a common constant marker in specs
      const spec = specWith({ Flag: { type: 'boolean', enum: [true] } });
      const files = await generateModels(spec, {
        input: spec,
        output: { target: './test', mode: 'split', client: 'dio' }
      } as any);

      expect(files.find(f => f.path === 'models/flag.f.dart')!.content).toContain('typedef Flag = bool;');
    });

    it('should not generate a Dart enum for mixed value types', async () => {
      // Both members would render as @JsonValue('1'), which is ambiguous
      const spec = specWith({ Mixed: { type: 'string', enum: [1, '1'] } });
      const files = await generateModels(spec, {
        input: spec,
        output: { target: './test', mode: 'split', client: 'dio' }
      } as any);

      expect(files.find(f => f.path === 'models/mixed.f.dart')!.content).toContain('typedef Mixed = String;');
    });

    it('should not generate a Dart enum for booleans', async () => {
      // json_serializable only accepts String, int or null in a @JsonValue,
      // so `@JsonValue(true)` fails the build
      const files = await generateModels(booleanSpec, {
        input: booleanSpec,
        output: { target: './test', mode: 'split', client: 'dio' }
      } as any);

      const file = files.find(f => f.path === 'models/toggle.f.dart');
      expect(file!.content).toContain('typedef Toggle = bool;');
      expect(file!.content).not.toContain('@JsonValue(');
    });

    it('should not generate a Dart enum for decimals', async () => {
      const files = await generateModels(decimalSpec, {
        input: decimalSpec,
        output: { target: './test', mode: 'split', client: 'dio' }
      } as any);

      const file = files.find(f => f.path === 'models/scale.f.dart');
      expect(file!.content).toContain('typedef Scale = double;');
      expect(file!.content).not.toContain('@JsonValue(');
    });

    it('should keep the property scalar for an inline unrepresentable enum', async () => {
      const files = await generateModels(inlineBooleanSpec, {
        input: inlineBooleanSpec,
        output: { target: './test', mode: 'split', client: 'dio' }
      } as any);

      const file = files.find(f => f.path === 'models/holder.f.dart');
      expect(file!.content).toContain('bool? flag,');
      expect(files.find(f => f.path.includes('holder_flag_enum'))).toBeUndefined();
    });

    it('should read the scalar type off the values when the schema omits it', async () => {
      const spec = specWith({ Flag: { enum: [true, false] }, Ratio: { enum: [1.5, 2.5] } });
      const files = await generateModels(spec, {
        input: spec,
        output: { target: './test', mode: 'split', client: 'dio' }
      } as any);

      expect(files.find(f => f.path === 'models/flag.f.dart')!.content).toContain('typedef Flag = bool;');
      expect(files.find(f => f.path === 'models/ratio.f.dart')!.content).toContain('typedef Ratio = double;');
    });

    it('should still generate integer enums', async () => {
      const files = await generateModels(integerSpec, {
        input: integerSpec,
        output: { target: './test', mode: 'split', client: 'dio' }
      } as any);

      const file = files.find(f => f.path === 'models/day_of_week.f.dart');
      expect(file!.content).toContain('@JsonValue(1)');
      expect(file!.content).toContain('valueMinus1');
    });
  });

  describe('the unknown sentinel', () => {
    it('should not hand the sentinel over to a value that spells out unknown', () => {
      const result = generator.generateEnum('Cased', ['Unknown'], undefined, 'string');

      // 'Unknown' sanitizes to `unknown`, but it is a real value - taking it
      // for the sentinel would decode every unrecognised value as 'Unknown'
      expect(result.content).toContain("@JsonValue('Unknown')\n  unknown,");
      expect(result.content).toContain("@JsonValue('unknown')\n  unknown2");
      expect(result.content).toContain('if (value == null) return Cased.unknown2;');
      expect(result.content).toContain('default:\n        return Cased.unknown2;');
    });

    it('should reuse a declared unknown value as the sentinel', () => {
      const result = generator.generateEnum('Declared', ['unknown', 'active'], undefined, 'string');

      expect(result.content.match(/@JsonValue\('unknown'\)/g)?.length).toBe(1);
      // The sentinel is what the default arm returns, so it gets no case
      expect(result.content).not.toContain("case 'unknown':");
      expect(result.content).toContain('default:\n        return Declared.unknown;');
    });
  });

  describe('a parameter whose enum Dart cannot express', () => {
    const paramSpec = {
      openapi: '3.0.0',
      info: { title: 'Test API', version: '1.0.0' },
      paths: {
        '/r': {
          get: {
            operationId: 'getR',
            parameters: [
              { name: 'ratio', in: 'query', schema: { type: 'number', enum: [1.5, 2.5] } }
            ],
            responses: { '200': { description: 'ok' } }
          }
        }
      },
      components: { schemas: {} }
    } as any;

    it('should still emit the type the parameter model refers to', async () => {
      const files = await generateDartCode({
        input: paramSpec,
        output: { target: './test', mode: 'split', client: 'dio' }
      } as any);

      // endpoint-generator names a parameter's enum type by convention rather
      // than from what got generated, so the file has to exist either way
      const params = files.find(f => f.path === 'models/params/get_r_params.f.dart');
      expect(params!.content).toContain('GetRRatioEnum? ratio,');
      expect(params!.content).toContain("import '../get_r_ratio_enum.f.dart';");

      const enumFile = files.find(f => f.path === 'models/get_r_ratio_enum.f.dart');
      expect(enumFile!.content).toContain('typedef GetRRatioEnum = double;');
    });
  });

  describe('a header parameter with an enum', () => {
    const headerSpec = {
      openapi: '3.0.0',
      info: { title: 'Test API', version: '1.0.0' },
      paths: {
        '/s': {
          get: {
            operationId: 'getStatus',
            parameters: [
              { name: 'X-Mode', in: 'header', schema: { type: 'string', enum: ['a', 'b'] } }
            ],
            responses: { '200': { description: 'ok' } }
          }
        }
      },
      components: { schemas: {} }
    } as any;

    it('should spell the type the same way the model declares it', async () => {
      const files = await generateDartCode({
        input: headerSpec,
        output: { target: './test', mode: 'split', client: 'dio' }
      } as any);

      // The declaration goes through toDartClassName, which reads XMo as an
      // acronym - the reference has to be normalised the same way
      const headers = files.find(f => f.path === 'models/headers/get_status_headers.f.dart');
      expect(headers!.content).toContain('GetSxModeEnum? xMode,');
      expect(headers!.content).toContain("import '../get_sx_mode_enum.f.dart';");

      const enumFile = files.find(f => f.path === 'models/get_sx_mode_enum.f.dart');
      expect(enumFile!.content).toContain('enum GetSxModeEnum {');
    });
  });

  it('should drop a null value from a string enum', () => {
    const result = generator.generateEnum('Nullable', ['null', null], undefined, 'string');

    // The string 'null' keeps its member; the actual null gets none, since
    // json_serializable decodes a null source to Dart null regardless
    expect(result.content.match(/@JsonValue\('null'\)/g)?.length).toBe(1);
    expect(result.content).not.toContain('@JsonValue(null)');
  });
});
