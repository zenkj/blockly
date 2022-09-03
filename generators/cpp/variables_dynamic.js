/**
 * @license
 * Copyright 2018 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Generating CPP for dynamic variable blocks.
 */
'use strict';

goog.module('Blockly.CPP.variablesDynamic');

const CPP = goog.require('Blockly.CPP');
/** @suppress {extraRequire} */
goog.require('Blockly.CPP.variables');


// CPP is dynamically typed.
CPP['variables_get_dynamic'] = CPP['variables_get'];
CPP['variables_set_dynamic'] = CPP['variables_set'];
