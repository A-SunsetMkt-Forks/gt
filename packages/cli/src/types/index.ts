import { SUPPORTED_FILE_EXTENSIONS } from '../formats/files/supportedFiles.js';

export type { Updates } from 'generaltranslation/types';

export type Options = {
  config: string;
  apiKey?: string;
  projectId?: string;
  versionId?: string;
  jsconfig?: string;
  dictionary?: string;
  src?: string[];
  defaultLocale?: string;
  locales?: string[];
  baseUrl: string;
  inline?: boolean;
  ignoreErrors: boolean;
  suppressWarnings: boolean;
  dryRun: boolean;
  timeout: string;
  stageTranslations?: boolean;
  experimentalLocalizeStaticUrls?: boolean;
  experimentalHideDefaultLocale?: boolean;
  experimentalFlattenJsonFiles?: boolean;
  experimentalLocalizeStaticImports?: boolean;
};

export type WrapOptions = {
  src?: string[];
  config: string;
  skipTs: boolean;
  disableIds: boolean;
  disableFormatting: boolean;
  addGTProvider: boolean;
};

export type SetupOptions = {
  src?: string[];
  config: string;
};

export type GenerateSourceOptions = {
  src?: string[];
  config: string;
  defaultLocale: string;
  dictionary?: string;
  jsconfig?: string;
  inline?: boolean;
  ignoreErrors: boolean;
  suppressWarnings: boolean;
};

export type Framework = 'gt-next' | 'gt-react';

export type SupportedFrameworks =
  | 'next-app'
  | 'next-pages'
  | 'vite'
  | 'gatsby'
  | 'react'
  | 'redwood';

export type SupportedLibraries =
  | 'gt-next'
  | 'gt-react'
  | 'next-intl'
  | 'react-i18next'
  | 'next-i18next'
  | 'i18next'
  | 'i18next-icu'
  | 'base';

export interface ContentScanner {
  scanForContent(
    options: WrapOptions,
    framework: Framework
  ): Promise<{
    errors: string[];
    filesUpdated: string[];
    warnings: string[];
  }>;
}

// Create a type based on the supported file extensions
export type SupportedFileExtension = (typeof SUPPORTED_FILE_EXTENSIONS)[number];

// Update ResolvedFiles to use the dynamic keys
export type ResolvedFiles = {
  [K in SupportedFileExtension]?: string[];
} & {
  gt?: string; // Output glob: /path/[locale].json
};

// Update TransformFiles similarly
export type TransformFiles = {
  [K in SupportedFileExtension]?: string;
};

// Update FilesOptions to fix the error
export type FilesOptions = {
  [K in SupportedFileExtension]?: {
    include: string[];
    exclude?: string[];
    transform?: string;
  };
} & {
  gt?: {
    output: string; // Output glob: /path/[locale].json
  };
};

// Shared settings between all API-related commands
export type Settings = {
  config: string;
  baseUrl: string;
  dashboardUrl: string;
  apiKey: string;
  projectId: string;
  defaultLocale: string;
  locales: string[];
  files:
    | {
        resolvedPaths: ResolvedFiles; // Absolute resolved paths for the default locale
        placeholderPaths: ResolvedFiles; // Absolute placeholder paths for all locales containing [locale]
        transformPaths: TransformFiles; // Absolute transform paths for all locales containing [locale]
      }
    | undefined;
  stageTranslations: boolean; // if true, always stage the project during translate command
  _versionId?: string; // internal use only
  version?: string; // for specifying a custom version id to use. Should be unique
  description?: string;
  src: string[]; // list of glob patterns for gt-next and gt-react
  framework?: SupportedFrameworks;
  options?: AdditionalOptions;
};

export type AdditionalOptions = {
  // Optional schema to follow while translating JSON files
  jsonSchema?: {
    [fileGlob: string]: JsonSchema;
  };
  docsUrlPattern?: string; // eg /docs/[locale] or /[locale] for localizing static urls in markdown files
  docsImportPattern?: string; // eg /docs/[locale]/foo.md or /[locale]/foo.md for localizing static imports in markdown files
  docsHideDefaultLocaleImport?: boolean; // if true, hide the default locale in the import path
  copyFiles?: string[]; // array of files to copy to the target locale
};

export type JsonSchema = {
  preset?: 'mintlify';

  // exactly 1 of include or composite must be provided; not both

  // specify include if file is not composite
  // multiple target JSONs will be created for each locale,
  // with the only differing content being the specified JSONPath values
  include?: string[]; // array of JSONPaths to include

  // specify composite if no new JSONs should be created
  composite?: {
    // The sourceObjectPath is a JSONPath to the array or object containing
    // content in the source and target locales
    // This value is denoted as the "sourceObject"
    // Array elements or object sub-elements are denoted as "sourceItem"
    [sourceObjectPath: string]: SourceObjectOptions;
  };
};

export type SourceObjectOptions = {
  type: 'array' | 'object'; // type of the sourceObject;
  // array if the sourceObject is an array
  // -> We will simply add duplicated sourceItems for each locale
  // object if the sourceObject is an object
  // -> We will duplicate the sourceItem for each locale and set the corresponding
  // key with the locale property
  // In both cases, we search the sourceObject for the key that matches the source locale

  // Below, relative JSONPaths are relative to the sourceItem root, NOT the sourceObject

  include: string[]; // array of relative JSONPaths to include in the translated JSON

  // if type is array, there must be a key property in the array element
  // corresponding value should be a locale code
  key?: string; // relative jsonPath to the key to use to distinguish between source and target locales
  // if type is object, the key is simply the JSON key for the sourceItem - this is unnecessary in this case

  localeProperty?: string; // specific locale property to use for the key for target locales, default 'code'
  // ex: code, name, nativeName, languageCode, languageName, etc. (values returned by getLocaleProperties)

  // optional config for transforming specific fields in the sourceItem
  // for example, helpful for handling urls with locale-specific paths
  transform?: TransformOptions;
};

export type TransformOptions = {
  // relative jsonPath to content to mutate
  [transformPath: string]: {
    match?: string; // regex to match strings to replace
    replace: string; // string or regex pattern to replace the match with
    // Special placeholders:
    // -> if used in the match string, they will be replaced with the corresponding default locale property value
    // -> if used in the replace string, they will be replaced with the corresponding target locale property value
    // {locale} -> will be replaced with the locale code
    // And any other property from getLocaleProperties()
  };
};
