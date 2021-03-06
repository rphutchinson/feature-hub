import {
  FeatureAppDefinition,
  FeatureAppEnvironment,
  FeatureAppScope,
  FeatureServices
} from '@feature-hub/core';
import * as React from 'react';
import {
  FeatureHubContextConsumer,
  FeatureHubContextConsumerValue
} from './feature-hub-context';
import {
  isDomFeatureApp,
  isFeatureApp,
  isReactFeatureApp
} from './internal/type-guards';

export interface BaseFeatureApp {
  /**
   * Client-side only: A Feature App can define a promise that is resolved when
   * it is ready to render its content, e.g. after fetching required data
   * first. If the integrator has defined a loading UI, it will be rendered
   * until the promise is resolved.
   * For a similar behaviour during server-side rendering, one must handle this
   * using the async-ssr-manager.
   */
  readonly loadingPromise?: Promise<void>;
}

/**
 * The recommended way of writing a Feature App for a React integrator.
 */
export interface ReactFeatureApp extends BaseFeatureApp {
  /**
   * A React Feature App must define a `render` method that returns a React
   * element. Since this element is directly rendered by React, the standard
   * React lifecyle methods can be used (if `render` returns an instance of a
   * React `ComponentClass`).
   */
  render(): React.ReactNode;
}

/**
 * A DOM Feature App allows the use of other frontend technologies such as
 * Vue.js or Angular, although it is placed on a web page using React.
 */
export interface DomFeatureApp extends BaseFeatureApp {
  /**
   * @param container The container element to which the Feature App can attach
   * itself.
   */
  attachTo(container: Element): void;
}

/**
 * A Feature App that can be rendered by the [[FeatureAppLoader]] or
 * [[FeatureAppContainer]] must be either a [[ReactFeatureApp]]
 * (recommended) or a [[DomFeatureApp]].
 */
export type FeatureApp = ReactFeatureApp | DomFeatureApp;

export interface CustomFeatureAppRenderingParams {
  /**
   * The Feature App node is a rendered React node, that can be inserted into
   * the react tree.
   *
   * **Caution!** If `featureAppNode` is defined it has to be rendered, even
   * when `loading=true`. A Feature App might depend on being rendered before
   * resolving its loading promise.
   *
   * **Caution!** The Feature App node should always be rendered into the same
   * position of the tree. Otherwise React can re-mount the Feature App, which
   * is resource-expensive and can break DOM Feature Apps.
   */
  featureAppNode?: React.ReactNode;

  /**
   * The Error can be used to render a custom error UI. If there is an error,
   * the Feature App will stop rendering and `featureAppNode` is `undefined`.
   */
  error?: Error;

  /**
   * The loading boolean indicates if the Feature App is still loading, and can
   * be used to render a custom loading UI.
   *
   * **Caution!** If `featureAppNode` is defined it has to be rendered, even
   * when `loading=true`. A Feature App might depend on being rendered before
   * resolving its loading promise.
   *
   * To not show the Feature App in favour of a loading UI, it must be hidden
   * visually (e.g. via `display: none;`).
   */
  loading: boolean;
}

export interface FeatureAppContainerProps<
  TFeatureApp,
  TFeatureServices extends FeatureServices = FeatureServices,
  TConfig = unknown
> {
  /**
   * The Feature App ID is used to identify the Feature App instance. Multiple
   * Feature App Loaders with the same `featureAppId` will render the same
   * Feature app instance. The ID is also used as a consumer ID for dependent
   * Feature Services. To render multiple instances of the same kind of Feature
   * App, different IDs must be used.
   */
  readonly featureAppId: string;

  /**
   * The absolute or relative base URL of the Feature App's assets and/or BFF.
   */
  readonly baseUrl?: string;

  /**
   * The consumer definition of the Feature App.
   */
  readonly featureAppDefinition: FeatureAppDefinition<
    TFeatureApp,
    TFeatureServices,
    TConfig
  >;

  /**
   * A config object that is passed to the Feature App's `create` method.
   */
  readonly config?: TConfig;

  /**
   * A callback that is called before the Feature App is created.
   */
  readonly beforeCreate?: (
    env: FeatureAppEnvironment<TFeatureServices, TConfig>
  ) => void;

  /**
   * A callback that is passed to the Feature App's `create` method. A
   * short-lived Feature App can call this function when it has completed its
   * task. The Integrator (or parent Feature App) can then decide to e.g.
   * unmount the Feature App.
   */
  readonly done?: () => void;

  readonly onError?: (error: Error) => void;

  /**
   * @deprecated Use the `children` render function instead to render an error.
   */
  readonly renderError?: (error: Error) => React.ReactNode;

  /**
   * A children function can be provided to customize rendering of the
   * Feature App and provide Error or Loading UIs.
   */
  readonly children?: (
    params: CustomFeatureAppRenderingParams
  ) => React.ReactNode;
}

type InternalFeatureAppContainerProps<
  TFeatureApp,
  TFeatureServices extends FeatureServices,
  TConfig
> = FeatureAppContainerProps<TFeatureApp, TFeatureServices, TConfig> &
  Pick<FeatureHubContextConsumerValue, 'featureAppManager' | 'logger'>;

