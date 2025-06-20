import {
  renderContentToString,
  splitStringToContent,
} from 'generaltranslation';
import getI18NConfig from '../../config-dir/getI18NConfig';
import { getLocale } from '../../request/getLocale';
import { createStringTranslationError } from '../../errors/createErrors';
import { hashJsxChildren } from 'generaltranslation/id';
import { RuntimeTranslationOptions } from 'gt-react/internal';

/**
 * Translates the provided content string based on the specified locale and options.
 * If no translation is required, it renders the content as is. Otherwise, it fetches the
 * required translations or falls back to on-demand translation if enabled.
 *
 * @async
 * @function tx (translate)
 *
 * @param {string} content - The content string that needs to be translated.
 * @param {Object} [options] - Translation options.
 * @param {string} [options.id] - A unique identifier for the content, used for caching and fetching translations.
 * @param {string} [options.locale] - The target locale for translation. Defaults to the current locale if not provided.
 * @param {string} [options.context] - Additional context for the translation process, which may influence the translation's outcome.
 * @param {Object} [options.variables] - An optional map of variables to be injected into the translated content.
 * @param {Object} [options.variableOptions] - Options for formatting numbers and dates using `Intl.NumberFormat` or `Intl.DateTimeFormat`.
 *
 * @returns {Promise<string>} - A promise that resolves to the translated content string, or the original content if no translation is needed.
 *
 * @throws {Error} - Throws an error if the translation process fails or if there are issues with fetching necessary data.
 *
 * @example
 * // Basic usage with default locale detection
 * const translation = await tx("Hello, world!");
 *
 * @example
 * // Providing specific translation options
 * const translation = await tx("Hello, world!", { locale: 'es', context: 'Translate informally' });
 *
 * @example
 * // Using variables in the content string
 * const translation = await tx("The price is {price}", { locale: 'es-MX', variables: { price: 29.99 } });
 */
export default async function tx(
  string: string,
  options: RuntimeTranslationOptions = {}
): Promise<string> {
  if (!string || typeof string !== 'string') return '';

  // ----- SET UP ----- //

  const I18NConfig = getI18NConfig();
  const locale = options.locale || (await getLocale());
  const defaultLocale = I18NConfig.getDefaultLocale();
  const [translationRequired] = I18NConfig.requiresTranslation(locale);
  const source = splitStringToContent(string); // parse content

  // ----- DEFINE RENDER FUNCTION ----- //

  const renderContent = (content: any, locales: string[]) => {
    return renderContentToString(
      content,
      locales,
      options.variables,
      options.variablesOptions
    );
  };

  // ----- CHECK IF TRANSLATION REQUIRED ----- //

  if (!translationRequired) return renderContent(source, [defaultLocale]);

  // ----- CALCULATE HASH ----- //

  const hash = hashJsxChildren({
    source,
    ...(options?.context && { context: options.context }),
    ...(options?.id && { id: options.id }),
    dataFormat: 'JSX',
  });

  // ----- CHECK LOCAL CACHE ----- //

  const recentTranslations = I18NConfig.getRecentTranslations(locale);
  if (recentTranslations?.[hash]?.state === 'success') {
    return renderContent(recentTranslations[hash].target, [
      locale,
      defaultLocale,
    ]);
  }

  // ------ CREATE NEW TRANSLATION ---- //

  // New translation required
  try {
    const target = await I18NConfig.translateContent({
      source,
      targetLocale: locale,
      options: { ...options, hash },
    });
    return renderContent(target, [locale, defaultLocale]);
  } catch (error) {
    console.error(createStringTranslationError(string, options.id), error);
    return renderContent(source, [defaultLocale]);
  }
}
