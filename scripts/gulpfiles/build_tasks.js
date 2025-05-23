/**
 * @license
 * Copyright 2018 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Gulp script to build Blockly for Node & NPM.
 */

var gulp = require('gulp');
gulp.replace = require('gulp-replace');
gulp.rename = require('gulp-rename');
gulp.sourcemaps = require('gulp-sourcemaps');

var path = require('path');
var fs = require('fs');
var execSync = require('child_process').execSync;
var through2 = require('through2');

const clangFormat = require('clang-format');
const clangFormatter = require('gulp-clang-format');
var closureCompiler = require('google-closure-compiler').gulp();
var closureDeps = require('google-closure-deps');
var argv = require('yargs').argv;
var rimraf = require('rimraf');

var {BUILD_DIR, TSC_OUTPUT_DIR} = require('./config');
var {getPackageJson} = require('./helper_tasks');

////////////////////////////////////////////////////////////
//                        Build                           //
////////////////////////////////////////////////////////////

/**
 * Suffix to add to compiled output files.
 */
const COMPILED_SUFFIX = '_compressed';

/**
 * Checked-in file to cache output of closure-calculate-chunks, to
 * allow for testing on node.js v12 (or earlier) which is not
 * compatible with closure-calculate-chunks.
 */
const CHUNK_CACHE_FILE = 'scripts/gulpfiles/chunks.json'

/**
 * Name of an object to be used as a shared "global" namespace by
 * chunks generated by the Closure Compiler with the
 * --rename_prefix_namespace option (see
 * https://github.com/google/closure-compiler/wiki/Chunk-output-for-dynamic-loading#using-global_namespace-as-the-chunk-output-type
 * for more information.)  The wrapper for the first chunk will create
 * an object with this name and save it; wrappers for other chunks
 * will ensure that the same object is available with this same name.
 * The --rename_prefix_namespace option will then cause the compiled
 * chunks to create properties on this object instead of creating
 * "global" (really chunk-local) variables.  This allows later chunks
 * to depend upon modules from earlier chunks.
 *
 * It can be any value that doesn't clash with a global variable or
 * wrapper argument, but as it will appear many times in the compiled
 * output it is preferable that it be short.
 */
const NAMESPACE_VARIABLE = '$';

/**
 * Property that will be used to store the value of the namespace
 * object on each chunk's exported object.  This is so that dependent
 * chunks can retrieve the namespace object and thereby access modules
 * defined in the parent chunk (or it's parent, etc.).  This should be
 * chosen so as to not collide with any exported name.
 */
const NAMESPACE_PROPERTY = '__namespace__';

/**
 * A list of chunks.  Order matters: later chunks can depend on
 * earlier ones, but not vice-versa.  All chunks are assumed to depend
 * on the first chunk.  Properties are as follows:
 *
 * - .name: the name of the chunk.  Used to label it when describing
 *   it to Closure Compiler and forms the prefix of filename the chunk
 *   will be written to.
 * - .entry: the source .js file which is the entrypoint for the
 *   chunk.
 * - .reexport: if running in a browser, save the chunk's exports
 *   object at this location in the global namespace.
 *
 * The function getChunkOptions will, after running
 * closure-calculate-chunks, update each chunk to add the following
 * properties:
 *
 * - .parent: the parent chunk of the given chunk.  Typically
 *    chunks[0], except for chunk[0].parent which will be null.
 * - .wrapper: the generated chunk wrapper.
 *
 * Output files will be named <chunk.name><COMPILED_SUFFIX>.js.
 */
const chunks = [
  {
    name: 'blockly',
    entry: 'core/blockly.js',
    reexport: 'Blockly',
  },
  {
    name: 'blocks',
    entry: 'blocks/blocks.js',
    reexport: 'Blockly.libraryBlocks',
  },
  {
    name: 'javascript',
    entry: 'generators/javascript/all.js',
    reexport: 'Blockly.JavaScript',
  },
  {
    name: 'python',
    entry: 'generators/python/all.js',
    reexport: 'Blockly.Python',
  },
  {
    name: 'php',
    entry: 'generators/php/all.js',
    reexport: 'Blockly.PHP',
  },
  {
    name: 'lua',
    entry: 'generators/lua/all.js',
    reexport: 'Blockly.Lua',
  },
  {
    name: 'dart',
    entry: 'generators/dart/all.js',
    reexport: 'Blockly.Dart',
  },
  {
    name: 'cpp',
    entry: 'generators/cpp/all.js',
    reexport: 'Blockly.CPP',
  }	
];

