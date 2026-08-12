import { describe, it, expect } from 'vitest';
import { ModelGenerator } from '../../generators';

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
      expect(result.content).toContain('valueMinus1');
      expect(result.content).toContain('valueMinus2Point5');
      expect(result.content).toContain('value1Point5');
      expect(result.content).toContain('value15');
    });

    it('should keep exponent notation legal', () => {
      const result = generator.generateEnum('Big', [1e21], undefined, 'number');

      expect(result.content).toContain('value1ePlus21');
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

  describe('boolean enums', () => {
    it('should serialize boolean values as literals', () => {
      const result = generator.generateEnum('Toggle', [true, false], undefined, 'boolean');

      expect(result.content).toContain('@JsonValue(true)');
      expect(result.content).toContain('@JsonValue(false)');
      expect(result.content).not.toContain("@JsonValue('true')");

      // true and false are keywords, so the members need prefixing
      expect(result.content).toContain('valueTrue');
      expect(result.content).toContain('valueFalse');
    });

    it('should expose boolean enums through a bool-based extension', () => {
      const result = generator.generateEnum('Toggle', [true, false], undefined, 'boolean');

      expect(result.content).toContain('bool get value');
      expect(result.content).toContain('static Toggle? fromValue(bool? value)');

      // A switch over bool covers every case; a default clause would be
      // reported as unreachable
      expect(result.content).not.toContain('default:');
      expect(result.content).not.toContain('unknown');
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
