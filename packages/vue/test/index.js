/**
 * @typedef {import('mdx/types.js').MDXModule} MDXModule
 * @typedef {import('vue').Component} AnyComponent
 */

import assert from 'node:assert/strict'
import {test} from 'node:test'
import * as babel from '@babel/core'
import {compile} from '@mdx-js/mdx'
import {run} from '@mdx-js/mdx/lib/run.js'
import * as vue from 'vue'
import {useMDXComponents, MDXProvider} from '../index.js'

// Note: a regular import would be nice but that completely messes up the JSX types.
const name = '@vue/server-renderer'
/** @type {{default: {renderToString: (node: unknown) => string}}} */
const {default: serverRenderer} = await import(name)

/**
 * @param {string} value
 * @returns {Promise<MDXModule>}
 */
async function evaluate(value) {
  const file = await compile(value, {
    providerImportSource: '#',
    jsx: true,
    outputFormat: 'function-body'
  })
  const result = await babel.transformAsync(String(file), {
    parserOpts: {allowReturnOutsideFunction: true},
    plugins: ['@vue/babel-plugin-jsx']
  })
  if (!result || !result.code) throw new Error('Whoops!')
  const body = result.code.replace(
    /import {(.+)} from "vue"/,
    (_, /** @type {string} */ $1) =>
      'const {' + $1.replaceAll(' as ', ': ') + '} = arguments[0].vue'
  )
  return run(body, {vue, useMDXComponents})
}

/**
 * @param {AnyComponent} root
 * @param {Record<string, unknown> | null | undefined} [rootProps]
 * @returns {Promise<string>}
 */
async function vueToString(root, rootProps) {
  const result = await serverRenderer.renderToString(
    vue.createSSRApp(root, rootProps)
  )
  // Remove SSR comments used to hydrate.
  return result.replaceAll(/<!--[[\]]-->/g, '')
}

test('should evaluate MDX code', async () => {
  const {default: Content} = await evaluate('# hi')

  assert.equal(await vueToString(Content), '<h1>hi</h1>')
})

test('should evaluate some more complex MDX code (text, inline)', async () => {
  const {default: Content} = await evaluate(
    '*a* **b** `c` <abbr title="Markdown + JSX">MDX</abbr>'
  )

  assert.equal(
    await vueToString(Content),
    '<p><em>a</em> <strong>b</strong> <code>c</code> <abbr title="Markdown + JSX">MDX</abbr></p>'
  )
})

test('should support Vue components defined in MDX', async () => {
  const {default: Content} = await evaluate(
    'export const A = {render() { return <b>!</b> }}\n\n<A />'
  )

  assert.equal(await vueToString(Content), '<b>!</b>')
})

test('should support passing `components`', async () => {
  const {default: Content} = await evaluate('# hi')

  assert.equal(
    await vueToString(Content, {components: {h1: 'h2'}}),
    '<h2>hi</h2>'
  )
})

test('should support passing `components`', async () => {
  const {default: Content} = await evaluate('# hi')

  assert.equal(
    await vueToString(Content, {components: {h1: 'h2'}}),
    '<h2>hi</h2>'
  )
})

test('should support `MDXProvider`', async () => {
  const {default: Content} = await evaluate('# hi')

  assert.equal(
    await vueToString({
      data() {
        return {components: {h1: 'h2'}}
      },
      template:
        '<MDXProvider v-bind:components="components"><Content /></MDXProvider>',
      components: {MDXProvider, Content}
    }),
    '<h2>hi</h2>'
  )
})

test('should support the MDX provider w/o components', async () => {
  const {default: Content} = await evaluate('# hi')

  assert.equal(
    await vueToString({
      template: '<MDXProvider><Content /></MDXProvider>',
      components: {MDXProvider, Content}
    }),
    '<h1>hi</h1>'
  )
})

test('should support the MDX provider w/o content', async () => {
  assert.equal(
    await vueToString({
      template: '<MDXProvider />',
      components: {MDXProvider}
    }),
    ''
  )
})