const licenseRegex = `\\/\\*\\*
 \\* @license
 \\* (Copyright \\d+ (Google LLC|Massachusetts Institute of Technology))
( \\* All rights reserved.
)? \\* SPDX-License-Identifier: Apache-2.0
 \\*\\/`;

/**
 * Helper method for stripping the Google's and MIT's Apache Licenses.
 */
function stripApacheLicense() {
  // Strip out Google's and MIT's Apache licences.
  // Closure Compiler preserves dozens of Apache licences in the Blockly code.
  // Remove these if they belong to Google or MIT.
  // MIT's permission to do this is logged in Blockly issue #2412.
  return gulp.replace(new RegExp(licenseRegex, "g"), '\n\n\n\n');
  // Replace with the same number of lines so that source-maps are not affected.
}

/**
 * Closure compiler diagnostic groups we want to be treated as errors.
 * These are effected when the --debug or --strict flags are passed.
 * For a full list of closure compiler groups, consult the output of
 * google-closure-compiler --help or look in the source  here:
 * https://github.com/google/closure-compiler/blob/master/src/com/google/javascript/jscomp/DiagnosticGroups.java#L117
 * 
 * The list in JSCOMP_ERROR contains all the diagnostic groups we know
 * about, but some are commented out if we don't want them, and may
 * appear in JSCOMP_WARNING or JSCOMP_OFF instead.  Items not
 * appearing on any list will default to setting provided by the
 * compiler, which may vary depending on compilation level.
 */
var JSCOMP_ERROR = [
  // 'accessControls',  // Deprecated; means same as visibility.
  'checkPrototypalTypes',
  'checkRegExp',
  'checkTypes',
  'checkVars',
  'conformanceViolations',
  'const',
  'constantProperty',
  'deprecated',
  'deprecatedAnnotations',
  'duplicateMessage',
  'es5Strict',
  'externsValidation',
  'extraRequire',  // Undocumented but valid.
  'functionParams',
  'globalThis',
  'invalidCasts',
  'misplacedTypeAnnotation',
  // 'missingOverride',  // There are many of these, which should be fixed.
  'missingPolyfill',
  'missingProperties',
  'missingProvide',
  'missingRequire',
  'missingReturn',
  // 'missingSourcesWarnings',  // Group of several other options.
  'moduleLoad',
  'msgDescriptions',
  'nonStandardJsDocs',
  // 'partialAlias',  // Don't want this to be an error yet; only warning.
  // 'polymer',  // Not applicable.
  // 'reportUnknownTypes',  // VERY verbose.
  // 'strictCheckTypes',  // Use --strict to enable.
  // 'strictMissingProperties',  // Part of strictCheckTypes.
  'strictModuleChecks',  // Undocumented but valid.
  'strictModuleDepCheck',
  // 'strictPrimitiveOperators',  // Part of strictCheckTypes.
  'suspiciousCode',
  'typeInvalidation',
  'undefinedVars',
  'underscore',
  'unknownDefines',
  'unusedLocalVariables',
  'unusedPrivateMembers',
  'uselessCode',
  'untranspilableFeatures',
  // 'visibility',  // Disabled; see note in JSCOMP_OFF.
];

/**
 * Closure compiler diagnostic groups we want to be treated as warnings.
 * These are effected when the --debug or --strict flags are passed.
 */
var JSCOMP_WARNING = [
];

/**
 * Closure compiler diagnostic groups we want to be ignored.
 * These suppressions are always effected by default.
 */
var JSCOMP_OFF = [
  /* In order to transition to ES modules, modules will need to import
   * one another by relative paths. This means that the existing
   * practice of moving all source files into the same directory for
   * compilation (see docs for flattenCorePaths) would break
   * imports. Not flattening files in this way breaks our usage
   * of @package however; files were flattened so that all Blockly
   * source files are in the same directory and can use @package to
   * mark methods that are only allowed for use by Blockly, while
   * still allowing access between e.g. core/events/* and
   * core/utils/*. We were downgrading access control violations
   * (including @private) to warnings, but this ends up being so
   * spammy that it makes the compiler output nearly useless.
   * 
   * Once ES module migration is complete, they will be re-enabled and
   * an alternative to @package will be established.
   */
  'visibility',
];

/**
 * This task updates tests/deps.js, used by blockly_uncompressed.js
 * when loading Blockly in uncompiled mode.
 *
 * Also updates tests/deps.mocha.js, used by the mocha test suite.
 */
