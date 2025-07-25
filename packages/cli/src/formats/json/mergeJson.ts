import JSONPointer from 'jsonpointer';
import { AdditionalOptions, SourceObjectOptions } from '../../types/index.js';
import { exit, logError, logWarning } from '../../console/logging.js';
import {
  findMatchingItemArray,
  findMatchingItemObject,
  generateSourceObjectPointers,
  getSourceObjectOptionsArray,
  validateJsonSchema,
} from './utils.js';
import { JSONPath } from 'jsonpath-plus';
import { getLocaleProperties } from 'generaltranslation';
import { LocaleProperties } from 'generaltranslation/types';

export function mergeJson(
  originalContent: string,
  filePath: string,
  options: AdditionalOptions,
  targets: {
    translatedContent: string;
    targetLocale: string;
  }[],
  defaultLocale: string
): string[] {
  const jsonSchema = validateJsonSchema(options, filePath);
  if (!jsonSchema) {
    return targets.map((target) => target.translatedContent);
  }

  let originalJson: any;
  try {
    originalJson = JSON.parse(originalContent);
  } catch (error) {
    logError(`Invalid JSON file: ${filePath}`);
    exit(1);
  }

  // Handle include
  if (jsonSchema.include) {
    const output: string[] = [];
    for (const target of targets) {
      // Must clone the original JSON to avoid mutations
      const mergedJson = structuredClone(originalJson);
      const translatedJson = JSON.parse(target.translatedContent);
      for (const [jsonPointer, translatedValue] of Object.entries(
        translatedJson
      )) {
        try {
          const value = JSONPointer.get(mergedJson, jsonPointer);
          if (!value) continue;
          JSONPointer.set(mergedJson, jsonPointer, translatedValue);
        } catch (error) {}
      }
      output.push(JSON.stringify(mergedJson, null, 2));
    }
    return output;
  }

  if (!jsonSchema.composite) {
    logError('No composite property found in JSON schema');
    exit(1);
  }

  // Handle composite
  // Create a deep copy of the original JSON to avoid mutations
  const mergedJson = structuredClone(originalJson);

  // Create mapping of sourceObjectPointer to SourceObjectOptions
  const sourceObjectPointers: Record<
    string,
    { sourceObjectValue: any; sourceObjectOptions: SourceObjectOptions }
  > = generateSourceObjectPointers(jsonSchema.composite, originalJson);

  // Find the source object
  for (const [
    sourceObjectPointer,
    { sourceObjectValue, sourceObjectOptions },
  ] of Object.entries(sourceObjectPointers)) {
    // Find the source item
    if (sourceObjectOptions.type === 'array') {
      // Validate type
      if (!Array.isArray(sourceObjectValue)) {
        logError(
          `Source object value is not an array at path: ${sourceObjectPointer}`
        );
        exit(1);
      }

      // Get source item for default locale

      const matchingDefaultLocaleItem = findMatchingItemArray(
        defaultLocale,
        sourceObjectOptions,
        sourceObjectPointer,
        sourceObjectValue
      );
      if (!matchingDefaultLocaleItem) {
        logError(
          `Matching sourceItem not found at path: ${sourceObjectPointer} for locale: ${defaultLocale}. Please check your JSON schema`
        );
        exit(1);
      }
      const {
        sourceItem: defaultLocaleSourceItem,
        keyPointer: defaultLocaleKeyPointer,
      } = matchingDefaultLocaleItem;

      // For each target:
      // 1. Validate that the targetJson has a jsonPointer for the current sourceObjectPointer
      // 2. If it does, find the source item for the target locale
      // 3. Override the source item with the translated values
      // 4. Apply additional mutations to the sourceItem
      // 5. Merge the source item with the original JSON
      for (const target of targets) {
        const targetJson = JSON.parse(target.translatedContent);
        // 1. Validate that the targetJson has a jsonPointer for the current sourceObjectPointer
        if (!targetJson[sourceObjectPointer]) {
          logWarning(
            `Translated JSON for locale: ${target.targetLocale} does not have a valid sourceObjectPointer: ${sourceObjectPointer}. Skipping this target`
          );
          continue;
        }
        // 2. Find the source item for the target locale
        const matchingTargetItem = findMatchingItemArray(
          target.targetLocale,
          sourceObjectOptions,
          sourceObjectPointer,
          sourceObjectValue
        );
        // If the target locale has a matching source item, use it to mutate the source item
        // Otherwise, fallback to the default locale source item
        const mutateSourceItem = structuredClone(defaultLocaleSourceItem);
        const mutateSourceItemIndex = matchingTargetItem
          ? matchingTargetItem.itemIndex
          : undefined;
        const mutateSourceItemKeyPointer = defaultLocaleKeyPointer;
        const { identifyingLocaleProperty: targetLocaleKeyProperty } =
          getSourceObjectOptionsArray(
            target.targetLocale,
            sourceObjectPointer,
            sourceObjectOptions
          );

        // 3. Override the source item with the translated values
        JSONPointer.set(
          mutateSourceItem,
          mutateSourceItemKeyPointer,
          targetLocaleKeyProperty
        );
        for (const [
          translatedKeyJsonPointer,
          translatedValue,
        ] of Object.entries(targetJson[sourceObjectPointer] || {})) {
          try {
            const value = JSONPointer.get(
              mutateSourceItem,
              translatedKeyJsonPointer
            );
            if (!value) continue;
            JSONPointer.set(
              mutateSourceItem,
              translatedKeyJsonPointer,
              translatedValue
            );
          } catch (error) {}
        }
        // 4. Apply additional mutations to the sourceItem
        applyTransformations(
          mutateSourceItem,
          sourceObjectOptions.transform,
          target.targetLocale,
          defaultLocale
        );

        // 5. Merge the source item with the original JSON
        if (mutateSourceItemIndex) {
          sourceObjectValue[mutateSourceItemIndex] = mutateSourceItem;
        } else {
          sourceObjectValue.push(mutateSourceItem);
        }
      }
      JSONPointer.set(mergedJson, sourceObjectPointer, sourceObjectValue);
    } else {
      // Validate type
      if (typeof sourceObjectValue !== 'object' || sourceObjectValue === null) {
        logError(
          `Source object value is not an object at path: ${sourceObjectPointer}`
        );
        exit(1);
      }
      // Validate localeProperty
      const matchingDefaultLocaleItem = findMatchingItemObject(
        defaultLocale,
        sourceObjectPointer,
        sourceObjectOptions,
        sourceObjectValue
      );
      // Validate source item exists
      if (!matchingDefaultLocaleItem.sourceItem) {
        logError(
          `Source item not found at path: ${sourceObjectPointer}. You must specify a source item where its key matches the default locale`
        );
        exit(1);
      }
      const { sourceItem: defaultLocaleSourceItem } = matchingDefaultLocaleItem;

      // For each target:
      // 1. Validate that the targetJson has a jsonPointer for the current sourceObjectPointer
      // 2. If it does, find the source item for the target locale
      // 3. Override the source item with the translated values
      // 4. Apply additional mutations to the sourceItem
      // 5. Merge the source item with the original JSON
      for (const target of targets) {
        const targetJson = JSON.parse(target.translatedContent);
        // 1. Validate that the targetJson has a jsonPointer for the current sourceObjectPointer
        if (!targetJson[sourceObjectPointer]) {
          logWarning(
            `Translated JSON for locale: ${target.targetLocale} does not have a valid sourceObjectPointer: ${sourceObjectPointer}. Skipping this target`
          );
          continue;
        }
        // 2. Find the source item for the target locale
        const matchingTargetItem = findMatchingItemObject(
          target.targetLocale,
          sourceObjectPointer,
          sourceObjectOptions,
          sourceObjectValue
        );
        // If the target locale has a matching source item, use it to mutate the source item
        // Otherwise, fallback to the default locale source item
        const mutateSourceItem = structuredClone(defaultLocaleSourceItem);
        const mutateSourceItemKey = matchingTargetItem.keyParentProperty;

        // 3. Override the source item with the translated values
        for (const [
          translatedKeyJsonPointer,
          translatedValue,
        ] of Object.entries(targetJson[sourceObjectPointer] || {})) {
          try {
            const value = JSONPointer.get(
              mutateSourceItem,
              translatedKeyJsonPointer
            );
            if (!value) continue;
            JSONPointer.set(
              mutateSourceItem,
              translatedKeyJsonPointer,
              translatedValue
            );
          } catch (error) {}
        }
        // 4. Apply additional mutations to the sourceItem
        applyTransformations(
          mutateSourceItem,
          sourceObjectOptions.transform,
          target.targetLocale,
          defaultLocale
        );

        // 5. Merge the source item with the original JSON
        sourceObjectValue[mutateSourceItemKey] = mutateSourceItem;
      }
      JSONPointer.set(mergedJson, sourceObjectPointer, sourceObjectValue);
    }
  }
  return [JSON.stringify(mergedJson, null, 2)];
}

