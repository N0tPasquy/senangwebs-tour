import resolve from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';
import json from '@rollup/plugin-json';
import postcss from 'rollup-plugin-postcss';
import postcssImport from 'postcss-import';

const production = !process.env.ROLLUP_WATCH;

// Suppress "this is undefined" warning from UMD libraries and CSS extraction conflicts
const onwarn = (warning, warn) => {
  if (warning.code === 'THIS_IS_UNDEFINED' || warning.code === 'FILE_NAME_CONFLICT') return;
  warn(warning);
};

export default [
  // Viewer Library - ESM build (aframe stays external; consumers provide it via peer dependency)
  {
    input: 'src/index.js',
    external: ['aframe'],
    output: {
      file: 'dist/swt.esm.js',
      format: 'esm',
      sourcemap: true
    },
    plugins: [
      resolve()
    ],
    onwarn
  },
  // Viewer Library - CommonJS/UMD build for Node consumers (.cjs so Node
  // treats it as CommonJS even though the package is "type": "module")
  {
    input: 'src/index.js',
    output: {
      file: 'dist/swt.cjs',
      format: 'umd',
      name: 'SWT',
      sourcemap: true
    },
    plugins: [
      resolve()
    ],
    onwarn
  },
  // Viewer Library - Development browser build
  {
    input: 'src/index.js',
    output: {
      file: 'dist/swt.js',
      format: 'umd',
      name: 'SWT',
      sourcemap: true
    },
    plugins: [
      resolve()
    ],
    onwarn
  },
  // Viewer Library - Production build (minified)
  {
    input: 'src/index.js',
    output: {
      file: 'dist/swt.min.js',
      format: 'umd',
      name: 'SWT',
      sourcemap: false
    },
    plugins: [
      resolve(),
      terser()
    ],
    onwarn
  },
  // Editor - JavaScript bundle (development)
  {
    input: 'src/editor/editor-entry.js',
    output: {
      file: 'dist/swt-editor.js',
      format: 'iife',
      name: 'SWTEditor',
      sourcemap: true
    },
    plugins: [
      resolve(),
      json()
    ]
  },
  // Editor - JavaScript bundle (minified)
  {
    input: 'src/editor/editor-entry.js',
    output: {
      file: 'dist/swt-editor.min.js',
      format: 'iife',
      name: 'SWTEditor',
      sourcemap: false
    },
    plugins: [
      resolve(),
      json(),
      terser()
    ]
  },
  // Editor - CSS bundle
  {
    input: 'src/editor/editor-entry.css',
    output: {
      file: 'dist/swt-editor.css'
    },
    plugins: [
      postcss({
        extract: 'swt-editor.css',
        minimize: false,
        sourceMap: true,
        plugins: [postcssImport()]
      })
    ],
    onwarn
  },
  // Editor - CSS bundle (minified)
  {
    input: 'src/editor/editor-entry.css',
    output: {
      file: 'dist/swt-editor.min.css'
    },
    plugins: [
      postcss({
        extract: 'swt-editor.min.css',
        minimize: true,
        sourceMap: false,
        plugins: [postcssImport()]
      })
    ],
    onwarn
  }
];