function buildDeps(done) {
  const closurePath = argv.closureLibrary ?
      'node_modules/google-closure-library/closure/goog' :
      'closure/goog';

  const coreDir = argv.compileTs ? path.join(TSC_OUTPUT_DIR, 'core') : 'core';
  const roots = [
    closurePath,
    coreDir,
    'blocks',
    'generators',
  ];

  const testRoots = [
    ...roots,
    'tests/mocha'
  ];

  const args = roots.map(root => `--root '${root}' `).join('');
  execSync(`closure-make-deps ${args} > tests/deps.js`, {stdio: 'inherit'});

  // Use grep to filter out the entries that are already in deps.js.
  const testArgs = testRoots.map(root => `--root '${root}' `).join('');
  execSync(`closure-make-deps ${testArgs} | grep 'tests/mocha'` +
      ' > tests/deps.mocha.js', {stdio: 'inherit'});
  done();
};

/**
 * This task regenrates msg/json/en.js and msg/json/qqq.js from
 * msg/messages.js.
 */
function generateLangfiles(done) {
  // Run js_to_json.py
  const jsToJsonCmd = `python3 scripts/i18n/js_to_json.py \
      --input_file ${path.join('msg', 'messages.js')} \
      --output_dir ${path.join('msg', 'json')} \
      --quiet`;
  execSync(jsToJsonCmd, { stdio: 'inherit' });

  console.log(`
Regenerated several flies in msg/json/.  Now run

    git diff msg/json/*.json

and check that operation has not overwritten any modifications made to
hints, etc. by the TranslateWiki volunteers.  If it has, backport
their changes to msg/messages.js and re-run 'npm run generate:langfiles'.

Once you are satisfied that any new hints have been backported you may
go ahead and commit the changes, but note that the generate script
will have removed the translator credits - be careful not to commit
this removal!
`);

  done();
};

/**
 * This task builds Blockly's lang files.
 *     msg/*.js
 */
function buildLangfiles(done) {
  // Create output directory.
  const outputDir = path.join(BUILD_DIR, 'msg', 'js');
  fs.mkdirSync(outputDir, {recursive: true});

  // Run create_messages.py.
  let json_files = fs.readdirSync(path.join('msg', 'json'));
  json_files = json_files.filter(file => file.endsWith('json') &&
      !(new RegExp(/(keys|synonyms|qqq|constants)\.json$/).test(file)));
  json_files = json_files.map(file => path.join('msg', 'json', file));
  const createMessagesCmd = `python3 ./scripts/i18n/create_messages.py \
  --source_lang_file ${path.join('msg', 'json', 'en.json')} \
  --source_synonym_file ${path.join('msg', 'json', 'synonyms.json')} \
  --source_constants_file ${path.join('msg', 'json', 'constants.json')} \
  --key_file ${path.join('msg', 'json', 'keys.json')} \
  --output_dir ${outputDir} \
  --quiet ${json_files.join(' ')}`;
  execSync(createMessagesCmd, {stdio: 'inherit'});

  done();
};

/**
 * A helper method to return an closure compiler chunk wrapper that
 * wraps the compiler output for the given chunk in a Universal Module
 * Definition.
 */
