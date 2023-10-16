/**
 * @typedef {import('mdx/types.js').MDXContent} MDXContent
 * @typedef {import('preact').FunctionComponent<unknown>} PreactComponent
 */

import assert from 'node:assert/strict'
import {promises as fs} from 'node:fs'
import {test} from 'node:test'
import {promisify} from 'node:util'
import {fileURLToPath} from 'node:url'
import webpack from 'webpack'
import React from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
import {h} from 'preact'
import {render} from 'preact-render-to-string'

test('@mdx-js/loader', async () => {
  // Setup.
  const base = new URL('.', import.meta.url)

  await fs.writeFile(new URL('webpack.mdx', base), '# Hello, {<Message />')

  // Errors.
  const failedResult = await promisify(webpack)({
    // @ts-expect-error To do: webpack types miss support for `context`.
    context: fileURLToPath(base),
    entry: './webpack.mdx',
    mode: 'none',
    module: {
      rules: [
        {
          test: /\.mdx$/,
          use: [fileURLToPath(new URL('../index.cjs', import.meta.url))]
        }
      ]
    },
    output: {
      path: fileURLToPath(base),
      filename: 'react.cjs',
      libraryTarget: 'commonjs'
    }
  })

  const error = failedResult?.toJson()?.errors?.[0]

  assert.ok(error)
  assert.equal(
    error.message,
    `Module build failed (from ../index.cjs):
webpack.mdx:1:22: Unexpected end of file in expression, expected a corresponding closing brace for \`{\``,
    'received expected error message'
  )

  await fs.writeFile(
    new URL('webpack.mdx', base),
    'export const Message = () => <>World!</>\n\n# Hello, <Message />'
  )

  // React.
  const reactBuild = await promisify(webpack)({
    // @ts-expect-error To do: webpack types miss support for `context`.
    context: fileURLToPath(base),
    entry: './webpack.mdx',
    mode: 'none',
    module: {
      rules: [
        {
          test: /\.mdx$/,
          use: [fileURLToPath(new URL('../index.cjs', import.meta.url))]
        }
      ]
    },
    output: {
      path: fileURLToPath(base),
      filename: 'react.cjs',
      libraryTarget: 'commonjs'
    }
  })

  assert.ok(!reactBuild?.hasErrors())

  // One for ESM loading CJS, one for webpack.
  const modReact = /** @type {{default: {default: MDXContent}}} */ (
    // @ts-ignore file is dynamically generated
    await import('./react.cjs')
  )

  assert.equal(
    renderToStaticMarkup(React.createElement(modReact.default.default)),
    '<h1>Hello, World!</h1>',
    'should compile (react)'
  )

  const reactOutput = await fs.readFile(new URL('react.cjs', base), 'utf8')
  assert.doesNotMatch(
    reactOutput,
    /react_jsx_dev_runtime__WEBPACK_IMPORTED_MODULE_\d+__\.jsxDEV/,
    'should infer the development option from webpack’s production mode'
  )

  await fs.unlink(new URL('react.cjs', base))

  // Preact and source maps
  const preactBuild = await promisify(webpack)({
    // @ts-expect-error To do: webpack types miss support for `context`.
    context: fileURLToPath(base),
    entry: './webpack.mdx',
    mode: 'development',
    devtool: 'inline-source-map',
    module: {
      rules: [
        {
          test: /\.mdx$/,
          use: [
            {
              loader: fileURLToPath(new URL('../index.cjs', import.meta.url)),
              options: {jsxImportSource: 'preact'}
            }
          ]
        }
      ]
    },
    output: {
      path: fileURLToPath(base),
      filename: 'preact.cjs',
      libraryTarget: 'commonjs'
    }
  })

  assert.ok(!preactBuild?.hasErrors())

  // One for ESM loading CJS, one for webpack.
  const modPreact = /** @type {{default: {default: PreactComponent}}} */ (
    // @ts-ignore file is dynamically generated.
    await import('./preact.cjs')
  )

  assert.equal(
    // To do: fix?
    // @ts-expect-error: preact + react conflict.
    render(h(modPreact.default.default, {})),
    '<h1>Hello, World!</h1>',
    'should compile (preact)'
  )

  const preactOutput = await fs.readFile(new URL('preact.cjs', base), 'utf8')
  assert.match(
    preactOutput,
    /preact_jsx_dev_runtime__WEBPACK_IMPORTED_MODULE_\d+__\.jsxDEV/,
    'should infer the development option from webpack’s development mode'
  )

  assert.match(
    preactOutput,
    /\/\/# sourceMappingURL/,
    'should add a source map if requested'
  )

  await fs.unlink(new URL('preact.cjs', base))

  // Clean.
  await fs.unlink(new URL('webpack.mdx', base))
})
