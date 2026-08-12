import { describe, it, expect } from 'vitest';
import { generateModels } from '../../generators/models';
import { OpenAPIObject } from '../../types';

describe('Inline Enum Generation', () => {
  it('should extract and generate inline enum from property', async () => {
    const spec: OpenAPIObject = {
      openapi: '3.0.0',
      info: {
        title: 'Test API',
        version: '1.0.0'
      },
      paths: {},
      components: {
        schemas: {
          FlagShiftDto: {
            type: 'object',
            required: ['reason'],
            properties: {
              reason: {
                type: 'string',
                description: 'The reason for flagging'
              },
              flaggedCode: {
                type: 'string',
                description: 'Predefined flagged code that a worker picks when flagging a shift',
                enum: ['worker_not_available', 'worker_request_an_edit'],
                example: 'worker_not_available'
              },
              coverage: {
                $ref: '#/components/schemas/ShiftFlagCoverageDto'
              }
            }
          },
          ShiftFlagCoverageDto: {
            type: 'object',
            properties: {
              covered: {
                type: 'boolean'
              }
            }
          }
        }
      }
    };

    const files = await generateModels(spec, { 
      input: spec,
      output: { target: './test', mode: 'split', client: 'dio' } 
    } as any);

    // Should generate the main model file
    const flagShiftFile = files.find(f => f.path === 'models/flag_shift_dto.f.dart');
    expect(flagShiftFile).toBeDefined();
    expect(flagShiftFile!.content).toContain('class FlagShiftDto');
    expect(flagShiftFile!.content).toContain('FlagShiftDtoFlaggedCodeEnum? flaggedCode');
    expect(flagShiftFile!.content).toContain("import 'flag_shift_dto_flagged_code_enum.f.dart';");

    // Should generate the enum file for inline enum
    const enumFile = files.find(f => f.path === 'models/flag_shift_dto_flagged_code_enum.f.dart');
    expect(enumFile).toBeDefined();
    expect(enumFile!.content).toContain('enum FlagShiftDtoFlaggedCodeEnum');
    expect(enumFile!.content).toContain("@JsonValue('worker_not_available')");
    expect(enumFile!.content).toContain('workerNotAvailable');
    expect(enumFile!.content).toContain("@JsonValue('worker_request_an_edit')");
    expect(enumFile!.content).toContain('workerRequestAnEdit');
  });

  it('should handle multiple inline enums in the same schema', async () => {
    const spec: OpenAPIObject = {
      openapi: '3.0.0',
      info: {
        title: 'Test API',
        version: '1.0.0'
      },
      paths: {},
      components: {
        schemas: {
          ShiftResponseDto: {
            type: 'object',
            properties: {
              id: {
                type: 'string'
              },
              status: {
                type: 'string',
                enum: ['draft', 'published', 'deleted'],
                description: 'Shift status'
              },
              priority: {
                type: 'string',
                enum: ['low', 'medium', 'high', 'urgent'],
                description: 'Shift priority level'
              }
            }
          }
        }
      }
    };

    const files = await generateModels(spec, { 
      input: spec,
      output: { target: './test', mode: 'split', client: 'dio' } 
    } as any);

    // Should generate the main model
    const modelFile = files.find(f => f.path === 'models/shift_response_dto.f.dart');
    expect(modelFile).toBeDefined();
    expect(modelFile!.content).toContain('ShiftResponseDtoStatusEnum? status');
    expect(modelFile!.content).toContain('ShiftResponseDtoPriorityEnum? priority');

    // Should generate enum for status
    const statusEnumFile = files.find(f => f.path === 'models/shift_response_dto_status_enum.f.dart');
    expect(statusEnumFile).toBeDefined();
    expect(statusEnumFile!.content).toContain('enum ShiftResponseDtoStatusEnum');
    expect(statusEnumFile!.content).toContain("@JsonValue('draft')");
    expect(statusEnumFile!.content).toContain("@JsonValue('published')");
    expect(statusEnumFile!.content).toContain("@JsonValue('deleted')");

    // Should generate enum for priority
    const priorityEnumFile = files.find(f => f.path === 'models/shift_response_dto_priority_enum.f.dart');
    expect(priorityEnumFile).toBeDefined();
    expect(priorityEnumFile!.content).toContain('enum ShiftResponseDtoPriorityEnum');
    expect(priorityEnumFile!.content).toContain("@JsonValue('low')");
    expect(priorityEnumFile!.content).toContain("@JsonValue('medium')");
    expect(priorityEnumFile!.content).toContain("@JsonValue('high')");
    expect(priorityEnumFile!.content).toContain("@JsonValue('urgent')");
  });

  it('should handle nested schemas with inline enums', async () => {
    const spec: OpenAPIObject = {
      openapi: '3.0.0',
      info: {
        title: 'Test API',
        version: '1.0.0'
      },
      paths: {},
      components: {
        schemas: {
          ParentDto: {
            type: 'object',
            properties: {
              name: {
                type: 'string'
              },
              type: {
                type: 'string',
                enum: ['type1', 'type2', 'type3']
              }
            }
          },
          ChildDto: {
            allOf: [
              { $ref: '#/components/schemas/ParentDto' },
              {
                type: 'object',
                properties: {
                  childStatus: {
                    type: 'string',
                    enum: ['active', 'inactive']
                  }
                }
              }
            ]
          }
        }
      }
    };

    const files = await generateModels(spec, { 
      input: spec,
      output: { target: './test', mode: 'split', client: 'dio' } 
    } as any);

    // Parent should have its inline enum
    const parentFile = files.find(f => f.path === 'models/parent_dto.f.dart');
    expect(parentFile).toBeDefined();
    expect(parentFile!.content).toContain('ParentDtoTypeEnum? type');

    const parentEnumFile = files.find(f => f.path === 'models/parent_dto_type_enum.f.dart');
    expect(parentEnumFile).toBeDefined();
    expect(parentEnumFile!.content).toContain('enum ParentDtoTypeEnum');

    // Child should have its inline enum
    const childFile = files.find(f => f.path === 'models/child_dto.f.dart');
    expect(childFile).toBeDefined();
    
    const childEnumFile = files.find(f => f.path === 'models/child_dto_child_status_enum.f.dart');
    expect(childEnumFile).toBeDefined();
    expect(childEnumFile!.content).toContain('enum ChildDtoChildStatusEnum');
  });

  it('should not create enum for properties that reference existing enums', async () => {
    const spec: OpenAPIObject = {
      openapi: '3.0.0',
      info: {
        title: 'Test API',
        version: '1.0.0'
      },
      paths: {},
      components: {
        schemas: {
          StatusEnum: {
            type: 'string',
            enum: ['active', 'inactive', 'pending']
          },
          UserDto: {
            type: 'object',
            properties: {
              name: {
                type: 'string'
              },
              status: {
                $ref: '#/components/schemas/StatusEnum'
              },
              role: {
                type: 'string',
                enum: ['admin', 'user', 'guest'],
                description: 'User role'
              }
            }
          }
        }
      }
    };

    const files = await generateModels(spec, { 
      input: spec,
      output: { target: './test', mode: 'split', client: 'dio' } 
    } as any);

    // Should generate the referenced enum
    const statusEnumFile = files.find(f => f.path === 'models/status_enum.f.dart');
    expect(statusEnumFile).toBeDefined();

    // Should generate inline enum for role
    const roleEnumFile = files.find(f => f.path === 'models/user_dto_role_enum.f.dart');
    expect(roleEnumFile).toBeDefined();
    expect(roleEnumFile!.content).toContain('enum UserDtoRoleEnum');

    // UserDto should reference both enums
    const userFile = files.find(f => f.path === 'models/user_dto.f.dart');
    expect(userFile).toBeDefined();
    expect(userFile!.content).toContain('StatusEnum? status');
    expect(userFile!.content).toContain('UserDtoRoleEnum? role');
    expect(userFile!.content).toContain("import 'status_enum.f.dart';");
    expect(userFile!.content).toContain("import 'user_dto_role_enum.f.dart';");
  });

  it('should handle inline enums with special characters in values', async () => {
    const spec: OpenAPIObject = {
      openapi: '3.0.0',
      info: {
        title: 'Test API',
        version: '1.0.0'
      },
      paths: {},
      components: {
        schemas: {
          ConfigDto: {
            type: 'object',
            properties: {
              environment: {
                type: 'string',
                enum: ['dev-local', 'staging_01', 'production-v2', '404-error']
              }
            }
          }
        }
      }
    };

    const files = await generateModels(spec, { 
      input: spec,
      output: { target: './test', mode: 'split', client: 'dio' } 
    } as any);

    const enumFile = files.find(f => f.path === 'models/config_dto_environment_enum.f.dart');
    expect(enumFile).toBeDefined();
    expect(enumFile!.content).toContain("@JsonValue('dev-local')");
    expect(enumFile!.content).toContain('devLocal');
    expect(enumFile!.content).toContain("@JsonValue('staging_01')");
    expect(enumFile!.content).toContain('staging01');
    expect(enumFile!.content).toContain("@JsonValue('production-v2')");
    expect(enumFile!.content).toContain('productionV2');
    expect(enumFile!.content).toContain("@JsonValue('404-error')");
  });

  it('should keep the declared type when hoisting an inline numeric enum', async () => {
    const spec: OpenAPIObject = {
      openapi: '3.0.0',
      info: {
        title: 'Test API',
        version: '1.0.0'
      },
      paths: {},
      components: {
        schemas: {
          CreateWorkerUnavailabilityDto: {
            type: 'object',
            required: ['dayOfWeek'],
            properties: {
              dayOfWeek: {
                type: 'number',
                description: 'Day of the week (1-7, where 1 is Monday and 7 is Sunday)',
                enum: [1, 2, 3, 4, 5, 6, 7]
              }
            }
          }
        }
      }
    };

    const files = await generateModels(spec, {
      input: spec,
      output: { target: './test', mode: 'split', client: 'dio' }
    } as any);

    const enumFile = files.find(
      f => f.path === 'models/create_worker_unavailability_dto_day_of_week_enum.f.dart'
    );
    expect(enumFile).toBeDefined();

    // Hoisting used to overwrite the declared type with 'string', which turned
    // numeric enums into string ones
    expect(enumFile!.content).toContain('@JsonValue(1)');
    expect(enumFile!.content).toContain('@JsonValue(7)');
    expect(enumFile!.content).not.toContain("@JsonValue('1')");
    expect(enumFile!.content).toContain('num get value');
  });
});