// helper function to replace locale placeholders in a string
// with the corresponding locale properties
// ex: {locale} -> will be replaced with the locale code
// ex: {localeName} -> will be replaced with the locale name
function replaceLocalePlaceholders(
  string: string,
  localeProperties: LocaleProperties
): string {
  return string.replace(/\{(\w+)\}/g, (match, property) => {
    // Handle common aliases
    if (property === 'locale' || property === 'localeCode') {
      return localeProperties.code;
    }
    if (property === 'localeName') {
      return localeProperties.name;
    }
    if (property === 'localeNativeName') {
      return localeProperties.nativeName;
    }
    // Check if the property exists in localeProperties
    if (property in localeProperties) {
      return localeProperties[property as keyof typeof localeProperties];
    }
    // Return the original placeholder if property not found
    return match;
  });
}

// apply transformations to the sourceItem in-place
export function applyTransformations(
  sourceItem: any,
  transform: SourceObjectOptions['transform'],
  targetLocale: string,
  defaultLocale: string
): void {
  if (!transform) return;

  const targetLocaleProperties = getLocaleProperties(targetLocale);
  const defaultLocaleProperties = getLocaleProperties(defaultLocale);

  for (const [transformPath, transformOptions] of Object.entries(transform)) {
    if (
      !transformOptions.replace ||
      typeof transformOptions.replace !== 'string'
    ) {
      continue;
    }
    const results = JSONPath({
      json: sourceItem,
      path: transformPath,
      resultType: 'all',
      flatten: true,
      wrap: true,
    });
    if (!results || results.length === 0) {
      continue;
    }
    results.forEach((result: { pointer: string; value: any }) => {
      if (typeof result.value !== 'string') {
        return;
      }
      // Replace locale placeholders in the replace string
      let replaceString = transformOptions.replace;

      // Replace all locale property placeholders
      replaceString = replaceLocalePlaceholders(
        replaceString,
        targetLocaleProperties
      );

      if (
        transformOptions.match &&
        typeof transformOptions.match === 'string'
      ) {
        // Replace locale placeholders in the match string using defaultLocale properties
        let matchString = transformOptions.match;
        matchString = replaceLocalePlaceholders(
          matchString,
          defaultLocaleProperties
        );

        result.value = result.value.replace(
          new RegExp(matchString, 'g'),
          replaceString
        );
      } else {
        result.value = replaceString;
      }

      // Update the actual sourceItem using JSONPointer
      JSONPointer.set(sourceItem, result.pointer, result.value);
    });
  }
}
