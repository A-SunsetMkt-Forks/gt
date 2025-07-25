import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import localizeStaticImports from '../localizeStaticImports';

// Mock fs module
vi.mock('fs', () => ({
  promises: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
  },
}));

// Mock other dependencies
vi.mock('../../formats/files/translate.js', () => ({
  createFileMapping: vi.fn(),
}));

vi.mock('../../console/logging.js', () => ({
  logError: vi.fn(),
  logErrorAndExit: vi.fn(),
}));

import { createFileMapping } from '../../formats/files/translate.js';

describe('localizeStaticImports', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('main function', () => {
    it('should return early if no files are provided', async () => {
      const settings = {
        files: null,
        defaultLocale: 'en',
        locales: ['en', 'ja'],
      };

      await localizeStaticImports(settings as any);

      expect(createFileMapping).not.toHaveBeenCalled();
    });

    it('should return early if only gt placeholder path exists', async () => {
      const settings = {
        files: {
          placeholderPaths: { gt: 'some-path' },
          resolvedPaths: [],
        },
        defaultLocale: 'en',
        locales: ['en', 'ja'],
      };

      await localizeStaticImports(settings as any);

      expect(createFileMapping).not.toHaveBeenCalled();
    });

    it('should process md/mdx files for localization', async () => {
      const mockFileMapping = {
        ja: {
          'file1.md': '/path/to/ja/file1.md',
          'file2.mdx': '/path/to/ja/file2.mdx',
          'file3.txt': '/path/to/ja/file3.txt', // Should be filtered out
        },
      };

      const mockFileContent = `import Component from '/components/en/special-component.mdx'`;

      vi.mocked(createFileMapping).mockReturnValue(mockFileMapping);
      vi.mocked(fs.promises.readFile).mockResolvedValue(mockFileContent);
      vi.mocked(fs.promises.writeFile).mockResolvedValue(undefined);

      const settings = {
        files: {
          placeholderPaths: { docs: '/docs' },
          resolvedPaths: ['file1', 'file2'],
          transformPaths: {},
        },
        defaultLocale: 'en',
        locales: ['en', 'ja'],
        options: {
          docsHideDefaultLocaleImport: false,
          docsImportPattern: '/components/[locale]',
        },
      };

      await localizeStaticImports(settings as any);

      expect(createFileMapping).toHaveBeenCalledWith(
        ['file1', 'file2'],
        { docs: '/docs' },
        {},
        ['en', 'ja']
      );
      expect(fs.promises.readFile).toHaveBeenCalledTimes(2); // Only md/mdx files
      expect(fs.promises.writeFile).toHaveBeenCalledTimes(2);
    });
  });

  describe('localization behavior', () => {
    describe('with hideDefaultLocale = false', () => {
      it('should replace default locale with target locale in import statements', async () => {
        const fileContent = `import Component from '/components/en/special-component.mdx'`;
        const expected = `import Component from '/components/ja/special-component.mdx'`;

        vi.mocked(fs.promises.readFile).mockResolvedValue(fileContent);
        vi.mocked(fs.promises.writeFile).mockImplementation((path, content) => {
          expect(content).toBe(expected);
          return Promise.resolve();
        });

        const mockFileMapping = {
          ja: { 'test.mdx': '/path/test.mdx' },
        };
        vi.mocked(createFileMapping).mockReturnValue(mockFileMapping);

        const settings = {
          files: {
            placeholderPaths: { docs: '/docs' },
            resolvedPaths: ['test'],
            transformPaths: {},
          },
          defaultLocale: 'en',
          locales: ['en', 'ja'],
          options: {
            docsHideDefaultLocaleImport: false,
            docsImportPattern: '/components/[locale]',
          },
        };

        await localizeStaticImports(settings as any);
      });

      it('should handle double quotes in import statements', async () => {
        const fileContent = `import Component from "/components/en/special-component.mdx"`;
        const expected = `import Component from "/components/ja/special-component.mdx"`;

        vi.mocked(fs.promises.readFile).mockResolvedValue(fileContent);
        vi.mocked(fs.promises.writeFile).mockImplementation((path, content) => {
          expect(content).toBe(expected);
          return Promise.resolve();
        });

        const mockFileMapping = {
          ja: { 'test.mdx': '/path/test.mdx' },
        };
        vi.mocked(createFileMapping).mockReturnValue(mockFileMapping);

        const settings = {
          files: {
            placeholderPaths: { docs: '/docs' },
            resolvedPaths: ['test'],
            transformPaths: {},
          },
          defaultLocale: 'en',
          locales: ['en', 'ja'],
          options: {
            docsHideDefaultLocaleImport: false,
            docsImportPattern: '/components/[locale]',
          },
        };

        await localizeStaticImports(settings as any);
      });

      it('should handle multiple import statements', async () => {
        const fileContent = `
import Component1 from '/components/en/component1.mdx'
import Component2 from '/components/en/component2.mdx'
const text = 'Some other content'
import Component3 from '/components/en/component3.mdx'
`;
        const expected = `
import Component1 from '/components/ja/component1.mdx'
import Component2 from '/components/ja/component2.mdx'
const text = 'Some other content'
import Component3 from '/components/ja/component3.mdx'
`;

        vi.mocked(fs.promises.readFile).mockResolvedValue(fileContent);
        vi.mocked(fs.promises.writeFile).mockImplementation((path, content) => {
          expect(content).toBe(expected);
          return Promise.resolve();
        });

        const mockFileMapping = {
          ja: { 'test.mdx': '/path/test.mdx' },
        };
        vi.mocked(createFileMapping).mockReturnValue(mockFileMapping);

        const settings = {
          files: {
            placeholderPaths: { docs: '/docs' },
            resolvedPaths: ['test'],
            transformPaths: {},
          },
          defaultLocale: 'en',
          locales: ['en', 'ja'],
          options: {
            docsHideDefaultLocaleImport: false,
            docsImportPattern: '/components/[locale]',
          },
        };

        await localizeStaticImports(settings as any);
      });

      it('should handle pattern without leading slash', async () => {
        const fileContent = `import Component from '/components/en/special-component.mdx'`;
        const expected = `import Component from '/components/ja/special-component.mdx'`;

        vi.mocked(fs.promises.readFile).mockResolvedValue(fileContent);
        vi.mocked(fs.promises.writeFile).mockImplementation((path, content) => {
          expect(content).toBe(expected);
          return Promise.resolve();
        });

        const mockFileMapping = {
          ja: { 'test.mdx': '/path/test.mdx' },
        };
        vi.mocked(createFileMapping).mockReturnValue(mockFileMapping);

        const settings = {
          files: {
            placeholderPaths: { docs: '/docs' },
            resolvedPaths: ['test'],
            transformPaths: {},
          },
          defaultLocale: 'en',
          locales: ['en', 'ja'],
          options: {
            docsHideDefaultLocaleImport: false,
            docsImportPattern: 'components/[locale]', // No leading slash
          },
        };

        await localizeStaticImports(settings as any);
      });

      it('should handle nested paths correctly', async () => {
        const fileContent = `import Component from '/docs/en/advanced/guide.mdx'`;
        const expected = `import Component from '/docs/ja/advanced/guide.mdx'`;

        vi.mocked(fs.promises.readFile).mockResolvedValue(fileContent);
        vi.mocked(fs.promises.writeFile).mockImplementation((path, content) => {
          expect(content).toBe(expected);
          return Promise.resolve();
        });

        const mockFileMapping = {
          ja: { 'test.mdx': '/path/test.mdx' },
        };
        vi.mocked(createFileMapping).mockReturnValue(mockFileMapping);

        const settings = {
          files: {
            placeholderPaths: { docs: '/docs' },
            resolvedPaths: ['test'],
            transformPaths: {},
          },
          defaultLocale: 'en',
          locales: ['en', 'ja'],
          options: {
            docsHideDefaultLocaleImport: false,
            docsImportPattern: '/docs/[locale]',
          },
        };

        await localizeStaticImports(settings as any);
      });
    });

    describe('with hideDefaultLocale = true', () => {
      it('should add target locale to import path when hideDefaultLocale is true', async () => {
        const fileContent = `import Component from '/components/special-component.mdx'`;
        const expected = `import Component from '/components/ja/special-component.mdx'`;

        vi.mocked(fs.promises.readFile).mockResolvedValue(fileContent);
        vi.mocked(fs.promises.writeFile).mockImplementation((path, content) => {
          expect(content).toBe(expected);
          return Promise.resolve();
        });

        const mockFileMapping = {
          ja: { 'test.mdx': '/path/test.mdx' },
        };
        vi.mocked(createFileMapping).mockReturnValue(mockFileMapping);

        const settings = {
          files: {
            placeholderPaths: { docs: '/docs' },
            resolvedPaths: ['test'],
            transformPaths: {},
          },
          defaultLocale: 'en',
          locales: ['en', 'ja'],
          options: {
            docsHideDefaultLocaleImport: true,
            docsImportPattern: '/components/[locale]',
          },
        };

        await localizeStaticImports(settings as any);
      });

      it('should handle empty path after pattern', async () => {
        const fileContent = `import Component from '/components'`;
        const expected = `import Component from '/components/ja'`;

        vi.mocked(fs.promises.readFile).mockResolvedValue(fileContent);
        vi.mocked(fs.promises.writeFile).mockImplementation((path, content) => {
          expect(content).toBe(expected);
          return Promise.resolve();
        });

        const mockFileMapping = {
          ja: { 'test.mdx': '/path/test.mdx' },
        };
        vi.mocked(createFileMapping).mockReturnValue(mockFileMapping);

        const settings = {
          files: {
            placeholderPaths: { docs: '/docs' },
            resolvedPaths: ['test'],
            transformPaths: {},
          },
          defaultLocale: 'en',
          locales: ['en', 'ja'],
          options: {
            docsHideDefaultLocaleImport: true,
            docsImportPattern: '/components/[locale]',
          },
        };

        await localizeStaticImports(settings as any);
      });
    });

    describe('edge cases', () => {
      it('should return unchanged content when no matching imports found', async () => {
        const fileContent = `
const something = 'value';
import SomeOtherThing from '@/other/path';
export default function Component() {}
`;
        const expected = fileContent; // Should remain unchanged

        vi.mocked(fs.promises.readFile).mockResolvedValue(fileContent);
        vi.mocked(fs.promises.writeFile).mockImplementation((path, content) => {
          expect(content).toBe(expected);
          return Promise.resolve();
        });

        const mockFileMapping = {
          ja: { 'test.mdx': '/path/test.mdx' },
        };
        vi.mocked(createFileMapping).mockReturnValue(mockFileMapping);

        const settings = {
          files: {
            placeholderPaths: { docs: '/docs' },
            resolvedPaths: ['test'],
            transformPaths: {},
          },
          defaultLocale: 'en',
          locales: ['en', 'ja'],
          options: {
            docsHideDefaultLocaleImport: false,
            docsImportPattern: '/components/[locale]',
          },
        };

        await localizeStaticImports(settings as any);
      });

      it('should handle mixed quote types', async () => {
        const fileContent = `
import Component1 from '/components/en/component1.mdx'
import Component2 from "/components/en/component2.mdx"
`;
        const expected = `
import Component1 from '/components/ja/component1.mdx'
import Component2 from "/components/ja/component2.mdx"
`;

        vi.mocked(fs.promises.readFile).mockResolvedValue(fileContent);
        vi.mocked(fs.promises.writeFile).mockImplementation((path, content) => {
          expect(content).toBe(expected);
          return Promise.resolve();
        });

        const mockFileMapping = {
          ja: { 'test.mdx': '/path/test.mdx' },
        };
        vi.mocked(createFileMapping).mockReturnValue(mockFileMapping);

        const settings = {
          files: {
            placeholderPaths: { docs: '/docs' },
            resolvedPaths: ['test'],
            transformPaths: {},
          },
          defaultLocale: 'en',
          locales: ['en', 'ja'],
          options: {
            docsHideDefaultLocaleImport: false,
            docsImportPattern: '/components/[locale]',
          },
        };

        await localizeStaticImports(settings as any);
      });

      it('should handle complex import patterns', async () => {
        const fileContent = `
import { Button, Card } from '/ui/en/components.mdx'
import { Table as DataTable } from '/ui/en/table.mdx'
`;
        const expected = `
import { Button, Card } from '/ui/ja/components.mdx'
import { Table as DataTable } from '/ui/ja/table.mdx'
`;

        vi.mocked(fs.promises.readFile).mockResolvedValue(fileContent);
        vi.mocked(fs.promises.writeFile).mockImplementation((path, content) => {
          expect(content).toBe(expected);
          return Promise.resolve();
        });

        const mockFileMapping = {
          ja: { 'test.mdx': '/path/test.mdx' },
        };
        vi.mocked(createFileMapping).mockReturnValue(mockFileMapping);

        const settings = {
          files: {
            placeholderPaths: { docs: '/docs' },
            resolvedPaths: ['test'],
            transformPaths: {},
          },
          defaultLocale: 'en',
          locales: ['en', 'ja'],
          options: {
            docsHideDefaultLocaleImport: false,
            docsImportPattern: '/ui/[locale]',
          },
        };

        await localizeStaticImports(settings as any);
      });

      it('should handle imports with no path after locale', async () => {
        const fileContent = `import Component from '/components/en'`;
        const expected = `import Component from '/components/ja'`;

        vi.mocked(fs.promises.readFile).mockResolvedValue(fileContent);
        vi.mocked(fs.promises.writeFile).mockImplementation((path, content) => {
          expect(content).toBe(expected);
          return Promise.resolve();
        });

        const mockFileMapping = {
          ja: { 'test.mdx': '/path/test.mdx' },
        };
        vi.mocked(createFileMapping).mockReturnValue(mockFileMapping);

        const settings = {
          files: {
            placeholderPaths: { docs: '/docs' },
            resolvedPaths: ['test'],
            transformPaths: {},
          },
          defaultLocale: 'en',
          locales: ['en', 'ja'],
          options: {
            docsHideDefaultLocaleImport: false,
            docsImportPattern: '/components/[locale]',
          },
        };

        await localizeStaticImports(settings as any);
      });
    });

    describe('different target locales', () => {
      it('should work with different target locales', async () => {
        const fileContent = `import Component from '/components/en/special-component.mdx'`;

        const testLocales = [
          {
            locale: 'fr',
            expected: `import Component from '/components/fr/special-component.mdx'`,
          },
          {
            locale: 'de',
            expected: `import Component from '/components/de/special-component.mdx'`,
          },
          {
            locale: 'es',
            expected: `import Component from '/components/es/special-component.mdx'`,
          },
        ];

        for (const { locale, expected } of testLocales) {
          vi.mocked(fs.promises.readFile).mockResolvedValue(fileContent);
          vi.mocked(fs.promises.writeFile).mockImplementation(
            (path, content) => {
              expect(content).toBe(expected);
              return Promise.resolve();
            }
          );

          const mockFileMapping = {
            [locale]: { 'test.mdx': '/path/test.mdx' },
          };
          vi.mocked(createFileMapping).mockReturnValue(mockFileMapping);

          const settings = {
            files: {
              placeholderPaths: { docs: '/docs' },
              resolvedPaths: ['test'],
              transformPaths: {},
            },
            defaultLocale: 'en',
            locales: ['en', locale],
            options: {
              docsHideDefaultLocaleImport: false,
              docsImportPattern: '/components/[locale]',
            },
          };

          await localizeStaticImports(settings as any);
        }
      });
    });

    describe('different default locales', () => {
      it('should work with different default locales', async () => {
        const fileContent = `import Component from '/components/fr/special-component.mdx'`;
        const expected = `import Component from '/components/ja/special-component.mdx'`;

        vi.mocked(fs.promises.readFile).mockResolvedValue(fileContent);
        vi.mocked(fs.promises.writeFile).mockImplementation((path, content) => {
          expect(content).toBe(expected);
          return Promise.resolve();
        });

        const mockFileMapping = {
          ja: { 'test.mdx': '/path/test.mdx' },
        };
        vi.mocked(createFileMapping).mockReturnValue(mockFileMapping);

        const settings = {
          files: {
            placeholderPaths: { docs: '/docs' },
            resolvedPaths: ['test'],
            transformPaths: {},
          },
          defaultLocale: 'fr', // Different default locale
          locales: ['fr', 'ja'],
          options: {
            docsHideDefaultLocaleImport: false,
            docsImportPattern: '/components/[locale]',
          },
        };

        await localizeStaticImports(settings as any);
      });
    });

    describe('no docsImportPattern (defaults to /[locale])', () => {
      it('should use default pattern /[locale] when docsImportPattern is not provided with hideDefaultLocale false', async () => {
        const fileContent = `import Component from '/en/special-component.mdx'`;
        const expected = `import Component from '/ja/special-component.mdx'`;

        vi.mocked(fs.promises.readFile).mockResolvedValue(fileContent);
        vi.mocked(fs.promises.writeFile).mockImplementation((path, content) => {
          expect(content).toBe(expected);
          return Promise.resolve();
        });

        const mockFileMapping = {
          ja: { 'test.mdx': '/path/test.mdx' },
        };
        vi.mocked(createFileMapping).mockReturnValue(mockFileMapping);

        const settings = {
          files: {
            placeholderPaths: { docs: '/docs' },
            resolvedPaths: ['test'],
            transformPaths: {},
          },
          defaultLocale: 'en',
          locales: ['en', 'ja'],
          options: {
            docsHideDefaultLocaleImport: false,
            // docsImportPattern not provided - should default to '/[locale]'
          },
        };

        await localizeStaticImports(settings as any);
      });

      it('should use default pattern /[locale] when docsImportPattern is not provided with hideDefaultLocale true', async () => {
        const fileContent = `import Component from '/special-component.mdx'`;
        const expected = `import Component from '/ja/special-component.mdx'`;

        vi.mocked(fs.promises.readFile).mockResolvedValue(fileContent);
        vi.mocked(fs.promises.writeFile).mockImplementation((path, content) => {
          expect(content).toBe(expected);
          return Promise.resolve();
        });

        const mockFileMapping = {
          ja: { 'test.mdx': '/path/test.mdx' },
        };
        vi.mocked(createFileMapping).mockReturnValue(mockFileMapping);

        const settings = {
          files: {
            placeholderPaths: { docs: '/docs' },
            resolvedPaths: ['test'],
            transformPaths: {},
          },
          defaultLocale: 'en',
          locales: ['en', 'ja'],
          options: {
            docsHideDefaultLocaleImport: true,
            // docsImportPattern not provided - should default to '/[locale]'
          },
        };

        await localizeStaticImports(settings as any);
      });

      it('should handle nested paths with default pattern /[locale]', async () => {
        const fileContent = `import Component from '/en/components/special-component.mdx'`;
        const expected = `import Component from '/ja/components/special-component.mdx'`;

        vi.mocked(fs.promises.readFile).mockResolvedValue(fileContent);
        vi.mocked(fs.promises.writeFile).mockImplementation((path, content) => {
          expect(content).toBe(expected);
          return Promise.resolve();
        });

        const mockFileMapping = {
          ja: { 'test.mdx': '/path/test.mdx' },
        };
        vi.mocked(createFileMapping).mockReturnValue(mockFileMapping);

        const settings = {
          files: {
            placeholderPaths: { docs: '/docs' },
            resolvedPaths: ['test'],
            transformPaths: {},
          },
          defaultLocale: 'en',
          locales: ['en', 'ja'],
          options: {
            docsHideDefaultLocaleImport: false,
            // docsImportPattern not provided - should default to '/[locale]'
          },
        };

        await localizeStaticImports(settings as any);
      });

      it('should handle empty options object (no docsImportPattern or docsHideDefaultLocaleImport)', async () => {
        const fileContent = `import Component from '/en/special-component.mdx'`;
        const expected = `import Component from '/ja/special-component.mdx'`;

        vi.mocked(fs.promises.readFile).mockResolvedValue(fileContent);
        vi.mocked(fs.promises.writeFile).mockImplementation((path, content) => {
          expect(content).toBe(expected);
          return Promise.resolve();
        });

        const mockFileMapping = {
          ja: { 'test.mdx': '/path/test.mdx' },
        };
        vi.mocked(createFileMapping).mockReturnValue(mockFileMapping);

        const settings = {
          files: {
            placeholderPaths: { docs: '/docs' },
            resolvedPaths: ['test'],
            transformPaths: {},
          },
          defaultLocale: 'en',
          locales: ['en', 'ja'],
          // No options object at all
        };

        await localizeStaticImports(settings as any);
      });

      it('should handle undefined docsImportPattern specifically', async () => {
        const fileContent = `import Component from '/en/special-component.mdx'`;
        const expected = `import Component from '/ja/special-component.mdx'`;

        vi.mocked(fs.promises.readFile).mockResolvedValue(fileContent);
        vi.mocked(fs.promises.writeFile).mockImplementation((path, content) => {
          expect(content).toBe(expected);
          return Promise.resolve();
        });

        const mockFileMapping = {
          ja: { 'test.mdx': '/path/test.mdx' },
        };
        vi.mocked(createFileMapping).mockReturnValue(mockFileMapping);

        const settings = {
          files: {
            placeholderPaths: { docs: '/docs' },
            resolvedPaths: ['test'],
            transformPaths: {},
          },
          defaultLocale: 'en',
          locales: ['en', 'ja'],
          options: {
            docsHideDefaultLocaleImport: false,
            docsImportPattern: undefined, // Explicitly undefined
          },
        };

        await localizeStaticImports(settings as any);
      });
    });
  });
});
