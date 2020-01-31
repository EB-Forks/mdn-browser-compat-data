#!/usr/bin/env node
/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

// ESM dependencies:
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import {
  testBrowsers,
  testLinks,
  testPrefix,
  testRealValues,
  testStyle,
  testSchema,
  testVersions,
  testConsistency,
  testDescriptions,
} from './linter/index.js';
import { IS_CI } from './utils.js';
import testCompareFeatures from './test-compare-features.js';
import testMigrations from './test-migrations.js';
import testFormat from './test-format.js';

// CommonJS dependencies:
import ora from 'ora';
import yargs from 'yargs';
import chalk from 'chalk';

// CommonJS 'globals':
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {Map<string, string>} */
const filesWithErrors = new Map();

const argv = yargs
  .alias('version', 'v')
  .usage('$0 [[--] files...]', false, yargs => {
    return yargs.positional('files...', {
      description: 'The files to lint',
      type: 'string',
    });
  })
  .help()
  .alias('help', 'h')
  .alias('help', '?')
  .parse(process.argv.slice(2));

/**
 * @param {string[]} files
 * @return {boolean}
 */
function load(...files) {
  return files.reduce((prevHasErrors, file) => {
    if (file.indexOf(__dirname) !== 0) {
      file = path.resolve(__dirname, '..', file);
    }

    if (!fs.existsSync(file)) {
      return prevHasErrors; // Ignore non-existent files
    }

    if (fs.statSync(file).isFile()) {
      let fileHasErrors = false;

      if (path.extname(file) === '.json') {
        let hasSyntaxErrors = false,
          hasSchemaErrors = false,
          hasStyleErrors = false,
          hasLinkErrors = false,
          hasBrowserErrors = false,
          hasVersionErrors = false,
          hasConsistencyErrors = false,
          hasRealValueErrors = false,
          hasPrefixErrors = false,
          hasDescriptionsErrors = false;
        const relativeFilePath = path.relative(process.cwd(), file);

        const spinner = ora({
          stream: process.stdout,
          text: relativeFilePath,
        });

        if (!IS_CI) {
          // Continuous integration environments don't allow overwriting
          // previous lines using VT escape sequences, which is how
          // the spinner animation is implemented.
          spinner.start();
        }

        const console_error = console.error;
        console.error = (...args) => {
          spinner['stream'] = process.stderr;
          spinner.fail(chalk.red.bold(relativeFilePath));
          console.error = console_error;
          console.error(...args);
        };

        try {
          if (file.indexOf('browsers' + path.sep) !== -1) {
            hasSchemaErrors = testSchema(
              file,
              './../../schemas/browsers.schema.json',
            );
            hasLinkErrors = testLinks(file);
          } else {
            hasSchemaErrors = testSchema(file);
            hasStyleErrors = testStyle(file);
            hasLinkErrors = testLinks(file);
            hasBrowserErrors = testBrowsers(file);
            hasVersionErrors = testVersions(file);
            hasConsistencyErrors = testConsistency(file);
            hasRealValueErrors = testRealValues(file);
            hasPrefixErrors = testPrefix(file);
            hasDescriptionsErrors = testDescriptions(file);
          }
        } catch (e) {
          hasSyntaxErrors = true;
          console.error(e);
        }

        fileHasErrors = [
          hasSyntaxErrors,
          hasSchemaErrors,
          hasStyleErrors,
          hasLinkErrors,
          hasBrowserErrors,
          hasVersionErrors,
          hasConsistencyErrors,
          hasRealValueErrors,
          hasPrefixErrors,
          hasDescriptionsErrors,
        ].some(x => !!x);

        if (fileHasErrors) {
          filesWithErrors.set(relativeFilePath, file);
        } else {
          console.error = console_error;
          spinner.succeed();
        }
      }

      return prevHasErrors || fileHasErrors;
    }

    const subFiles = fs.readdirSync(file).map(subfile => {
      return path.join(file, subfile);
    });

    return load(...subFiles) || prevHasErrors;
  }, false);
}

/** @type {boolean} */
var hasErrors = argv.files
  ? load.apply(undefined, argv.files)
  : load(
      'api',
      'browsers',
      'css',
      'html',
      'http',
      'svg',
      'javascript',
      'mathml',
      'webdriver',
      'webextensions',
      'xpath',
      'xslt',
    );
hasErrors = testCompareFeatures() || hasErrors;
hasErrors = testMigrations() || hasErrors;
hasErrors = testFormat() || hasErrors;

if (hasErrors) {
  console.warn('');
  console.warn(
    chalk`{red Problems in {bold ${filesWithErrors.size}} ${
      filesWithErrors.size === 1 ? 'file' : 'files'
    }:}`,
  );
  for (const [fileName, file] of filesWithErrors) {
    console.warn(chalk`{red.bold ✖ ${fileName}}`);
    try {
      if (file.indexOf('browsers' + path.sep) !== -1) {
        testSchema(file, './../../schemas/browsers.schema.json');
        testLinks(file);
      } else {
        testSchema(file);
        testStyle(file);
        testLinks(file);
        testVersions(file);
        testRealValues(file);
        testBrowsers(file);
        testConsistency(file);
        testPrefix(file);
        testDescriptions(file);
      }
    } catch (e) {
      console.error(e);
    }
  }
  process.exit(1);
}