function chunkWrapper(chunk) {
  // Each chunk can have only a single dependency, which is its parent
  // chunk.  It is used only to retrieve the namespace object, which
  // is saved on to the exports object for the chunk so that any child
  // chunk(s) can obtain it.

  // JavaScript expressions for the amd, cjs and browser dependencies.
  let amdDepsExpr = '';
  let cjsDepsExpr = '';
  let browserDepsExpr = '';
  // Arguments for the factory function.
  let factoryArgs = '';
  // Expression to get or create the namespace object.
  let namespaceExpr = `{}`;

  if (chunk.parent) {
    const parentFilename =
        JSON.stringify(`./${chunk.parent.name}${COMPILED_SUFFIX}.js`);
    amdDepsExpr = parentFilename;
    cjsDepsExpr = `require(${parentFilename})`;
    browserDepsExpr = `root.${chunk.parent.reexport}`;
    factoryArgs = '__parent__';
    namespaceExpr = `${factoryArgs}.${NAMESPACE_PROPERTY}`;
  }    

  // Expression that evaluates the the value of the exports object for
  // the specified chunk.  For now we guess the name that is created
  // by the module's goog.module.delcareLegacyNamespace call based on
  // chunk.reexport.
  const exportsExpression = `${NAMESPACE_VARIABLE}.${chunk.reexport}`;
  // In near future we might try to guess the internally-generated
  // name for the ES module's exports object.
  // const exportsExpression =
  //     'module$' + chunk.entry.replace(/\.m?js$/, '').replace(/\//g, '$');
  

  // Note that when loading in a browser the base of the exported path
  // (e.g. Blockly.blocks.all - see issue #5932) might not exist
  // before factory has been executed, so calling factory() and
  // assigning the result are done in separate statements to ensure
  // they are sequenced correctly.
  return `// Do not edit this file; automatically generated.

/* eslint-disable */
;(function(root, factory) {
  if (typeof define === 'function' && define.amd) { // AMD
    define([${amdDepsExpr}], factory);
  } else if (typeof exports === 'object') { // Node.js
    module.exports = factory(${cjsDepsExpr});
  } else { // Browser
    var factoryExports = factory(${browserDepsExpr});
    root.${chunk.reexport} = factoryExports;
  }
}(this, function(${factoryArgs}) {
var ${NAMESPACE_VARIABLE}=${namespaceExpr};
%output%
${exportsExpression}.${NAMESPACE_PROPERTY}=${NAMESPACE_VARIABLE};
return ${exportsExpression};
}));
`;
};

/**
 * Get chunking options to pass to Closure Compiler by using
 * closure-calculate-chunks (hereafter "ccc") to generate them based
 * on the deps.js file (which must be up to date!).
 *
 * The generated options are modified to use the original chunk names
 * given in chunks instead of the entry-point based names used by ccc.
 *
 * @return {{chunk: !Array<string>, js: !Array<string>}} The chunking
 *     information, in the same form as emitted by
 *     closure-calculate-chunks.
 *
 * TODO(cpcallen): maybeAddClosureLibrary?  Or maybe remove base.js?
 */
function getChunkOptions() {
  if (argv.compileTs) {
    chunks[0].entry = path.join(TSC_OUTPUT_DIR, chunks[0].entry);
  }
  const cccArgs = [
    '--closure-library-base-js-path ./closure/goog/base_minimal.js',
    '--deps-file ./tests/deps.js',
    ...(chunks.map(chunk => `--entrypoint '${chunk.entry}'`)),
  ];
  const cccCommand = `closure-calculate-chunks ${cccArgs.join(' ')}`;

  // Because (as of 2021-11-25) closure-calculate-chunks v3.0.2
  // requries node.js v14 or later, we save the output of cccCommand
  // in a checked-in .json file, so we can use the contents of that
  // file when building on older versions of node.
  //
  // When this is no longer necessary the following section can be
  // replaced with:
  //
  // const rawOptions = JSON.parse(execSync(cccCommand));
  const nodeMajorVersion = /v(\d+)\./.exec(process.version)[1];
  let rawOptions;
  if (nodeMajorVersion >= 14) {
    rawOptions = JSON.parse(String(execSync(cccCommand)));
    // Replace absolute paths with relative ones, so they will be
    // valid on other machines.  Only needed because we're saving this
    // output to use later on another machine.
    rawOptions.js = rawOptions.js.map(p => p.replace(process.cwd(), '.'));
    fs.writeFileSync(CHUNK_CACHE_FILE,
                     JSON.stringify(rawOptions, null, 2) + '\n');
  } else {
    console.log(`Warning: using pre-computed chunks from ${CHUNK_CACHE_FILE}`);
    rawOptions = JSON.parse(String(fs.readFileSync(CHUNK_CACHE_FILE)));
  }

  // rawOptions should now be of the form:
  //
  // {
  //   chunk: [
  //     'blockly:258',
  //     'all:10:blockly',
  //     'all1:11:blockly',
  //     'all2:11:blockly',
  //     /* ... remaining handful of chunks */
  //   ],
  //   js: [
  //     './core/serialization/workspaces.js',
  //     './core/serialization/variables.js',
  //     /* ... remaining several hundred files */
  //   ],
  // }
  //
  // This is designed to be passed directly as-is as the options
  // object to the Closure Compiler node API, but we want to replace
  // the unhelpful entry-point based chunk names (let's call these
  // "nicknames") with the ones from chunks.  Unforutnately there's no
  // guarnatee they will be in the same order that the entry points
  // were supplied in (though it happens to work out that way if no
  // chunk depends on any chunk but the first), so we look for
  // one of the entrypoints amongst the files in each chunk.
  const chunkByNickname = Object.create(null);
  const jsFiles = rawOptions.js.slice();  // Will be modified via .splice!
  const chunkList = rawOptions.chunk.map((element) => {
    const [nickname, numJsFiles, parentNick] = element.split(':');

    // Get array of files for just this chunk.
    const chunkFiles = jsFiles.splice(0, numJsFiles);

    // Figure out which chunk this is by looking for one of the
    // known chunk entrypoints in chunkFiles.  N.B.: O(n*m).  :-(
    const chunk = chunks.find(
        chunk => chunkFiles.find(f => f.endsWith('/' + chunk.entry)));
    if (!chunk) throw new Error('Unable to identify chunk');

    // Replace nicknames with the names we chose.
    chunkByNickname[nickname] = chunk;
    if (!parentNick) {  // Chunk has no parent.
      chunk.parent = null;
      return `${chunk.name}:${numJsFiles}`;
    }
    chunk.parent = chunkByNickname[parentNick];
    return `${chunk.name}:${numJsFiles}:${chunk.parent.name}`;
  });

  // Generate a chunk wrapper for each chunk.
  for (const chunk of chunks) {
    chunk.wrapper = chunkWrapper(chunk);
  }
  const chunkWrappers = chunks.map(chunk => `${chunk.name}:${chunk.wrapper}`);

  return {chunk: chunkList, js: rawOptions.js, chunk_wrapper: chunkWrappers};
}

