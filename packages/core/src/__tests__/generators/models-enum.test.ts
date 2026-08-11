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

  it('should fall back to the string branch for mixed value types', () => {
    const result = generator.generateEnum('Mixed', [1, 'two'], undefined);

    expect(result.content).toContain("@JsonValue('1')");
    expect(result.content).toContain("@JsonValue('two')");
    expect(result.content).toContain('String get value');
  });
});