type InternalFeatureAppContainerState<TFeatureApp extends FeatureApp> =
  | {
      readonly error: Error;
      readonly featureApp?: TFeatureApp;
      readonly failedToHandleAsyncError?: boolean;
      readonly loading: boolean;
    }
  | {
      readonly featureApp: TFeatureApp;
      readonly failedToHandleAsyncError?: boolean;
      readonly loading: boolean;
    };

class InternalFeatureAppContainer<
  TFeatureApp extends FeatureApp,
  TFeatureServices extends FeatureServices = FeatureServices,
  TConfig = unknown
> extends React.PureComponent<
  InternalFeatureAppContainerProps<TFeatureApp, TFeatureServices, TConfig>,
  InternalFeatureAppContainerState<TFeatureApp>
> {
  private readonly featureAppScope?: FeatureAppScope<TFeatureApp>;
  private readonly containerRef = React.createRef<HTMLDivElement>();
  private mounted = false;

  public constructor(
    props: InternalFeatureAppContainerProps<
      TFeatureApp,
      TFeatureServices,
      TConfig
    >
  ) {
    super(props);

    const {
      baseUrl,
      beforeCreate,
      config,
      featureAppDefinition,
      featureAppId,
      featureAppManager,
      done
    } = props;

    try {
      this.featureAppScope = featureAppManager.createFeatureAppScope(
        featureAppId,
        featureAppDefinition,
        {baseUrl, config, beforeCreate, done}
      );

      const {featureApp} = this.featureAppScope;

      if (!isFeatureApp(featureApp)) {
        throw new Error(
          'Invalid Feature App found. The Feature App must be an object with either 1) a `render` method that returns a React element, or 2) an `attachTo` method that accepts a container DOM element.'
        );
      }

      // If no loading promise was given, "loading" should always be false
      this.state = {
        featureApp,
        loading: Boolean(featureApp.loadingPromise)
      };
    } catch (error) {
      this.handleError(error);

      this.state = {loading: false, error};
    }
  }

  public componentDidCatch(error: Error): void {
    this.handleError(error);

    this.setState({error, loading: false});
  }

  public componentDidMount(): void {
    this.mounted = true;

    const container = this.containerRef.current;

    if (!('error' in this.state) && this.state.featureApp.loadingPromise) {
      this.state.featureApp.loadingPromise
        .then(() => {
          this.setState({loading: false});
        })
        .catch(loadingError => {
          try {
            this.handleError(loadingError);

            if (this.mounted) {
              this.setState({error: loadingError, loading: false});
            }
          } catch (handlerError) {
            if (this.mounted) {
              this.setState({
                error: handlerError,
                failedToHandleAsyncError: true,
                loading: false
              });
            }
          }
        });
    }

    if (
      container &&
      !('error' in this.state) &&
      isDomFeatureApp(this.state.featureApp)
    ) {
      try {
        this.state.featureApp.attachTo(container);
      } catch (error) {
        this.componentDidCatch(error);
      }
    }
  }

  public componentWillUnmount(): void {
    this.mounted = false;

    if (this.featureAppScope) {
      try {
        this.featureAppScope.release();
      } catch (error) {
        this.handleError(error);
      }
    }
  }

  public render(): React.ReactNode {
    if ('error' in this.state) {
      if (this.state.failedToHandleAsyncError) {
        throw this.state.error;
      }

      return this.renderError(this.state.error);
    }

    const {featureApp, loading} = this.state;

    let featureAppNode: React.ReactNode;

    if (isReactFeatureApp(featureApp)) {
      try {
        featureAppNode = featureApp.render();
      } catch (error) {
        this.handleError(error);

        return this.renderError(error);
      }
    } else {
      featureAppNode = <div ref={this.containerRef} />;
    }

    return this.props.children
      ? this.props.children({featureAppNode, loading})
      : featureAppNode;
  }

  private renderError(error: Error): React.ReactNode {
    // tslint:disable-next-line: deprecation
    const {children, renderError} = this.props;

    if (children) {
      return children({error, loading: false});
    }

    if (renderError) {
      return renderError(error);
    }

    return null;
  }

  private handleError(error: Error): void {
    const {logger, onError} = this.props;

    if (onError) {
      onError(error);
    } else {
      logger.error(error);
    }
  }
}

/**
 * The `FeatureAppContainer` component allows the integrator to bundle Feature
 * Apps instead of loading them from a remote location. It can also be used by
 * a Feature App to render another Feature App as a child.
 *
 * When a Feature App throws an error while rendering or, in the case of a
 * [[ReactFeatureApp]], throws an error in a lifecycle method, the
 * `FeatureAppContainer` renders `null`. On the server, however, rendering
 * errors are not caught and must therefore be handled by the integrator.
 */
export function FeatureAppContainer<
  TFeatureApp extends FeatureApp,
  TFeatureServices extends FeatureServices = FeatureServices,
  TConfig = unknown
>(
  props: FeatureAppContainerProps<TFeatureApp, TFeatureServices, TConfig>
): JSX.Element {
  return (
    <FeatureHubContextConsumer>
      {({featureAppManager, logger}) => (
        <InternalFeatureAppContainer<TFeatureApp, TFeatureServices, TConfig>
          featureAppManager={featureAppManager}
          logger={logger}
          {...props}
        />
      )}
    </FeatureHubContextConsumer>
  );
}
