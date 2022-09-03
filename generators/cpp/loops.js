/**
 * @license
 * Copyright 2014 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Generating CPP for loop blocks.
 */
'use strict';

goog.module('Blockly.CPP.loops');

const CPP = goog.require('Blockly.CPP');
const stringUtils = goog.require('Blockly.utils.string');
const {NameType} = goog.require('Blockly.Names');


CPP['controls_repeat_ext'] = function(block) {
  let repeats;
  // Repeat n times.
  if (block.getField('TIMES')) {
    // Internal number.
    repeats = String(Number(block.getFieldValue('TIMES')));
  } else {
    // External number.
    repeats = CPP.valueToCode(block, 'TIMES', CPP.ORDER_ASSIGNMENT) || '0';
  }
  let branch = CPP.statementToCode(block, 'DO');
  branch = CPP.addLoopTrap(branch, block);
  let code = '';
  const loopVar = CPP.nameDB_.getDistinctName('count', NameType.VARIABLE);
  let endVar = repeats;
  if (!repeats.match(/^\w+$/) && !stringUtils.isNumber(repeats)) {
    endVar = CPP.nameDB_.getDistinctName('repeat_end', NameType.VARIABLE);
    code += 'var ' + endVar + ' = ' + repeats + ';\n';
  }
  code += 'for (int ' + loopVar + ' = 0; ' + loopVar + ' < ' + endVar + '; ' +
      loopVar + '++) {\n' + branch + '}\n';
  return code;
};

CPP['controls_repeat'] = CPP['controls_repeat_ext'];

CPP['controls_whileUntil'] = function(block) {
  // Do while/until loop.
  const until = block.getFieldValue('MODE') === 'UNTIL';
  let argument0 =
      CPP.valueToCode(
          block, 'BOOL', until ? CPP.ORDER_UNARY_PREFIX : CPP.ORDER_NONE) ||
      'false';
  let branch = CPP.statementToCode(block, 'DO');
  branch = CPP.addLoopTrap(branch, block);
  if (until) {
    argument0 = '!' + argument0;
  }
  return 'while (' + argument0 + ') {\n' + branch + '}\n';
};

CPP['controls_for'] = function(block) {
  // For loop.
  const variable0 =
      CPP.nameDB_.getName(block.getFieldValue('VAR'), NameType.VARIABLE);
  const argument0 =
      CPP.valueToCode(block, 'FROM', CPP.ORDER_ASSIGNMENT) || '0';
  const argument1 = CPP.valueToCode(block, 'TO', CPP.ORDER_ASSIGNMENT) || '0';
  const increment = CPP.valueToCode(block, 'BY', CPP.ORDER_ASSIGNMENT) || '1';
  let branch = CPP.statementToCode(block, 'DO');
  branch = CPP.addLoopTrap(branch, block);
  let code;
  if (stringUtils.isNumber(argument0) && stringUtils.isNumber(argument1) &&
      stringUtils.isNumber(increment)) {
    // All arguments are simple numbers.
    const up = Number(argument0) <= Number(argument1);
    code = 'for (' + variable0 + ' = ' + argument0 + '; ' + variable0 +
        (up ? ' <= ' : ' >= ') + argument1 + '; ' + variable0;
    const step = Math.abs(Number(increment));
    if (step === 1) {
      code += up ? '++' : '--';
    } else {
      code += (up ? ' += ' : ' -= ') + step;
    }
    code += ') {\n' + branch + '}\n';
  } else {
    code = '';
    // Cache non-trivial values to variables to prevent repeated look-ups.
    let startVar = argument0;
    if (!argument0.match(/^\w+$/) && !stringUtils.isNumber(argument0)) {
      startVar =
          CPP.nameDB_.getDistinctName(variable0 + '_start', NameType.VARIABLE);
      code += 'var ' + startVar + ' = ' + argument0 + ';\n';
    }
    let endVar = argument1;
    if (!argument1.match(/^\w+$/) && !stringUtils.isNumber(argument1)) {
      endVar =
          CPP.nameDB_.getDistinctName(variable0 + '_end', NameType.VARIABLE);
      code += 'var ' + endVar + ' = ' + argument1 + ';\n';
    }
    // Determine loop direction at start, in case one of the bounds
    // changes during loop execution.
    const incVar =
        CPP.nameDB_.getDistinctName(variable0 + '_inc', NameType.VARIABLE);
    code += 'num ' + incVar + ' = ';
    if (stringUtils.isNumber(increment)) {
      code += Math.abs(increment) + ';\n';
    } else {
      code += '(' + increment + ').abs();\n';
    }
    code += 'if (' + startVar + ' > ' + endVar + ') {\n';
    code += CPP.INDENT + incVar + ' = -' + incVar + ';\n';
    code += '}\n';
    code += 'for (' + variable0 + ' = ' + startVar + '; ' + incVar +
        ' >= 0 ? ' + variable0 + ' <= ' + endVar + ' : ' + variable0 +
        ' >= ' + endVar + '; ' + variable0 + ' += ' + incVar + ') {\n' +
        branch + '}\n';
  }
  return code;
};

CPP['controls_forEach'] = function(block) {
  // For each loop.
  const variable0 =
      CPP.nameDB_.getName(block.getFieldValue('VAR'), NameType.VARIABLE);
  const argument0 =
      CPP.valueToCode(block, 'LIST', CPP.ORDER_ASSIGNMENT) || '[]';
  let branch = CPP.statementToCode(block, 'DO');
  branch = CPP.addLoopTrap(branch, block);
  const code =
      'for (var ' + variable0 + ' in ' + argument0 + ') {\n' + branch + '}\n';
  return code;
};

CPP['controls_flow_statements'] = function(block) {
  // Flow statements: continue, break.
  let xfix = '';
  if (CPP.STATEMENT_PREFIX) {
    // Automatic prefix insertion is switched off for this block.  Add manually.
    xfix += CPP.injectId(CPP.STATEMENT_PREFIX, block);
  }
  if (CPP.STATEMENT_SUFFIX) {
    // Inject any statement suffix here since the regular one at the end
    // will not get executed if the break/continue is triggered.
    xfix += CPP.injectId(CPP.STATEMENT_SUFFIX, block);
  }
  if (CPP.STATEMENT_PREFIX) {
    const loop = block.getSurroundLoop();
    if (loop && !loop.suppressPrefixSuffix) {
      // Inject loop's statement prefix here since the regular one at the end
      // of the loop will not get executed if 'continue' is triggered.
      // In the case of 'break', a prefix is needed due to the loop's suffix.
      xfix += CPP.injectId(CPP.STATEMENT_PREFIX, loop);
    }
  }
  switch (block.getFieldValue('FLOW')) {
    case 'BREAK':
      return xfix + 'break;\n';
    case 'CONTINUE':
      return xfix + 'continue;\n';
  }
  throw Error('Unknown flow statement.');
};
