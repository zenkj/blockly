/**
 * @license
 * Copyright 2014 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Generating CPP for variable blocks.
 */
'use strict';

goog.module('Blockly.CPP.variables');

const CPP = goog.require('Blockly.CPP');
const {NameType} = goog.require('Blockly.Names');


CPP['variables_get'] = function(block) {
  // Variable getter.
  const code =
      CPP.nameDB_.getName(block.getFieldValue('VAR'), NameType.VARIABLE);
  return [code, CPP.ORDER_ATOMIC];
};

CPP['variables_set'] = function(block) {
  // Variable setter.
  const argument0 =
      CPP.valueToCode(block, 'VALUE', CPP.ORDER_ASSIGNMENT) || '0';
  const varName =
      CPP.nameDB_.getName(block.getFieldValue('VAR'), NameType.VARIABLE);
  return varName + ' = ' + argument0 + ';\n';
};
