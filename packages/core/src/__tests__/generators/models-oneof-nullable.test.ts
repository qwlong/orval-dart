import { describe, it, expect } from 'vitest';
import { generateModels } from '../../generators/models';
import { TypeMapper } from '../../utils';
import { getObject } from '../../getters/object';

describe('OneOf Nullable Pattern', () => {
  describe('TypeMapper', () => {
    it('should detect nullable oneOf pattern', () => {
      const schema = {
        oneOf: [
          { type: 'string' },
          { type: 'null' }
        ]
      };
      
      expect(TypeMapper.isNullableOneOf(schema as any)).toBe(true);
      expect(TypeMapper.isNullable(schema as any)).toBe(true);
    });

    it('should extract base type from nullable oneOf', () => {
      const schema = {
        oneOf: [
          { type: 'string' },
          { type: 'null' }
        ]
      };
      
      const baseType = TypeMapper.getBaseTypeFromNullable(schema as any);
      expect(baseType).toEqual({ type: 'string' });
      
      const mappedType = TypeMapper.mapType(baseType as any);
      expect(mappedType).toBe('String');
    });

    it('should handle different type orders in oneOf', () => {
      const schema1 = {
        oneOf: [
          { type: 'null' },
          { type: 'string' }
        ]
      };
      
      const schema2 = {
        oneOf: [
          { type: 'string' },
          { type: 'null' }
        ]
      };
      
      expect(TypeMapper.isNullableOneOf(schema1 as any)).toBe(true);
      expect(TypeMapper.isNullableOneOf(schema2 as any)).toBe(true);
      
      const base1 = TypeMapper.getBaseTypeFromNullable(schema1 as any);
      const base2 = TypeMapper.getBaseTypeFromNullable(schema2 as any);
      
      expect(base1).toEqual({ type: 'string' });
      expect(base2).toEqual({ type: 'string' });
    });

    it('should handle numeric types in oneOf nullable', () => {
      const intSchema = {
        oneOf: [
          { type: 'integer' },
          { type: 'null' }
        ]
      };
      
      const numberSchema = {
        oneOf: [
          { type: 'number' },
          { type: 'null' }
        ]
      };
      
      expect(TypeMapper.isNullableOneOf(intSchema as any)).toBe(true);
      expect(TypeMapper.isNullableOneOf(numberSchema as any)).toBe(true);
      
      const intBase = TypeMapper.getBaseTypeFromNullable(intSchema as any);
      const numberBase = TypeMapper.getBaseTypeFromNullable(numberSchema as any);
      
      expect(TypeMapper.mapType(intBase as any)).toBe('int');
      expect(TypeMapper.mapType(numberBase as any)).toBe('double');
    });

    it('should not detect non-nullable oneOf patterns', () => {
      const schema = {
        oneOf: [
          { type: 'string' },
          { type: 'number' }
        ]
      };
      
      expect(TypeMapper.isNullableOneOf(schema as any)).toBe(false);
    });

    it('should handle oneOf with more than 2 options', () => {
      const schema = {
        oneOf: [
          { type: 'string' },
          { type: 'number' },
          { type: 'null' }
        ]
      };
      
      // Should not be detected as simple nullable pattern
      expect(TypeMapper.isNullableOneOf(schema as any)).toBe(false);
    });
  });

  describe('Model Generation', () => {
    it('should generate nullable string for oneOf [string, null]', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        components: {
          schemas: {
            TestModel: {
              type: 'object',
              properties: {
                nullableString: {
                  oneOf: [
                    { type: 'string' },
                    { type: 'null' }
                  ]
                },
                requiredString: {
                  type: 'string'
                }
              },
              required: ['requiredString']
            }
          }
        },
        paths: {}
      };

      const files = await generateModels(spec as any, {
        input: spec as any,
        output: { target: './test', mode: 'split', client: 'dio' }
      });

      const model = files.find(f => f.path === 'models/test_model.f.dart');
      expect(model).toBeDefined();
      expect(model?.content).toContain('String? nullableString');
      expect(model?.content).toContain('required String requiredString');
      // Check that the property type is not dynamic (but fromJson signature is ok)
      expect(model?.content).not.toMatch(/dynamic\??\s+nullableString/);
    });

    it('should generate nullable int for oneOf [integer, null]', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        components: {
          schemas: {
            NumberModel: {
              type: 'object',
              properties: {
                nullableInt: {
                  oneOf: [
                    { type: 'integer' },
                    { type: 'null' }
                  ]
                },
                nullableDouble: {
                  oneOf: [
                    { type: 'number' },
                    { type: 'null' }
                  ]
                }
              }
            }
          }
        },
        paths: {}
      };

      const files = await generateModels(spec as any, {
        input: spec as any,
        output: { target: './test', mode: 'split', client: 'dio' }
      });

      const model = files.find(f => f.path === 'models/number_model.f.dart');
      expect(model).toBeDefined();
      expect(model?.content).toContain('int? nullableInt');
      expect(model?.content).toContain('double? nullableDouble');
    });

    it('should generate nullable bool for oneOf [boolean, null]', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        components: {
          schemas: {
            BoolModel: {
              type: 'object',
              properties: {
                nullableBool: {
                  oneOf: [
                    { type: 'boolean' },
                    { type: 'null' }
                  ]
                }
              }
            }
          }
        },
        paths: {}
      };

      const files = await generateModels(spec as any, {
        input: spec as any,
        output: { target: './test', mode: 'split', client: 'dio' }
      });

      const model = files.find(f => f.path === 'models/bool_model.f.dart');
      expect(model).toBeDefined();
      expect(model?.content).toContain('bool? nullableBool');
    });

    it('should generate nullable array for oneOf [array, null]', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        components: {
          schemas: {
            ArrayModel: {
              type: 'object',
              properties: {
                nullableArray: {
                  oneOf: [
                    { 
                      type: 'array',
                      items: { type: 'string' }
                    },
                    { type: 'null' }
                  ]
                }
              }
            }
          }
        },
        paths: {}
      };

      const files = await generateModels(spec as any, {
        input: spec as any,
        output: { target: './test', mode: 'split', client: 'dio' }
      });

      const model = files.find(f => f.path === 'models/array_model.f.dart');
      expect(model).toBeDefined();
      expect(model?.content).toContain('List<String>? nullableArray');
    });

    it('should generate nullable DateTime for oneOf [date-time, null]', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        components: {
          schemas: {
            DateModel: {
              type: 'object',
              properties: {
                nullableDate: {
                  oneOf: [
                    { 
                      type: 'string',
                      format: 'date-time'
                    },
                    { type: 'null' }
                  ]
                }
              }
            }
          }
        },
        paths: {}
      };

      const files = await generateModels(spec as any, {
        input: spec as any,
        output: { target: './test', mode: 'split', client: 'dio' }
      });

      const model = files.find(f => f.path === 'models/date_model.f.dart');
      expect(model).toBeDefined();
      expect(model?.content).toContain('DateTime? nullableDate');
    });

    it('should handle oneOf with description', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        components: {
          schemas: {
            DescribedModel: {
              type: 'object',
              properties: {
                fieldWithDescription: {
                  description: 'This is a nullable field',
                  oneOf: [
                    { type: 'string' },
                    { type: 'null' }
                  ]
                }
              }
            }
          }
        },
        paths: {}
      };

      const files = await generateModels(spec as any, {
        input: spec as any,
        output: { target: './test', mode: 'split', client: 'dio' }
      });

      const model = files.find(f => f.path === 'models/described_model.f.dart');
      expect(model).toBeDefined();
      expect(model?.content).toContain('/// This is a nullable field');
      expect(model?.content).toContain('String? fieldWithDescription');
    });

    it('should generate dynamic for complex oneOf patterns', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        components: {
          schemas: {
            ComplexModel: {
              type: 'object',
              properties: {
                // Complex oneOf with multiple non-null types
                unionField: {
                  oneOf: [
                    { type: 'string' },
                    { type: 'number' }
                  ]
                },
                // OneOf with more than 2 options
                multiUnion: {
                  oneOf: [
                    { type: 'string' },
                    { type: 'number' },
                    { type: 'boolean' }
                  ]
                }
              }
            }
          }
        },
        paths: {}
      };

      const files = await generateModels(spec as any, {
        input: spec as any,
        output: { target: './test', mode: 'split', client: 'dio' }
      });

      const model = files.find(f => f.path === 'models/complex_model.f.dart');
      expect(model).toBeDefined();
      // Complex unions should still be dynamic, and dynamic carries no `?`
      expect(model?.content).toContain('dynamic unionField');
      expect(model?.content).toContain('dynamic multiUnion');
      expect(model?.content).not.toContain('dynamic?');
    });

    it('should handle anyOf nullable pattern similar to oneOf', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        components: {
          schemas: {
            AnyOfModel: {
              type: 'object',
              properties: {
                anyOfNullable: {
                  anyOf: [
                    { type: 'string' },
                    { type: 'null' }
                  ]
                }
              }
            }
          }
        },
        paths: {}
      };

      const files = await generateModels(spec as any, {
        input: spec as any,
        output: { target: './test', mode: 'split', client: 'dio' }
      });

      const model = files.find(f => f.path === 'models/any_of_model.f.dart');
      expect(model).toBeDefined();
      expect(model?.content).toContain('String? anyOfNullable');
    });

    it('should handle required oneOf nullable fields', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        components: {
          schemas: {
            RequiredNullableModel: {
              type: 'object',
              properties: {
                // Even though it's required, the oneOf allows null
                requiredButNullable: {
                  oneOf: [
                    { type: 'string' },
                    { type: 'null' }
                  ]
                }
              },
              required: ['requiredButNullable']
            }
          }
        },
        paths: {}
      };

      const files = await generateModels(spec as any, {
        input: spec as any,
        output: { target: './test', mode: 'split', client: 'dio' }
      });

      const model = files.find(f => f.path === 'models/required_nullable_model.f.dart');
      expect(model).toBeDefined();
      // Should be required but nullable (explicit null allowed)
      expect(model?.content).toContain('required String? requiredButNullable');
    });
  });

  describe('getObject getter', () => {
    it('should handle oneOf nullable in property processing', () => {
      const schema = {
        type: 'object',
        properties: {
          nullableField: {
            oneOf: [
              { type: 'string' },
              { type: 'null' }
            ]
          }
        }
      };

      const result = getObject(schema as any, 'TestObject', {});
      
      expect(result.properties).toBeDefined();
      const prop = Array.from(result.properties?.values() || [])[0];
      expect(prop?.type).toBe('String?');
      expect(prop?.type).not.toContain('dynamic');
    });

    it('should handle nested object with oneOf nullable fields', () => {
      const schema = {
        type: 'object',
        properties: {
          nested: {
            type: 'object',
            properties: {
              nullableNested: {
                oneOf: [
                  { type: 'integer' },
                  { type: 'null' }
                ]
              }
            }
          }
        }
      };

      const result = getObject(schema.properties.nested as any, 'NestedObject', {});
      
      expect(result.properties).toBeDefined();
      const prop = Array.from(result.properties?.values() || [])[0];
      expect(prop?.type).toBe('int?');
    });
  });

  describe('Edge Cases', () => {
    it('should handle oneOf with empty schema and null', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        components: {
          schemas: {
            EmptyNullModel: {
              type: 'object',
              properties: {
                emptyOrNull: {
                  oneOf: [
                    {},
                    { type: 'null' }
                  ]
                }
              }
            }
          }
        },
        paths: {}
      };

      const files = await generateModels(spec as any, {
        input: spec as any,
        output: { target: './test', mode: 'split', client: 'dio' }
      });

      const model = files.find(f => f.path === 'models/empty_null_model.f.dart');
      expect(model).toBeDefined();
      // Empty schema with null should be treated as dynamic
      expect(model?.content).toMatch(/dynamic\??\s+emptyOrNull/);
    });

    it('should handle oneOf with ref and null', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        components: {
          schemas: {
            ReferencedType: {
              type: 'object',
              properties: {
                value: { type: 'string' }
              }
            },
            RefNullModel: {
              type: 'object',
              properties: {
                refOrNull: {
                  oneOf: [
                    { $ref: '#/components/schemas/ReferencedType' },
                    { type: 'null' }
                  ]
                }
              }
            }
          }
        },
        paths: {}
      };

      const files = await generateModels(spec as any, {
        input: spec as any,
        output: { target: './test', mode: 'split', client: 'dio' }
      });

      const model = files.find(f => f.path === 'models/ref_null_model.f.dart');
      expect(model).toBeDefined();
      expect(model?.content).toContain('ReferencedType? refOrNull');
    });

    it('should handle oneOf with multiple nulls (invalid but defensive)', () => {
      const schema = {
        oneOf: [
          { type: 'null' },
          { type: 'null' }
        ]
      };
      
      // Should not crash, should treat as dynamic
      expect(TypeMapper.isNullableOneOf(schema as any)).toBe(false);
    });

    it('should handle oneOf with nested oneOf patterns', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        components: {
          schemas: {
            NestedOneOfModel: {
              type: 'object',
              properties: {
                nested: {
                  oneOf: [
                    {
                      oneOf: [
                        { type: 'string' },
                        { type: 'number' }
                      ]
                    },
                    { type: 'null' }
                  ]
                }
              }
            }
          }
        },
        paths: {}
      };

      const files = await generateModels(spec as any, {
        input: spec as any,
        output: { target: './test', mode: 'split', client: 'dio' }
      });

      const model = files.find(f => f.path === 'models/nested_one_of_model.f.dart');
      expect(model).toBeDefined();
      // Nested oneOf is complex, should be dynamic
      expect(model?.content).toMatch(/dynamic\??\s+nested/);
    });

    it('should handle oneOf with format specifications', async () => {
      const spec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        components: {
          schemas: {
            FormatModel: {
              type: 'object',
              properties: {
                uuidOrNull: {
                  oneOf: [
                    { type: 'string', format: 'uuid' },
                    { type: 'null' }
                  ]
                },
                emailOrNull: {
                  oneOf: [
                    { type: 'string', format: 'email' },
                    { type: 'null' }
                  ]
                }
              }
            }
          }
        },
        paths: {}
      };

      const files = await generateModels(spec as any, {
        input: spec as any,
        output: { target: './test', mode: 'split', client: 'dio' }
      });

      const model = files.find(f => f.path === 'models/format_model.f.dart');
      expect(model).toBeDefined();
      // UUID and email formats should still be String?
      expect(model?.content).toContain('String? uuidOrNull');
      expect(model?.content).toContain('String? emailOrNull');
    });
  });
});