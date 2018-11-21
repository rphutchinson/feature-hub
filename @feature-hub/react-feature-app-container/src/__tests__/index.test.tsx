import {
  FeatureAppDefinition,
  FeatureAppManagerLike,
  FeatureAppScope
} from '@feature-hub/feature-app-manager';
import {mount, shallow} from 'enzyme';
import * as React from 'react';
import {ReactFeatureAppContainer} from '..';

describe('ReactFeatureAppContainer', () => {
  let mockManager: FeatureAppManagerLike;
  let mockGetFeatureAppScope: jest.Mock;
  let mockFeatureAppDefinition: FeatureAppDefinition<unknown>;
  let mockFeatureAppScope: FeatureAppScope<unknown>;
  let spyConsoleError: jest.SpyInstance;

  beforeEach(() => {
    mockFeatureAppDefinition = {id: 'testId', create: jest.fn()};
    mockFeatureAppScope = {featureApp: {}, destroy: jest.fn()};
    mockGetFeatureAppScope = jest.fn(() => mockFeatureAppScope);

    mockManager = {
      getAsyncFeatureAppDefinition: jest.fn(),
      getFeatureAppScope: mockGetFeatureAppScope,
      preloadFeatureApp: jest.fn(),
      destroy: jest.fn()
    };

    spyConsoleError = jest.spyOn(console, 'error');
    spyConsoleError.mockImplementation(jest.fn());
  });

  afterEach(() => {
    spyConsoleError.mockRestore();
  });

  describe('with a react feature app', () => {
    beforeEach(() => {
      mockFeatureAppScope = {
        featureApp: {
          render: () => <div>This is the react feature app.</div>
        },
        destroy: jest.fn()
      };
    });

    it('renders the react element', () => {
      const wrapper = shallow(
        <ReactFeatureAppContainer
          manager={mockManager}
          featureAppDefinition={mockFeatureAppDefinition}
          featureAppKey="testKey"
        />
      );

      expect(wrapper).toMatchInlineSnapshot(`
<div>
  This is the react feature app.
</div>
`);
    });

    describe('when unmounted', () => {
      it('calls destroy() on the feature app scope', () => {
        const wrapper = shallow(
          <ReactFeatureAppContainer
            manager={mockManager}
            featureAppDefinition={mockFeatureAppDefinition}
            featureAppKey="testKey"
          />
        );

        // tslint:disable-next-line:no-unbound-method
        expect(mockFeatureAppScope.destroy).not.toHaveBeenCalled();

        wrapper.unmount();

        // tslint:disable-next-line:no-unbound-method
        expect(mockFeatureAppScope.destroy).toHaveBeenCalledTimes(1);
      });

      describe('when the feature app scope throws an error while being destroyed', () => {
        let mockError: Error;

        beforeEach(() => {
          mockError = new Error('Failed to destroy feature app scope');

          mockFeatureAppScope.destroy = () => {
            throw mockError;
          };
        });

        it('logs the error', () => {
          const wrapper = shallow(
            <ReactFeatureAppContainer
              manager={mockManager}
              featureAppDefinition={mockFeatureAppDefinition}
              featureAppKey="testKey"
            />
          );

          wrapper.unmount();

          expect(spyConsoleError.mock.calls).toEqual([[mockError]]);
        });
      });
    });
  });

  describe('with a dom feature app', () => {
    beforeEach(() => {
      mockFeatureAppScope = {
        featureApp: {
          attachTo(container: HTMLElement): void {
            container.innerHTML = 'This is the dom feature app.';
          }
        },
        destroy: jest.fn()
      };
    });

    it("renders a container and passes it to the feature app's render method", () => {
      const wrapper = mount(
        <ReactFeatureAppContainer
          manager={mockManager}
          featureAppDefinition={mockFeatureAppDefinition}
          featureAppKey="testKey"
        />
      );

      expect(wrapper.html()).toMatchInlineSnapshot(
        '"<div>This is the dom feature app.</div>"'
      );
    });

    describe('when unmounted', () => {
      it('calls destroy() on the feature app scope', () => {
        const wrapper = shallow(
          <ReactFeatureAppContainer
            manager={mockManager}
            featureAppDefinition={mockFeatureAppDefinition}
            featureAppKey="testKey"
          />
        );

        // tslint:disable-next-line:no-unbound-method
        expect(mockFeatureAppScope.destroy).not.toHaveBeenCalled();

        wrapper.unmount();

        // tslint:disable-next-line:no-unbound-method
        expect(mockFeatureAppScope.destroy).toHaveBeenCalledTimes(1);
      });

      describe('when the feature app scope throws an error while being destroyed', () => {
        let mockError: Error;

        beforeEach(() => {
          mockError = new Error('Failed to destroy feature app scope');

          mockFeatureAppScope.destroy = () => {
            throw mockError;
          };
        });

        it('logs the error', () => {
          const wrapper = shallow(
            <ReactFeatureAppContainer
              manager={mockManager}
              featureAppDefinition={mockFeatureAppDefinition}
              featureAppKey="testKey"
            />
          );

          wrapper.unmount();

          expect(spyConsoleError.mock.calls).toEqual([[mockError]]);
        });
      });
    });
  });

  for (const invalidFeatureApp of [
    undefined,
    null,
    {},
    {attachTo: 'foo'},
    {render: 'foo'}
  ]) {
    describe(`when an invalid feature app (${JSON.stringify(
      invalidFeatureApp
    )}) is created`, () => {
      beforeEach(() => {
        mockFeatureAppScope = {
          featureApp: invalidFeatureApp,
          destroy: jest.fn()
        };
      });

      it('renders nothing and logs an error', () => {
        const wrapper = shallow(
          <ReactFeatureAppContainer
            manager={mockManager}
            featureAppDefinition={mockFeatureAppDefinition}
            featureAppKey="testKey"
          />
        );

        expect(wrapper.isEmptyRender()).toBe(true);

        const expectedError = new Error(
          'Invalid feature app found. The feature app must be an object with either 1) a `render` method that returns a react element, or 2) an `attachTo` method that accepts a container DOM element.'
        );

        expect(spyConsoleError.mock.calls).toEqual([[expectedError]]);
      });
    });
  }

  describe('when a feature app scope fails to be created', () => {
    let mockError: Error;

    beforeEach(() => {
      mockError = new Error('Failed to create feature app scope.');

      mockGetFeatureAppScope.mockImplementation(() => {
        throw mockError;
      });
    });

    it('renders nothing and logs an error', () => {
      const wrapper = shallow(
        <ReactFeatureAppContainer
          manager={mockManager}
          featureAppDefinition={mockFeatureAppDefinition}
          featureAppKey="testKey"
        />
      );

      expect(wrapper.isEmptyRender()).toBe(true);

      expect(spyConsoleError.mock.calls).toEqual([[mockError]]);
    });

    describe('when unmounted', () => {
      it('does nothing', () => {
        const wrapper = shallow(
          <ReactFeatureAppContainer
            manager={mockManager}
            featureAppDefinition={mockFeatureAppDefinition}
            featureAppKey="testKey"
          />
        );

        wrapper.unmount();
      });
    });
  });
});