/**
 * RegExp that globally matches path.sep (i.e., "/" or "\").
 */
const pathSepRegExp = new RegExp(path.sep.replace(/\\/, '\\\\'), "g");

/**
 * Modify the supplied gulp.rename path object to relax @package
 * restrictions in core/.
 *
 * Background: subdirectories of core/ are used to group similar files
 * together but are not intended to limit access to names
 * marked @package; instead, that annotation is intended to mean only
 * that the annotated name not part of the public API.
 *
 * To make @package behave less strictly in core/, this function can
 * be used to as a gulp.rename filter, modifying the path object to
 * flatten all files in core/** so that they're in the same directory,
 * while ensuring that files with the same base name don't conflict.
 *
 * @param {{dirname: string, basename: string, extname: string}}
 *     pathObject The path argument supplied by gulp.rename to its
 *     callback.  Modified in place.
 */
function flattenCorePaths(pathObject) {
  const dirs = pathObject.dirname.split(path.sep);
  const coreIndex = argv.compileTs ? 2 : 0;
  if (dirs[coreIndex] === 'core') {
    pathObject.dirname = path.join(...dirs.slice(0, coreIndex + 1));
    pathObject.basename =
        dirs.slice(coreIndex + 1).concat(pathObject.basename).join('-slash-');
  }
}

/**
 * Undo the effects of flattenCorePaths on a single path string.
 * @param string pathString The flattened path.
 * @return string  The path after unflattening.
 */
function unflattenCorePaths(pathString) {
  return pathString.replace(/-slash-/g, path.sep);
}

/**
 * Helper method for calling the Closure compiler, establishing
 * default options (that can be overridden by the caller).
 * @param {*} options Caller-supplied options that will override the
 *     defaultOptions.
 */
function compile(options) {
  const defaultOptions = {
    compilation_level: 'SIMPLE_OPTIMIZATIONS',
    warning_level: argv.verbose ? 'VERBOSE' : 'DEFAULT',
    language_in: 'ECMASCRIPT_2020',
    language_out: 'ECMASCRIPT5_STRICT',
    jscomp_off: [...JSCOMP_OFF],
    rewrite_polyfills: true,
    hide_warnings_for: 'node_modules',
    define: ['COMPILED=true'],
  };
  if (argv.debug || argv.strict) {
    defaultOptions.jscomp_error = [...JSCOMP_ERROR];
    defaultOptions.jscomp_warning = [...JSCOMP_WARNING];
    if (argv.strict) {
      defaultOptions.jscomp_error.push('strictCheckTypes');
    }
  }
  // Extra options for Closure Compiler gulp plugin.
  const platform = ['native', 'java', 'javascript'];

  return closureCompiler({...defaultOptions, ...options}, {platform});
}

/**
 * This task compiles the core library, blocks and generators, creating
 * blockly_compressed.js, blocks_compressed.js, etc.
 *
 * The deps.js file must be up-to-date.
 */
