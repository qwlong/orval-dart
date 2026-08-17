## [0.10.4](https://github.com/qwlong/dorval/compare/v0.10.3...v0.10.4) (2026-08-17)


### Bug Fixes

* **core:** declare fromValue on the enum, not only the extension ([0c64325](https://github.com/qwlong/dorval/commit/0c64325e838a15ebfea8758b4df9159231cdd377))
* **core:** emit enum values as Dart string literals ([c6ff624](https://github.com/qwlong/dorval/commit/c6ff624786df4e0a9c9fed73266fe0ce5d0f85ed)), closes [#x3](https://github.com/qwlong/dorval/issues/x3)
* **core:** generate legal, unique enum member names ([095aff4](https://github.com/qwlong/dorval/commit/095aff4668b5016adc1b9c651be70096b3c9881d)), closes [#5](https://github.com/qwlong/dorval/issues/5)
* **core:** give an enum response the type its values have ([604f46e](https://github.com/qwlong/dorval/commit/604f46e1790000418218b30ee0400d25b504146b))
* **core:** give the unknown sentinel a member of its own ([15c3d29](https://github.com/qwlong/dorval/commit/15c3d295a2cb60c11c3e27e0657a4c6821897514))
* **core:** keep a parameter's enum type resolvable ([4a50018](https://github.com/qwlong/dorval/commit/4a50018ce8d64823b7f8d55ce416d602215694fe))
* **core:** only generate enums json_serializable can express ([b852433](https://github.com/qwlong/dorval/commit/b852433e2cadc4e1458b62c58d1271ac526336c2))
* **core:** spell a parameter's enum type the same way on both sides ([12939ce](https://github.com/qwlong/dorval/commit/12939cebc3830339bef92b30e0896a85e4f82a72))

## [0.10.3](https://github.com/qwlong/dorval/compare/v0.10.2...v0.10.3) (2026-08-12)


### Bug Fixes

* **core:** align parameter enums and drop null members from numeric enums ([85a1448](https://github.com/qwlong/dorval/commit/85a14484ea87de5920b8a893531a82523f075c1b))
* **core:** gate numeric enums on the declared type ([4363306](https://github.com/qwlong/dorval/commit/436330657271d004244a743c1dfb2ef1c954f65c))
* **core:** serialize numeric enums as numbers ([5d226d4](https://github.com/qwlong/dorval/commit/5d226d4b73b942bc5aa9a17166577c47460ed9b3))

## [0.10.2](https://github.com/qwlong/dorval/compare/v0.10.1...v0.10.2) (2026-01-21)


### Bug Fixes

* move enum description comment before @JsonValue annotation ([7de2b57](https://github.com/qwlong/dorval/commit/7de2b576470bd50a990a088158e1f826fbef0e85))

## [0.10.1](https://github.com/qwlong/dorval/compare/v0.10.0...v0.10.1) (2026-01-21)


### Bug Fixes

* skip redundant case 'unknown' in enum fromValue switch ([8920c42](https://github.com/qwlong/dorval/commit/8920c42f9181198e2dd58c76b1be6c364e0f8989))

# [0.10.0](https://github.com/qwlong/dorval/compare/v0.9.2...v0.10.0) (2026-01-21)


### Features

* add unknown fallback value to enums for forward compatibility ([bf8813c](https://github.com/qwlong/dorval/commit/bf8813ccbeab218cdb009c4b41712990115fcf76))

## [0.9.2](https://github.com/qwlong/dorval/compare/v0.9.1...v0.9.2) (2026-01-19)


### Bug Fixes

* update README with 396 tests and improved header consolidation docs ([9218100](https://github.com/qwlong/dorval/commit/92181009918b721e658b25013be30d715e1e3885))

## [0.9.1](https://github.com/qwlong/dorval/compare/v0.9.0...v0.9.1) (2026-01-19)


### Bug Fixes

* generate correct Freezed discriminated unions with unionKey annotation ([304dc80](https://github.com/qwlong/dorval/commit/304dc8094a0c1964579c5e8839cbf02d26253ac6))

# [0.9.0](https://github.com/qwlong/dorval/compare/v0.8.0...v0.9.0) (2025-11-20)


### Features

* support enum types in array parameter items ([2584a78](https://github.com/qwlong/dorval/commit/2584a78f4e642de9a6f7f9983a2445336140c88d))

# [0.8.0](https://github.com/qwlong/dorval/compare/v0.7.0...v0.8.0) (2025-11-18)


### Bug Fixes

* add missing enum imports in headers model template ([62accf4](https://github.com/qwlong/dorval/commit/62accf4d16a003402a1a143dd56474a8ef468224))


### Features

* extract and generate enums from inline parameter schemas ([c7bf024](https://github.com/qwlong/dorval/commit/c7bf024c14f76d325b32c2d3b5f0f9dc67c8e4e3))

# [0.7.0](https://github.com/qwlong/dorval/compare/v0.6.0...v0.7.0) (2025-11-12)


### Features

* add empty object handling and fix type casting in service methods ([b93db7b](https://github.com/qwlong/dorval/commit/b93db7b1212c809edc40dcc0d6172c597eda4e87))

# [0.6.0](https://github.com/qwlong/dorval/compare/v0.5.0...v0.6.0) (2025-11-06)


### Features

* improve nullable response handling and clean up debug logs ([14ae8da](https://github.com/qwlong/dorval/commit/14ae8dabfb7d9dae7f5a3a61d1c665d54d40df32))

# [0.5.0](https://github.com/qwlong/dorval/compare/v0.4.1...v0.5.0) (2025-11-03)


### Features

* Add support for MongoDB operators and special JSON keys ([af784eb](https://github.com/qwlong/dorval/commit/af784ebe998fb4e030e46bd297cc505d4b154322))

## [0.4.1](https://github.com/qwlong/dorval/compare/v0.4.0...v0.4.1) (2025-09-29)


### Bug Fixes

* handle nullable List types in import generation ([45bfa68](https://github.com/qwlong/dorval/commit/45bfa6852ec8633370f45c7cb1bf057fecaac6ad))

# [0.4.0](https://github.com/qwlong/dorval/compare/v0.3.2...v0.4.0) (2025-09-26)


### Bug Fixes

* update dorval package to use correct @dorval/core version ([f8d6c2e](https://github.com/qwlong/dorval/commit/f8d6c2ecf729584cd725bbd780440d2d8eb2a6db))


### Features

* auto-sync @dorval/core dependency version in release process ([9509402](https://github.com/qwlong/dorval/commit/9509402edca624636b79396bcf251ca9acb16b6c))

## [0.3.1](https://github.com/qwlong/dorval/compare/v0.3.0...v0.3.1) (2025-09-26)


### Bug Fixes

* align manual-publish workflow with working release workflow ([f3314b8](https://github.com/qwlong/dorval/commit/f3314b8d6c148eece527565209ed57386a7ae1d2))

# [0.3.0](https://github.com/qwlong/dorval/compare/v0.2.5...v0.3.0) (2025-09-25)


### Features

* migrate freezed model v2 to v3 ([296bc02](https://github.com/qwlong/dorval/commit/296bc023ff10d46e2d7289928c71609e00f2b0a2))

## [0.2.5](https://github.com/qwlong/dorval/compare/v0.2.4...v0.2.5) (2025-09-16)


### Bug Fixes

* prevent duplicate imports in generated models ([a2d5ffa](https://github.com/qwlong/dorval/commit/a2d5ffa353b435888bbe1380f866da72d2ccdec8))

## [0.2.4](https://github.com/qwlong/dorval/compare/v0.2.3...v0.2.4) (2025-09-14)


### Bug Fixes

* fix release flow ([cc7ce30](https://github.com/qwlong/dorval/commit/cc7ce30baec9f492447a015f3356eb825af68952))
* prevent duplicate version updates in semantic-release ([3796263](https://github.com/qwlong/dorval/commit/3796263884f5731e61b20616ffd5188b20d35319))
* properly export params/headers in models index file ([d640caf](https://github.com/qwlong/dorval/commit/d640caf9d7a8b85ff68e53366fcb7138c150b3ff))
* resolve CI test issues with Node.js 22 ([9525638](https://github.com/qwlong/dorval/commit/9525638945962cb1fc7f1abb170395414f849f75))
* semantic-release configuration for yarn 1.x compatibility ([c828caf](https://github.com/qwlong/dorval/commit/c828caf07ef4ef00d1a781a16af3511743350b8d))
* update Node.js requirement to 20.8.1+ for semantic-release compatibility ([b69ca99](https://github.com/qwlong/dorval/commit/b69ca990b2bb67dbc5ecd78f14f6ee9bde42cdc9))
* update tests to match new params/headers export behavior ([43aefbc](https://github.com/qwlong/dorval/commit/43aefbc916df072363ed1e396c243e6a5630fa1e))
