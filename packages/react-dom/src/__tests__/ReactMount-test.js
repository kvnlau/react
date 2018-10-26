/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails react-core
 */

'use strict';

const {COMMENT_NODE} = require('../shared/HTMLNodeType');

let React;
let ReactDOM;
let ReactDOMServer;
let ReactTestUtils;

describe('ReactMount', () => {
  beforeEach(() => {
    jest.resetModules();

    React = require('react');
    ReactDOM = require('react-dom');
    ReactDOMServer = require('react-dom/server');
    ReactTestUtils = require('react-dom/test-utils');
  });

  describe('unmountComponentAtNode', () => {
    it('throws when given a non-node', () => {
      const nodeArray = document.getElementsByTagName('div');
      expect(() => {
        ReactDOM.unmountComponentAtNode(nodeArray);
      }).toThrowError(
        'unmountComponentAtNode(...): Target container is not a DOM element.',
      );
    });

    it('returns false on non-React containers', () => {
      const d = document.createElement('div');
      d.innerHTML = '<b>hellooo</b>';
      expect(ReactDOM.unmountComponentAtNode(d)).toBe(false);
      expect(d.textContent).toBe('hellooo');
    });

    it('returns true on React containers', () => {
      const d = document.createElement('div');
      ReactDOM.render(<b>hellooo</b>, d);
      expect(d.textContent).toBe('hellooo');
      expect(ReactDOM.unmountComponentAtNode(d)).toBe(true);
      expect(d.textContent).toBe('');
    });
  });

  it('warns when given a factory', () => {
    class Component extends React.Component {
      render() {
        return <div />;
      }
    }

    expect(() => ReactTestUtils.renderIntoDocument(Component)).toWarnDev(
      'Functions are not valid as a React child. ' +
        'This may happen if you return a Component instead of <Component /> from render. ' +
        'Or maybe you meant to call this function rather than return it.',
      {withoutStack: true},
    );
  });

  it('should render different components in same root', () => {
    const container = document.createElement('container');
    document.body.appendChild(container);

    ReactDOM.render(<div />, container);
    expect(container.firstChild.nodeName).toBe('DIV');

    ReactDOM.render(<span />, container);
    expect(container.firstChild.nodeName).toBe('SPAN');
  });

  it('should unmount and remount if the key changes', () => {
    const container = document.createElement('container');

    const mockMount = jest.fn();
    const mockUnmount = jest.fn();

    class Component extends React.Component {
      componentDidMount = mockMount;
      componentWillUnmount = mockUnmount;
      render() {
        return <span>{this.props.text}</span>;
      }
    }

    expect(mockMount).toHaveBeenCalledTimes(0);
    expect(mockUnmount).toHaveBeenCalledTimes(0);

    ReactDOM.render(<Component text="orange" key="A" />, container);
    expect(container.firstChild.innerHTML).toBe('orange');
    expect(mockMount).toHaveBeenCalledTimes(1);
    expect(mockUnmount).toHaveBeenCalledTimes(0);

    // If we change the key, the component is unmounted and remounted
    ReactDOM.render(<Component text="green" key="B" />, container);
    expect(container.firstChild.innerHTML).toBe('green');
    expect(mockMount).toHaveBeenCalledTimes(2);
    expect(mockUnmount).toHaveBeenCalledTimes(1);

    // But if we don't change the key, the component instance is reused
    ReactDOM.render(<Component text="blue" key="B" />, container);
    expect(container.firstChild.innerHTML).toBe('blue');
    expect(mockMount).toHaveBeenCalledTimes(2);
    expect(mockUnmount).toHaveBeenCalledTimes(1);
  });

  it('should reuse markup if rendering to the same target twice', () => {
    const container = document.createElement('container');
    const instance1 = ReactDOM.render(<div />, container);
    const instance2 = ReactDOM.render(<div />, container);

    expect(instance1 === instance2).toBe(true);
  });

  it('should warn if mounting into left padded rendered markup', () => {
    const container = document.createElement('container');
    container.innerHTML = ' ' + ReactDOMServer.renderToString(<div />);

    expect(() => ReactDOM.hydrate(<div />, container)).toWarnDev(
      "Warning: Did not expect server HTML to contain the text node {' '} in <container>.\n\n" +
        '  <container>\n' +
        "-   {' '}\n" +
        '    <div data-reactroot="" />\n' +
        '  </container>\n\n' +
        '    in div (at **)',
    );
  });

  it('should warn if mounting into right padded rendered markup', () => {
    const container = document.createElement('container');
    container.innerHTML = ReactDOMServer.renderToString(<div />) + ' ';

    expect(() => ReactDOM.hydrate(<div />, container)).toWarnDev(
      "Warning: Did not expect server HTML to contain the text node {' '} in <container>.\n\n" +
        '  <container>\n' +
        '    <div data-reactroot="" />\n' +
        "-   {' '}\n" +
        '  </container>\n',
      // Without the component stack here because it's empty: found an unexpected text node directly in the root node.
      {withoutStack: true},
    );
  });

  it('should not warn if mounting into non-empty node', () => {
    const container = document.createElement('container');
    container.innerHTML = '<div></div>';

    ReactDOM.render(<div />, container);
  });

  it('should warn when mounting into document.body', () => {
    const iFrame = document.createElement('iframe');
    document.body.appendChild(iFrame);

    expect(() =>
      ReactDOM.render(<div />, iFrame.contentDocument.body),
    ).toWarnDev(
      'Rendering components directly into document.body is discouraged',
      {withoutStack: true},
    );
  });

  it('should warn when a hydrated element has inner text mismatch', () => {
    // See fixtures/ssr: ssr-warnForTextDifference

    class Component extends React.Component {
      render() {
        return this.props.children;
      }
    }

    const div = document.createElement('div');
    const markup = ReactDOMServer.renderToString(
      <Component>
        <div>server text</div>
      </Component>,
    );
    div.innerHTML = markup;

    expect(() =>
      ReactDOM.hydrate(
        <Component>
          <div>client text</div>
        </Component>,
        div,
      ),
    ).toWarnDev(
      'Text content did not match. ' +
        'Server: "server text" ' +
        'Client: "client text"\n' +
        '    in div (at **)\n' +
        '    in Component (at **)',
    );
  });

  it('should warn when hydrating a text node over a mismatching text node', () => {
    // See fixtures/ssr: ssr-warnForTextDifference-didNotMatchHydratedContainerTextInstance

    const div = document.createElement('div');
    const markup = ReactDOMServer.renderToString('server text');
    div.innerHTML = markup;

    expect(() => ReactDOM.hydrate('client text', div)).toWarnDev(
      'Text content did not match. ' +
        'Server: "server text" ' +
        'Client: "client text"',
      // Without the component stack here because it's empty: rendering a text node directly into the root node.
      {withoutStack: true},
    );
  });

  it('should warn when a hydrated element has first text match but second text mismatch', () => {
    // See fixtures/ssr: ssr-warnForTextDifference-didNotMatchHydratedTextInstance

    class Component extends React.Component {
      render() {
        return this.props.children;
      }
    }

    const serverRandom = Math.random();
    const clientRandom = Math.random();

    const div = document.createElement('div');
    const markup = ReactDOMServer.renderToString(
      <Component>
        <em>
          {'SSRMismatchTest static text and '}
          {'server random text ' + serverRandom}
        </em>
      </Component>,
    );
    div.innerHTML = markup;

    expect(() =>
      ReactDOM.hydrate(
        <Component>
          <em>
            {'SSRMismatchTest static text and '}
            {'client random text ' + clientRandom}
          </em>
        </Component>,
        div,
      ),
    ).toWarnDev(
      'Text content did not match. ' +
        'Server: "server random text ' +
        serverRandom +
        '" ' +
        'Client: "client random text ' +
        clientRandom +
        '"\n' +
        '    in em (at **)\n' +
        '    in Component (at **)',
    );
  });

  it('should warn when a hydrated element has children mismatch (replacement diff)', () => {
    // See fixtures/ssr: ssr-warnForInsertedHydratedTextInstance-didNotFindHydratableTextInstance-replacement

    class Component extends React.Component {
      render() {
        return this.props.children;
      }
    }

    const div = document.createElement('div');
    const markup = ReactDOMServer.renderToString(
      <Component>
        nested{'   '}
        <h1>
          children <b>text</b>
        </h1>
        <div data-ssr-mismatch-padding-after="1" />
        <div data-ssr-mismatch-padding-after="2" />
        <div data-ssr-mismatch-padding-after="3" />
        <div data-ssr-mismatch-padding-after="4" />
        <div data-ssr-mismatch-padding-after="5" />
      </Component>,
    );
    div.innerHTML = markup;

    expect(div.outerHTML).toEqual(
      '<div>nested<!-- -->   <h1>children <b>text</b></h1>' +
        '<div data-ssr-mismatch-padding-after="1"></div>' +
        '<div data-ssr-mismatch-padding-after="2"></div>' +
        '<div data-ssr-mismatch-padding-after="3"></div>' +
        '<div data-ssr-mismatch-padding-after="4"></div>' +
        '<div data-ssr-mismatch-padding-after="5"></div>' +
        '</div>',
    );

    expect(() =>
      ReactDOM.hydrate(
        <Component>
          nested{'   '}
          <h2>
            children <b>text</b>
          </h2>
        </Component>,
        div,
      ),
    ).toWarnDev(
      'Warning: Expected server HTML to contain a matching <h2> in <div>.\n\n' +
        '  <div>\n' +
        "    {'nested'}\n" +
        '    <!-- -->\n' +
        "    {'   '}\n" +
        '-   <h1>children <b>text</b></h1>\n' +
        '+   <h2>children <b>text</b></h2>\n' +
        '    <div data-ssr-mismatch-padding-after="1" />\n' +
        '    <div data-ssr-mismatch-padding-after="2" />\n' +
        '    <div data-ssr-mismatch-padding-after="3" />\n' +
        '    <div data-ssr-mismatch-padding-after="4" />\n' +
        '    <div data-ssr-mismatch-padding-after="5" />\n' +
        '  </div>\n\n' +
        '    in h2 (at **)\n' +
        '    in Component (at **)',
    );
  });

  it('should warn when a hydrated element has extra child element (insertion diff)', () => {
    // See fixtures/ssr: ssr-warnForInsertedHydratedTextInstance-didNotFindHydratableInstance-insertion

    class Component extends React.Component {
      render() {
        return this.props.children;
      }
    }

    const div = document.createElement('div');
    const markup = ReactDOMServer.renderToString(
      <Component>
        nested{'   '}
        <h1>
          children <b>text</b>
        </h1>
        <div data-ssr-mismatch-padding="1" />
        <div data-ssr-mismatch-padding="2" />
        <div data-ssr-mismatch-padding="3" />
        <div data-ssr-mismatch-padding="4" />
        <div data-ssr-mismatch-padding="5" />
      </Component>,
    );
    div.innerHTML = markup;

    expect(div.outerHTML).toEqual(
      '<div>nested<!-- -->   <h1>children <b>text</b></h1>' +
        '<div data-ssr-mismatch-padding="1"></div>' +
        '<div data-ssr-mismatch-padding="2"></div>' +
        '<div data-ssr-mismatch-padding="3"></div>' +
        '<div data-ssr-mismatch-padding="4"></div>' +
        '<div data-ssr-mismatch-padding="5"></div>' +
        '</div>',
    );

    expect(() =>
      ReactDOM.hydrate(
        <Component>
          nested{'   '}
          <h1>
            children <b>text</b>
          </h1>
          <div data-ssr-mismatch-padding="1" />
          <div data-ssr-mismatch-padding="2" />
          <div data-ssr-mismatch-padding="3" />
          <div data-ssr-mismatch-padding="4" />
          <div data-ssr-mismatch-padding="5" />
          <h2>
            extra <b>element</b>
          </h2>
        </Component>,
        div,
      ),
    ).toWarnDev(
      'Warning: Expected server HTML to contain a matching <h2> in <div>.\n\n' +
        '  <div>\n' +
        "    {'nested'}\n" +
        '    <!-- -->\n' +
        "    {'   '}\n" +
        '    <h1>children <b>text</b></h1>\n' +
        '    <div data-ssr-mismatch-padding="1" />\n' +
        '    <div data-ssr-mismatch-padding="2" />\n' +
        '    <div data-ssr-mismatch-padding="3" />\n' +
        '    <div data-ssr-mismatch-padding="4" />\n' +
        '    <div data-ssr-mismatch-padding="5" />\n' +
        '+   <h2>extra <b>element</b></h2>\n' +
        '  </div>\n\n' +
        '    in h2 (at **)\n' +
        '    in Component (at **)',
    );
  });

  it('should warn when a hydrated element has extra child text node (insertion diff)', () => {
    // See fixtures/ssr: ssr-warnForInsertedHydratedTextInstance-didNotFindHydratableTextInstance-insertion

    class Component extends React.Component {
      render() {
        return this.props.children;
      }
    }

    const div = document.createElement('div');
    const markup = ReactDOMServer.renderToString(
      <Component>
        nested{'   '}
        <h1>
          children <b>text</b>
        </h1>
        <div data-ssr-mismatch-padding="1" />
        <div data-ssr-mismatch-padding="2" />
        <div data-ssr-mismatch-padding="3" />
        <div data-ssr-mismatch-padding="4" />
        <div data-ssr-mismatch-padding="5" />
      </Component>,
    );
    div.innerHTML = markup;

    expect(div.outerHTML).toEqual(
      '<div>nested<!-- -->   <h1>children <b>text</b></h1>' +
        '<div data-ssr-mismatch-padding="1"></div>' +
        '<div data-ssr-mismatch-padding="2"></div>' +
        '<div data-ssr-mismatch-padding="3"></div>' +
        '<div data-ssr-mismatch-padding="4"></div>' +
        '<div data-ssr-mismatch-padding="5"></div>' +
        '</div>',
    );

    expect(() =>
      ReactDOM.hydrate(
        <Component>
          nested{'   '}
          <h1>
            children <b>text</b>
          </h1>
          <div data-ssr-mismatch-padding="1" />
          <div data-ssr-mismatch-padding="2" />
          <div data-ssr-mismatch-padding="3" />
          <div data-ssr-mismatch-padding="4" />
          <div data-ssr-mismatch-padding="5" />
          {'extra text node'}
        </Component>,
        div,
      ),
    ).toWarnDev(
      "Warning: Expected server HTML to contain a matching text node for {'extra text node'} in <div>.\n\n" +
        '  <div>\n' +
        "    {'nested'}\n" +
        '    <!-- -->\n' +
        "    {'   '}\n" +
        '    <h1>children <b>text</b></h1>\n' +
        '    <div data-ssr-mismatch-padding="1" />\n' +
        '    <div data-ssr-mismatch-padding="2" />\n' +
        '    <div data-ssr-mismatch-padding="3" />\n' +
        '    <div data-ssr-mismatch-padding="4" />\n' +
        '    <div data-ssr-mismatch-padding="5" />\n' +
        "+   {'extra text node'}\n" +
        '  </div>\n\n' +
        '    in Component (at **)',
    );
  });

  it('should account for escaping on a checksum mismatch', () => {
    const div = document.createElement('div');
    const markup = ReactDOMServer.renderToString(
      <div>This markup contains an nbsp entity: &nbsp; server text</div>,
    );
    div.innerHTML = markup;

    expect(() =>
      ReactDOM.hydrate(
        <div>This markup contains an nbsp entity: &nbsp; client text</div>,
        div,
      ),
    ).toWarnDev(
      'Warning: Text content did not match. ' +
        'Server: "This markup contains an nbsp entity:   server text" ' +
        'Client: "This markup contains an nbsp entity:   client text"\n' +
        '    in div (at **)',
    );
  });

  it('should warn when a hydrated element has extra props with non-null values', () => {
    // See fixtures/ssr: ssr-warnForPropDifference

    const div = document.createElement('div');
    const markup = ReactDOMServer.renderToString(
      <div>
        <em>SSRMismatchTest default text</em>
      </div>,
    );
    div.innerHTML = markup;

    expect(() =>
      ReactDOM.hydrate(
        <div data-ssr-extra-prop={true} data-ssr-extra-prop-2={true}>
          <em>SSRMismatchTest default text</em>
        </div>,
        div,
      ),
    ).toWarnDev(
      'Warning: Prop `data-ssr-extra-prop` did not match. ' +
        'Server: null ' +
        'Client: true\n' +
        '    in div (at **)',
    );
  });

  it('should not warn when a hydrated element has extra props explicitly set to null', () => {
    // See fixtures/ssr: ssr-warnForPropDifference-null-no-warning

    const div = document.createElement('div');
    const markup = ReactDOMServer.renderToString(
      <div>
        <em>SSRMismatchTest default text</em>
      </div>,
    );
    div.innerHTML = markup;

    expect(() =>
      ReactDOM.hydrate(
        <div data-ssr-extra-prop={null} data-ssr-extra-prop-2={null}>
          <em>SSRMismatchTest default text</em>
        </div>,
        div,
      ),
    ).toWarnDev([]);
  });

  it('should warn when a server element has extra props', () => {
    // See fixtures/ssr: ssr-warnForExtraAttributes

    const div = document.createElement('div');
    const markup = ReactDOMServer.renderToString(
      <div data-ssr-extra-prop={true} data-ssr-extra-prop-2={true}>
        <em>SSRMismatchTest default text</em>
      </div>,
    );
    div.innerHTML = markup;

    expect(() =>
      ReactDOM.hydrate(
        <div>
          <em>SSRMismatchTest default text</em>
        </div>,
        div,
      ),
    ).toWarnDev(
      'Warning: Extra attributes from the server: data-ssr-extra-prop,data-ssr-extra-prop-2\n' +
        '    in div (at **)',
    );
  });

  it('should warn when a browser element has an event handler which is set to false', () => {
    // See fixtures/ssr: ssr-warnForInvalidEventListener-false

    const div = document.createElement('div');
    const markup = ReactDOMServer.renderToString(<div onClick={() => {}} />);
    div.innerHTML = markup;

    expect(() => ReactDOM.hydrate(<div onClick={false} />, div)).toWarnDev(
      'Warning: Expected `onClick` listener to be a function, instead got `false`.\n\n' +
        'If you used to conditionally omit it with onClick={condition && value}, ' +
        'pass onClick={condition ? value : undefined} instead.\n' +
        '    in div (at **)',
    );
  });

  it('should warn when a browser element has an event handler which is set to a non-function, non-false value', () => {
    // See fixtures/ssr: ssr-warnForInvalidEventListener-typeof

    const div = document.createElement('div');
    const markup = ReactDOMServer.renderToString(<div onClick={() => {}} />);
    div.innerHTML = markup;

    expect(() => ReactDOM.hydrate(<div onClick={'a string'} />, div)).toWarnDev(
      'Warning: Expected `onClick` listener to be a function, instead got a value of `string` type.\n' +
        '    in div (at **)',
    );
  });

  it('should warn when hydrate removes an element within a root container (removal diff)', () => {
    // See fixtures/ssr: ssr-warnForDeletedHydratableInstance-didNotHydrateContainerInstance-element

    const div = document.createElement('div');
    div.setAttribute('data-ssr-mismatch-test-hydrate-root', '');
    const markup =
      'SSRMismatchTest first text' +
      '<br />' +
      '<br />' +
      'SSRMismatchTest second text';
    div.innerHTML = markup;

    expect(() =>
      ReactDOM.hydrate(
        [
          'SSRMismatchTest first text',
          <br key={1} />,
          'SSRMismatchTest second text',
        ],
        div,
      ),
    ).toWarnDev(
      'Warning: Did not expect server HTML to contain a <br> in <div>.\n\n' +
        '  <div data-ssr-mismatch-test-hydrate-root="">\n' +
        "    {'SSRMismatchTest first text'}\n" +
        '    <br />\n' +
        '-   <br />\n' +
        "    {'SSRMismatchTest second text'}\n" +
        '  </div>\n',
      // Without the component stack here because it's empty: rendering a text node directly into the root node.
      {withoutStack: true},
    );
  });

  it('should warn when hydrate removes an element within an element (removal diff)', () => {
    // See fixtures/ssr: ssr-warnForDeletedHydratableInstance-didNotHydrateInstance-element

    const div = document.createElement('div');
    const markup = ReactDOMServer.renderToString(
      <div>
        <div>SSRMismatchTest default text</div>
        <span />
        <div data-ssr-mismatch-padding-after="1" />
        <div data-ssr-mismatch-padding-after="2" />
        <div data-ssr-mismatch-padding-after="3" />
        <div data-ssr-mismatch-padding-after="4" />
        <div data-ssr-mismatch-padding-after="5" />
      </div>,
    );
    div.innerHTML = markup;

    expect(() =>
      ReactDOM.hydrate(
        <div>
          <span />
        </div>,
        div,
      ),
    ).toWarnDev(
      'Warning: Did not expect server HTML to contain a <div> in <div>.\n\n' +
        '  <div data-reactroot="">\n' +
        '-   <div>SSRMismatchTest default text</div>\n' +
        '    <span />\n' +
        '    <div data-ssr-mismatch-padding-after="1" />\n' +
        '    <div data-ssr-mismatch-padding-after="2" />\n' +
        '    <div data-ssr-mismatch-padding-after="3" />\n' +
        '    <div data-ssr-mismatch-padding-after="4" />\n' +
        '    <div data-ssr-mismatch-padding-after="5" />\n' +
        '  </div>\n\n' +
        '    in span (at **)\n' +
        '    in div (at **)',
    );
  });

  it('should warn when hydrate replaces an element within server-rendered nested components (replacement diff)', () => {
    // See fixtures/ssr: ssr-hydrationWarningHostInstanceIndex-didNotFindHydratableInstance-replacement

    class TestPaddingBeforeInnerComponent extends React.Component {
      render() {
        return (
          <React.Fragment>
            <div data-ssr-mismatch-padding-before="2" />
            <div data-ssr-mismatch-padding-before="3" />
          </React.Fragment>
        );
      }
    }
    class TestPaddingBeforeComponent extends React.Component {
      render() {
        return (
          <React.Fragment>
            <div data-ssr-mismatch-padding-before="1" />
            <TestPaddingBeforeInnerComponent />
            <div data-ssr-mismatch-padding-before="4" />
            <div data-ssr-mismatch-padding-before="5" />
          </React.Fragment>
        );
      }
    }
    class TestPaddingAfterComponent extends React.Component {
      render() {
        return (
          <React.Fragment>
            <div data-ssr-mismatch-padding-after="1" />
            <div data-ssr-mismatch-padding-after="2" />
            <div data-ssr-mismatch-padding-after="3" />
            <div data-ssr-mismatch-padding-after="4" />
            <div data-ssr-mismatch-padding-after="5" />
          </React.Fragment>
        );
      }
    }
    class TestNestedComponent extends React.Component {
      render() {
        if (this.props.isServer) {
          return (
            <div>
              <TestPaddingBeforeComponent />
              <h1>SSRMismatchTest default text</h1>
              <span />
              <TestPaddingAfterComponent />
            </div>
          );
        }
        return (
          <div>
            <TestPaddingBeforeComponent />
            <h2>SSRMismatchTest default text</h2>
            <span />
            <TestPaddingAfterComponent />
          </div>
        );
      }
    }
    class TestComponent extends React.Component {
      render() {
        return <TestNestedComponent isServer={this.props.isServer} />;
      }
    }

    const div = document.createElement('div');
    const markup = ReactDOMServer.renderToString(
      <TestComponent isServer={true} />,
    );
    div.innerHTML = markup;

    expect(() =>
      ReactDOM.hydrate(<TestComponent isServer={false} />, div),
    ).toWarnDev(
      'Warning: Expected server HTML to contain a matching <h2> in <div>.\n\n' +
        '  <div data-reactroot="">\n' +
        '    <div data-ssr-mismatch-padding-before="1" />\n' +
        '    <div data-ssr-mismatch-padding-before="2" />\n' +
        '    <div data-ssr-mismatch-padding-before="3" />\n' +
        '    <div data-ssr-mismatch-padding-before="4" />\n' +
        '    <div data-ssr-mismatch-padding-before="5" />\n' +
        '-   <h1>SSRMismatchTest default text</h1>\n' +
        '+   <h2>SSRMismatchTest default text</h2>\n' +
        '    <span />\n' +
        '    <div data-ssr-mismatch-padding-after="1" />\n' +
        '    <div data-ssr-mismatch-padding-after="2" />\n' +
        '    <div data-ssr-mismatch-padding-after="3" />\n' +
        '    <div data-ssr-mismatch-padding-after="4" />\n' +
        '    <div data-ssr-mismatch-padding-after="5" />\n' +
        '  </div>\n\n' +
        '    in h2 (at **)\n' +
        '    in div (at **)\n' +
        '    in TestNestedComponent (at **)\n' +
        '    in TestComponent (at **)',
    );
  });

  it('should warn when hydrate removes a text node within a root container (removal diff)', () => {
    // See fixtures/ssr: ssr-warnForDeletedHydratableInstance-didNotHydrateContainerInstance-text

    const div = document.createElement('div');
    div.setAttribute('data-ssr-mismatch-test-hydrate-root', '');
    const markup =
      'SSRMismatchTest server text' +
      '<br />' +
      'SSRMismatchTest default text' +
      '<div data-ssr-mismatch-padding-after="1"></div>' +
      '<div data-ssr-mismatch-padding-after="2"></div>' +
      '<div data-ssr-mismatch-padding-after="3"></div>' +
      '<div data-ssr-mismatch-padding-after="4"></div>' +
      '<div data-ssr-mismatch-padding-after="5"></div>';
    div.innerHTML = markup;

    expect(() =>
      ReactDOM.hydrate([<br key={1} />, 'SSRMismatchTest default text'], div),
    ).toWarnDev(
      "Warning: Did not expect server HTML to contain the text node {'SSRMismatchTest server text'} in <div>.\n\n" +
        '  <div data-ssr-mismatch-test-hydrate-root="">\n' +
        "-   {'SSRMismatchTest server text'}\n" +
        '    <br />\n' +
        "    {'SSRMismatchTest default text'}\n" +
        '    <div data-ssr-mismatch-padding-after="1" />\n' +
        '    <div data-ssr-mismatch-padding-after="2" />\n' +
        '    <div data-ssr-mismatch-padding-after="3" />\n' +
        '    <div data-ssr-mismatch-padding-after="4" />\n' +
        '    <div data-ssr-mismatch-padding-after="5" />\n' +
        '  </div>\n\n' +
        '    in br (at **)',
    );
  });

  it('should warn when hydrate removes a text node within an element (removal diff)', () => {
    // See fixtures/ssr: ssr-warnForDeletedHydratableInstance-didNotHydrateInstance-text

    const div = document.createElement('div');
    const markup = ReactDOMServer.renderToString(
      <div>
        SSRMismatchTest server text
        <span />
        <div data-ssr-mismatch-padding-after="1" />
        <div data-ssr-mismatch-padding-after="2" />
        <div data-ssr-mismatch-padding-after="3" />
        <div data-ssr-mismatch-padding-after="4" />
        <div data-ssr-mismatch-padding-after="5" />
      </div>,
    );
    div.innerHTML = markup;

    expect(() =>
      ReactDOM.hydrate(
        <div>
          <span />
        </div>,
        div,
      ),
    ).toWarnDev(
      "Warning: Did not expect server HTML to contain the text node {'SSRMismatchTest server text'} in <div>.\n\n" +
        '  <div data-reactroot="">\n' +
        "-   {'SSRMismatchTest server text'}\n" +
        '    <span />\n' +
        '    <div data-ssr-mismatch-padding-after="1" />\n' +
        '    <div data-ssr-mismatch-padding-after="2" />\n' +
        '    <div data-ssr-mismatch-padding-after="3" />\n' +
        '    <div data-ssr-mismatch-padding-after="4" />\n' +
        '    <div data-ssr-mismatch-padding-after="5" />\n' +
        '  </div>\n\n' +
        '    in span (at **)\n' +
        '    in div (at **)',
    );
  });

  it('should warn when hydrate replaces a text node by an element within a root container (replacement diff)', () => {
    // See fixtures/ssr: ssr-warnForInsertedHydratedInstance-didNotFindHydratableContainerInstance

    const div = document.createElement('div');
    const markup = 'SSRMismatchTest default text';
    div.innerHTML = markup;

    expect(() =>
      ReactDOM.hydrate(<span>SSRMismatchTest default text</span>, div),
    ).toWarnDev(
      'Warning: Expected server HTML to contain a matching <span> in <div>.\n\n' +
        '  <div>\n' +
        "-   {'SSRMismatchTest default text'}\n" +
        '+   <span>SSRMismatchTest default text</span>\n' +
        '  </div>\n\n' +
        '    in span (at **)',
    );
  });

  it('should warn when hydrate replaces an element by a text node within a root container (replacement diff)', () => {
    // See fixtures/ssr: ssr-warnForInsertedHydratedTextInstance-didNotFindHydratableContainerTextInstance

    const div = document.createElement('div');
    const markup = ReactDOMServer.renderToString(
      <span>SSRMismatchTest default text</span>,
    );
    div.innerHTML = markup;

    expect(() =>
      ReactDOM.hydrate('SSRMismatchTest default text', div),
    ).toWarnDev(
      'Warning: Expected server HTML to contain a matching text node' +
        " for {'SSRMismatchTest default text'} in <div>.\n\n" +
        '  <div>\n' +
        '-   <span data-reactroot="">SSRMismatchTest default text</span>\n' +
        "+   {'SSRMismatchTest default text'}\n" +
        '  </div>\n',
      // Without the component stack here because it's empty: rendering a text node directly into the root node.
      {withoutStack: true},
    );
  });

  it('should warn when hydrate replaces an element by a different element (replacement diff)', () => {
    // See fixtures/ssr: ssr-warnForInsertedHydratedInstance-didNotFindHydratableInstance

    const div = document.createElement('div');
    const markup = ReactDOMServer.renderToString(
      <div>
        <em>SSRMismatchTest default text</em>
      </div>,
    );
    div.innerHTML = markup;

    expect(() =>
      ReactDOM.hydrate(
        <div>
          <p>SSRMismatchTest default text</p>
        </div>,
        div,
      ),
    ).toWarnDev(
      'Warning: Expected server HTML to contain a matching <p> in <div>.\n\n' +
        '  <div data-reactroot="">\n' +
        '-   <em>SSRMismatchTest default text</em>\n' +
        '+   <p>SSRMismatchTest default text</p>\n' +
        '  </div>\n\n' +
        '    in p (at **)\n' +
        '    in div (at **)',
    );
  });

  it('should warn when hydrate inserts a text node after matching elements (insertion diff)', () => {
    // See fixtures/ssr: ssr-hydrationWarningHostInstanceIndex-didNotFindHydratableInstance-insertion

    class TestPaddingBeforeInnerInnerComponent extends React.Component {
      render() {
        return <div data-ssr-mismatch-padding-before="6" />;
      }
    }
    class TestPaddingBeforeInnerComponent extends React.Component {
      render() {
        return (
          <React.Fragment>
            <div data-ssr-mismatch-padding-before="4" />
            <div data-ssr-mismatch-padding-before="5" />
            <TestPaddingBeforeInnerInnerComponent />
          </React.Fragment>
        );
      }
    }
    class TestPaddingBeforeComponent extends React.Component {
      render() {
        return (
          <React.Fragment>
            <div data-ssr-mismatch-padding-before="2" />
            <div data-ssr-mismatch-padding-before="3" />
            <TestPaddingBeforeInnerComponent />
            <div data-ssr-mismatch-padding-before="7" />
            <div data-ssr-mismatch-padding-before="8" />
            <div data-ssr-mismatch-padding-before="9" />
          </React.Fragment>
        );
      }
    }

    const div = document.createElement('div');
    const markup = ReactDOMServer.renderToString(
      <div>
        <div data-ssr-mismatch-padding-before="1" />
        <TestPaddingBeforeComponent />
        <div data-ssr-mismatch-padding-before="10" />
        <div data-ssr-mismatch-padding-before="11" />
        <div data-ssr-mismatch-padding-before="12" />
      </div>,
    );
    div.innerHTML = markup;

    expect(() =>
      ReactDOM.hydrate(
        <div>
          <div data-ssr-mismatch-padding-before="1" />
          <TestPaddingBeforeComponent />
          <div data-ssr-mismatch-padding-before="10" />
          <div data-ssr-mismatch-padding-before="11" />
          <div data-ssr-mismatch-padding-before="12" />
          SSRMismatchTest client text
        </div>,
        div,
      ),
    ).toWarnDev(
      'Warning: Expected server HTML to contain a matching text node' +
        " for {'SSRMismatchTest client text'} in <div>.\n\n" +
        '  <div data-reactroot="">\n' +
        '    <div data-ssr-mismatch-padding-before="1" />\n' +
        '    <div data-ssr-mismatch-padding-before="2" />\n' +
        '    <div data-ssr-mismatch-padding-before="3" />\n' +
        '    <div data-ssr-mismatch-padding-before="4" />\n' +
        '    <div data-ssr-mismatch-padding-before="5" />\n' +
        '    <div data-ssr-mismatch-padding-before="6" />\n' +
        '    <div data-ssr-mismatch-padding-before="7" />\n' +
        '    <div data-ssr-mismatch-padding-before="8" />\n' +
        '    <div data-ssr-mismatch-padding-before="9" />\n' +
        '    <div data-ssr-mismatch-padding-before="10" />\n' +
        '    <div data-ssr-mismatch-padding-before="11" />\n' +
        '    <div data-ssr-mismatch-padding-before="12" />\n' +
        "+   {'SSRMismatchTest client text'}\n" +
        '  </div>\n\n' +
        '    in div (at **)',
    );
  });

  it('should warn when hydrate inserts an element after a comment node (insertion diff)', () => {
    const div = document.createElement('div');
    div.innerHTML = '<div><!-- a comment --></div>';

    expect(() =>
      ReactDOM.hydrate(
        <div>
          <span />
        </div>,
        div,
      ),
    ).toWarnDev(
      'Warning: Expected server HTML to contain a matching <span> in <div>.\n\n' +
        '  <div>\n' +
        '    <!-- a comment -->\n' +
        '+   <span />\n' +
        '  </div>\n\n' +
        '    in span (at **)\n' +
        '    in div (at **)',
    );
  });

  it('should warn when hydrate replaces an element after a comment node (replacement diff)', () => {
    const div = document.createElement('div');
    div.innerHTML = '<div><!-- a comment <-- --&gt; > --><div></div></div>';

    expect(() =>
      ReactDOM.hydrate(
        <div>
          <span />
          <div />
        </div>,
        div,
      ),
    ).toWarnDev(
      'Warning: Expected server HTML to contain a matching <span> in <div>.\n\n' +
        '  <div>\n' +
        '    <!-- a comment <-- --&gt; > -->\n' +
        '-   <div />\n' +
        '+   <span />\n' +
        '  </div>\n\n' +
        '    in span (at **)\n' +
        '    in div (at **)',
    );
  });

  it('should warn when hydrate inserts an element after a non-typical node (insertion diff)', () => {
    // A non-typical node is a node that is not typically seen in the DOM: not an element, text, or comment.
    // This is an artificial test case to check how we print non-typical nodes if they somehow end up in the DOM.
    const xml = document.createElement('xml');
    xml.appendChild(
      document.createProcessingInstruction(
        'dom-processing-instruction',
        'content > ',
      ),
    );

    expect(() => ReactDOM.hydrate(<div />, xml)).toWarnDev(
      'Warning: Expected server HTML to contain a matching <div> in <xml>.\n\n' +
        '  <xml>\n' +
        '    <?dom-processing-instruction content &gt; ?>\n' +
        '+   <div />\n' +
        '  </xml>\n\n' +
        '    in div (at **)',
    );
  });

  it('should warn with special characters in the JSX string output', () => {
    const div = document.createElement('div');
    const markup = ReactDOMServer.renderToString(
      <div>{'SSRMismatchTest special characters: \'"\t\n'}</div>,
    );
    div.innerHTML = markup;

    expect(() =>
      ReactDOM.hydrate(
        <div>
          <span />
          {'SSRMismatchTest special characters: \'"\t\n'}
        </div>,
        div,
      ),
    ).toWarnDev(
      // TODO: Currently, the special characters in the JSX string output are not escaped, the output looks invalid.
      'Warning: Expected server HTML to contain a matching <span> in <div>.\n\n' +
        '  <div data-reactroot="">\n' +
        "-   {'SSRMismatchTest special characters: '\"\t\n'}\n" +
        '+   <span />\n' +
        '  </div>\n\n' +
        '    in span (at **)\n' +
        '    in div (at **)',
    );
  });

  it('should warn with special characters in the HTML tag output', () => {
    const div = document.createElement('div');
    const markup = ReactDOMServer.renderToString(
      <div data-ssr-mismatch-attribute-with-special-characters={'"'}>
        <div>{'SSRMismatchTest text'}</div>
      </div>,
    );
    div.innerHTML = markup;

    expect(() =>
      ReactDOM.hydrate(
        <div data-ssr-mismatch-attribute-with-special-characters={'"'}>
          <span>&nbsp;&mdash; &lt;div&gt;</span>
          <div>{'SSRMismatchTest text'}</div>
        </div>,
        div,
      ),
    ).toWarnDev(
      // TODO: Currently, the special characters in the HTML string output are not escaped, the output looks invalid.
      'Warning: Expected server HTML to contain a matching <span> in <div>.\n\n' +
        `  <div data-ssr-mismatch-attribute-with-special-characters={'"'} data-reactroot="">\n` +
        '-   <div>SSRMismatchTest text</div>\n' +
        "+   <span>{' — <div>'}</span>\n" +
        '  </div>\n\n' +
        '    in span (at **)\n' +
        '    in div (at **)',
    );
  });

  it('should warn if render removes React-rendered children', () => {
    const container = document.createElement('container');

    class Component extends React.Component {
      render() {
        return (
          <div>
            <div />
          </div>
        );
      }
    }

    ReactDOM.render(<Component />, container);

    // Test that blasting away children throws a warning
    const rootNode = container.firstChild;

    expect(() => ReactDOM.render(<span />, rootNode)).toWarnDev(
      'Warning: render(...): Replacing React-rendered children with a new ' +
        'root component. If you intended to update the children of this node, ' +
        'you should instead have the existing children update their state and ' +
        'render the new components instead of calling ReactDOM.render.',
      {withoutStack: true},
    );
  });

  it('should warn if the unmounted node was rendered by another copy of React', () => {
    jest.resetModules();
    const ReactDOMOther = require('react-dom');
    const container = document.createElement('div');

    class Component extends React.Component {
      render() {
        return (
          <div>
            <div />
          </div>
        );
      }
    }

    ReactDOM.render(<Component />, container);
    // Make sure ReactDOM and ReactDOMOther are different copies
    expect(ReactDOM).not.toEqual(ReactDOMOther);

    expect(() => ReactDOMOther.unmountComponentAtNode(container)).toWarnDev(
      "Warning: unmountComponentAtNode(): The node you're attempting to unmount " +
        'was rendered by another copy of React.',
      {withoutStack: true},
    );

    // Don't throw a warning if the correct React copy unmounts the node
    ReactDOM.unmountComponentAtNode(container);
  });

  it('passes the correct callback context', () => {
    const container = document.createElement('div');
    let calls = 0;

    ReactDOM.render(<div />, container, function() {
      expect(this.nodeName).toBe('DIV');
      calls++;
    });

    // Update, no type change
    ReactDOM.render(<div />, container, function() {
      expect(this.nodeName).toBe('DIV');
      calls++;
    });

    // Update, type change
    ReactDOM.render(<span />, container, function() {
      expect(this.nodeName).toBe('SPAN');
      calls++;
    });

    // Batched update, no type change
    ReactDOM.unstable_batchedUpdates(function() {
      ReactDOM.render(<span />, container, function() {
        expect(this.nodeName).toBe('SPAN');
        calls++;
      });
    });

    // Batched update, type change
    ReactDOM.unstable_batchedUpdates(function() {
      ReactDOM.render(<article />, container, function() {
        expect(this.nodeName).toBe('ARTICLE');
        calls++;
      });
    });

    expect(calls).toBe(5);
  });

  it('initial mount is sync inside batchedUpdates, but task work is deferred until the end of the batch', () => {
    const container1 = document.createElement('div');
    const container2 = document.createElement('div');

    class Foo extends React.Component {
      state = {active: false};
      componentDidMount() {
        this.setState({active: true});
      }
      render() {
        return (
          <div>{this.props.children + (this.state.active ? '!' : '')}</div>
        );
      }
    }

    ReactDOM.render(<div>1</div>, container1);

    ReactDOM.unstable_batchedUpdates(() => {
      // Update. Does not flush yet.
      ReactDOM.render(<div>2</div>, container1);
      expect(container1.textContent).toEqual('1');

      // Initial mount on another root. Should flush immediately.
      ReactDOM.render(<Foo>a</Foo>, container2);
      // The update did not flush yet.
      expect(container1.textContent).toEqual('1');
      // The initial mount flushed, but not the update scheduled in cDM.
      expect(container2.textContent).toEqual('a');
    });
    // All updates have flushed.
    expect(container1.textContent).toEqual('2');
    expect(container2.textContent).toEqual('a!');
  });

  describe('mount point is a comment node', () => {
    let containerDiv;
    let mountPoint;

    beforeEach(() => {
      containerDiv = document.createElement('div');
      containerDiv.innerHTML = 'A<!-- react-mount-point-unstable -->B';
      mountPoint = containerDiv.childNodes[1];
      expect(mountPoint.nodeType).toBe(COMMENT_NODE);
    });

    it('renders at a comment node', () => {
      function Char(props) {
        return props.children;
      }
      function list(chars) {
        return chars.split('').map(c => <Char key={c}>{c}</Char>);
      }

      ReactDOM.render(list('aeiou'), mountPoint);
      expect(containerDiv.innerHTML).toBe(
        'Aaeiou<!-- react-mount-point-unstable -->B',
      );

      ReactDOM.render(list('yea'), mountPoint);
      expect(containerDiv.innerHTML).toBe(
        'Ayea<!-- react-mount-point-unstable -->B',
      );

      ReactDOM.render(list(''), mountPoint);
      expect(containerDiv.innerHTML).toBe(
        'A<!-- react-mount-point-unstable -->B',
      );
    });
  });
});