function buildCompiled() {
  // Get chunking.
  const chunkOptions = getChunkOptions();
  // Closure Compiler options.
  const packageJson = getPackageJson();  // For version number.
  const options = {
    define: 'Blockly.VERSION="' + packageJson.version + '"',
    chunk: chunkOptions.chunk,
    chunk_wrapper: chunkOptions.chunk_wrapper,
    rename_prefix_namespace: NAMESPACE_VARIABLE,
    // Don't supply the list of source files in chunkOptions.js as an
    // option to Closure Compiler; instead feed them as input via gulp.src.
  };

  // Fire up compilation pipline.
  return gulp.src(chunkOptions.js, {base: './'})
      .pipe(stripApacheLicense())
      .pipe(gulp.sourcemaps.init())
      // .pipe(gulp.rename(flattenCorePaths))
      .pipe(compile(options))
      .pipe(gulp.rename({suffix: COMPILED_SUFFIX}))
      // .pipe(gulp.sourcemaps.mapSources(unflattenCorePaths))
      .pipe(
          gulp.sourcemaps.write('.', {includeContent: false, sourceRoot: './'}))
      .pipe(gulp.dest(BUILD_DIR));
};

/**
 * This task builds Blockly core, blocks and generators together and uses
 * closure compiler's ADVANCED_COMPILATION mode.
 */
function buildAdvancedCompilationTest() {
  const coreSrcs = argv.compileTs ?
      TSC_OUTPUT_DIR + '/core/**/*.js' : 'core/**/*.js';
  const srcs = [
    'closure/goog/base_minimal.js',
    coreSrcs,
    'blocks/**/*.js',
    'generators/**/*.js',
    'tests/compile/main.js',
    'tests/compile/test_blocks.js',
  ];

  // Closure Compiler options.
  const options = {
    dependency_mode: 'PRUNE',
    compilation_level: 'ADVANCED_OPTIMIZATIONS',
    entry_point: './tests/compile/main.js',
    js_output_file: 'main_compressed.js',
  };
  return gulp.src(srcs, {base: './'})
      .pipe(stripApacheLicense())
      .pipe(gulp.sourcemaps.init())
      // .pipe(gulp.rename(flattenCorePaths))
      .pipe(compile(options))
      // .pipe(gulp.sourcemaps.mapSources(unflattenCorePaths))
      .pipe(gulp.sourcemaps.write(
          '.', {includeContent: false, sourceRoot: '../../'}))
      .pipe(gulp.dest('./tests/compile/'));
}

/**
 * This task builds all of Blockly:
 *     blockly_compressed.js
 *     blocks_compressed.js
 *     javascript_compressed.js
 *     python_compressed.js
 *     php_compressed.js
 *     lua_compressed.js
 *     dart_compressed.js
 *     blockly_uncompressed.js
 *     msg/json/*.js
 *     test/deps*.js
 */
const build = gulp.parallel(
    gulp.series(buildDeps, buildCompiled),
    buildLangfiles,
    );

/**
 * This task copies built files from BUILD_DIR back to the repository
 * so they can be committed to git.
 */
function checkinBuilt() {
  return gulp.src([
    `${BUILD_DIR}/**.js`,
    `${BUILD_DIR}/**.js.map`,
    `${BUILD_DIR}/**/**.js`,
    `${BUILD_DIR}/**/**.js.map`,
  ]).pipe(gulp.dest('.'));
};

/**
 * This task cleans the build directory (by deleting it).
 */
function cleanBuildDir(done) {
  // Sanity check.
  if (BUILD_DIR === '.' || BUILD_DIR === '/') {
    throw new Error(`Refusing to rm -rf ${BUILD_DIR}`);
  }
  rimraf(BUILD_DIR, done);
}

/**
 * Runs clang format on all files in the core directory.
 */
function format() {
  return gulp.src(['core/**/*.js', 'blocks/**/*.js'], {base: '.'})
      .pipe(clangFormatter.format('file', clangFormat))
      .pipe(gulp.dest('.'));
};

function buildTypescript(done) {
  execSync('npx tsc', {stdio: 'inherit'});
  done();
}

module.exports = {
  build: build,
  deps: buildDeps,
  generateLangfiles: generateLangfiles,
  langfiles: buildLangfiles,
  compiled: buildCompiled,
  format: format,
  checkinBuilt: checkinBuilt,
  cleanBuildDir: cleanBuildDir,
  advancedCompilationTest: buildAdvancedCompilationTest,
  buildTypescript: buildTypescript
}
