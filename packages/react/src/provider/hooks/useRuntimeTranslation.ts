import * as React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  dynamicTranslationError,
  createGenericRuntimeTranslationError,
  runtimeTranslationTimeoutWarning,
} from '../../errors/createErrors';
import {
  RenderMethod,
  TranslationError,
  TranslationsObject,
  TranslationSuccess,
} from '../../types/types';

import {
  TranslateContentCallback,
  TranslateChildrenCallback,
} from '../../types/runtime';
import { Content, JsxChildren } from 'generaltranslation/internal';
import {
  maxConcurrentRequests,
  maxBatchSize,
  batchInterval,
} from '../config/defaultProps';

// Queue to store requested keys between renders.
type TranslationRequestMetadata = {
  hash: string;
  context?: string;
  [attr: string]: any;
};
type TranslationRequestQueueItem = (
  | {
      type: 'content';
      source: Content;
    }
  | {
      type: 'jsx';
      source: JsxChildren;
    }
) & {
  metadata: TranslationRequestMetadata;
  resolve: any;
  reject: any;
};

export default function useRuntimeTranslation({
  projectId,
  devApiKey,
  locale,
  versionId,
  defaultLocale,
  runtimeUrl,
  renderSettings,
  setTranslations,
  ...globalMetadata
}: {
  projectId?: string;
  devApiKey?: string;
  locale: string;
  versionId?: string;
  defaultLocale?: string;
  runtimeUrl?: string | null;
  renderSettings: {
    method: RenderMethod;
    timeout?: number;
  };
  setTranslations: React.Dispatch<React.SetStateAction<any>>;
  [key: string]: any;
}): {
  registerContentForTranslation: TranslateContentCallback;
  registerJsxForTranslation: TranslateChildrenCallback;
  runtimeTranslationEnabled: boolean;
} {
  // ------ EARLY RETURN IF DISABLED ----- //

  // Translation at runtime during development is enabled
  // TODO: deprecate and reassign to plugin
  const runtimeTranslationEnabled = !!(
    projectId &&
    runtimeUrl &&
    devApiKey &&
    process.env.NODE_ENV === 'development'
  );

  if (!runtimeTranslationEnabled)
    return {
      runtimeTranslationEnabled,
      registerContentForTranslation: () =>
        Promise.reject(
          new Error(
            'registerContentForTranslation() failed because translation is disabled'
          )
        ),
      registerJsxForTranslation: () =>
        Promise.reject(
          new Error(
            'registerJsxForTranslation() failed because translation is disabled'
          )
        ),
    };

  // ----- SETUP ----- //

  globalMetadata = {
    ...globalMetadata,
    projectId,
    sourceLocale: defaultLocale,
  };

  const [activeRequests, setActiveRequests] = useState(0);

  // Requests waiting to be sent
  const requestQueueRef = useRef<Map<string, TranslationRequestQueueItem>>(
    new Map()
  );
  // Requests that have yet to be resolved
  const pendingRequestQueueRef = useRef<
    Map<string, Promise<TranslationSuccess | TranslationError>>
  >(new Map());

  useEffect(() => {
    // remove all pending requests
    requestQueueRef.current.forEach((item) => item.resolve());
    requestQueueRef.current.clear();
  }, [locale]);

  // ----- DEFINE FUNCTIONS ----- //

  const [registerContentForTranslation, registerJsxForTranslation] =
    useMemo(() => {
      const createTranslationRegistrationFunction = (
        type: 'jsx' | 'content'
      ) => {
        return (params: {
          source: Content;
          targetLocale: string;
          metadata: TranslationRequestMetadata;
        }): Promise<TranslationSuccess | TranslationError> => {
          // Get the key, which is a combination of hash and locale
          const key = `${params.metadata.hash}:${params.targetLocale}`;

          // Return a promise to current request if it exists
          const pendingRequest = pendingRequestQueueRef.current.get(key);
          if (pendingRequest) {
            return pendingRequest;
          }

          // Promise for hooking into the translation request to know when complete
          const translationPromise = new Promise<
            TranslationSuccess | TranslationError
          >((resolve, reject) => {
            requestQueueRef.current.set(key, {
              type,
              source: params.source,
              metadata: params.metadata,
              resolve,
              reject,
            });
          })
            .catch((error) => {
              throw error;
            })
            .finally(() => {
              pendingRequestQueueRef.current.delete(key);
            });

          pendingRequestQueueRef.current.set(key, translationPromise);
          return translationPromise;
        };
      };
      return [
        createTranslationRegistrationFunction('content'),
        createTranslationRegistrationFunction('jsx'),
      ];
    }, []); // refs are stable so don't need to be included in dep array

  // ----- DEFINE FUNCTIONS ----- //

  // Send a request to the runtime server
  const sendBatchRequest = useCallback(
    async (
      batchRequests: Map<string, TranslationRequestQueueItem>,
      targetLocale: string
    ) => {
      if (requestQueueRef.current.size === 0) {
        return {};
      }

      // increment active requests
      setActiveRequests((prev) => prev + 1);

      const requests = Array.from(batchRequests.values());
      const newTranslations: TranslationsObject = {};

      try {
        // ----- TRANSLATION LOADING ----- //
        const loadingTranslations: TranslationsObject = Object.entries(
          batchRequests
        ).reduce((acc: TranslationsObject, [hash, request]) => {
          // loading state for jsx, render loading behavior
          acc[request.metadata.hash] = {
            state: 'loading',
          };
          return acc;
        }, {});
        setTranslations((prev: any) => {
          return { ...(prev || {}), ...loadingTranslations };
        });

        // ----- RUNTIME TRANSLATION ----- //
        const fetchWithAbort = async (
          url: string,
          options: RequestInit | undefined,
          timeout: number | undefined
        ) => {
          const controller = new AbortController();
          const timeoutId =
            timeout === undefined
              ? undefined
              : setTimeout(() => controller.abort(), timeout);
          try {
            const res = await fetch(url, {
              ...options,
              signal: controller.signal,
            });
            return res;
          } finally {
            if (timeoutId !== undefined) clearTimeout(timeoutId); // Ensure timeout is cleared
          }
        };
        const response = await fetchWithAbort(
          `${runtimeUrl}/v1/runtime/${projectId}/client`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(devApiKey && { 'x-gt-dev-api-key': devApiKey }),
            },
            body: JSON.stringify({
              requests,
              targetLocale,
              metadata: globalMetadata,
              versionId,
            }),
          },
          renderSettings.timeout
        );

        if (!response.ok) {
          throw new Error(await response.text());
        }

        // ----- PARSE RESPONSE ----- //
        const results = (await response.json()) as any[];
        // don't send another req if one is already in flight

        // process each result
        results.forEach((result, index) => {
          const request = requests[index];
          const hash = request.metadata.hash; // identical to reference hash

          // translation received
          if (
            'translation' in result &&
            result.translation &&
            result.reference
          ) {
            const { translation } = result;
            // set translation
            newTranslations[hash] = {
              state: 'success',
              target: translation,
            };
            return;
          }

          // translation failure
          if (
            result.error !== undefined &&
            result.error !== null &&
            result.code !== undefined &&
            result.code !== null
          ) {
            // 0 and '' are falsey
            // log error message
            console.error(
              createGenericRuntimeTranslationError(
                request.metadata.id,
                request.metadata.hash
              ),
              result.error
            );
            // set error in translation object
            newTranslations[hash] = {
              state: 'error',
              error: result.error,
              code: result.code,
            };
            return;
          }

          // unknown error
          console.error(
            createGenericRuntimeTranslationError(
              request.metadata.id,
              request.metadata.hash
            ),
            result
          );
          newTranslations[hash] = {
            state: 'error',
            error: 'An error occurred.',
            code: 500,
          };
        });
      } catch (error) {
        // log error
        if (error instanceof Error && error.name === 'AbortError') {
          console.warn(runtimeTranslationTimeoutWarning);
        } else {
          console.error(dynamicTranslationError, error);
        }

        // add error message to all translations from this request
        requests.forEach((request) => {
          // id defaults to hash if none provided
          newTranslations[request.metadata.hash] = {
            state: 'error',
            error: 'An error occurred.',
            code: 500,
          };
        });
      } finally {
        // decrement active requests
        setActiveRequests((prev) => prev - 1);

        // resolve all promises
        requests.forEach((request) =>
          request.resolve(newTranslations[request.metadata.hash])
        );

        // return the new translations
        return newTranslations;
      }
    },
    [
      runtimeUrl,
      projectId,
      devApiKey,
      globalMetadata,
      versionId,
      renderSettings.timeout,
    ]
  );

  // Create a ref to hold the latest activeRequests value.
  const activeRequestsRef = useRef(activeRequests);

  // Update the ref whenever activeRequests changes.
  useEffect(() => {
    activeRequestsRef.current = activeRequests;
  }, [activeRequests]);

  useEffect(() => {
    let storeResults = true;
    const intervalId = setInterval(() => {
      // Use the ref value for the current activeRequests
      if (
        requestQueueRef.current.size > 0 &&
        activeRequestsRef.current < maxConcurrentRequests
      ) {
        const batchSize = Math.min(maxBatchSize, requestQueueRef.current.size);
        const batchRequests = new Map(
          Array.from(requestQueueRef.current.entries()).slice(0, batchSize)
        );
        (async () => {
          const batchResult = await sendBatchRequest(batchRequests, locale);
          if (storeResults) {
            setTranslations((prev: any) => ({
              ...(prev || {}),
              ...batchResult,
            }));
          }
        })();
        batchRequests.forEach((_, key) => requestQueueRef.current.delete(key));
      }
    }, batchInterval);

    return () => {
      storeResults = false;
      clearInterval(intervalId);
    };
  }, [locale]);

  return {
    runtimeTranslationEnabled,
    registerContentForTranslation,
    registerJsxForTranslation,
  };
}
