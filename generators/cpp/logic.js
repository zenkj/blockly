/**
 * @license
 * Copyright 2014 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Generating CPP for logic blocks.
 */
'use strict';

goog.module('Blockly.CPP.logic');

const CPP = goog.require('Blockly.CPP');


CPP['controls_if'] = function(block) {
  // If/elseif/else condition.
  let n = 0;
  let code = '', branchCode, conditionCode;
  if (CPP.STATEMENT_PREFIX) {
    // Automatic prefix insertion is switched off for this block.  Add manually.
    code += CPP.injectId(CPP.STATEMENT_PREFIX, block);
  }
  do {
    conditionCode =
        CPP.valueToCode(block, 'IF' + n, CPP.ORDER_NONE) || 'false';
    branchCode = CPP.statementToCode(block, 'DO' + n);
    if (CPP.STATEMENT_SUFFIX) {
      branchCode =
          CPP.prefixLines(
              CPP.injectId(CPP.STATEMENT_SUFFIX, block), CPP.INDENT) +
          branchCode;
    }
    code += (n > 0 ? 'else ' : '') + 'if (' + conditionCode + ') {\n' +
        branchCode + '}';
    n++;
  } while (block.getInput('IF' + n));

  if (block.getInput('ELSE') || CPP.STATEMENT_SUFFIX) {
    branchCode = CPP.statementToCode(block, 'ELSE');
    if (CPP.STATEMENT_SUFFIX) {
      branchCode =
          CPP.prefixLines(
              CPP.injectId(CPP.STATEMENT_SUFFIX, block), CPP.INDENT) +
          branchCode;
    }
    code += ' else {\n' + branchCode + '}';
  }
  return code + '\n';
};

CPP['controls_ifelse'] = CPP['controls_if'];

CPP['logic_compare'] = function(block) {
  // Comparison operator.
  const OPERATORS =
      {'EQ': '==', 'NEQ': '!=', 'LT': '<', 'LTE': '<=', 'GT': '>', 'GTE': '>='};
  const operator = OPERATORS[block.getFieldValue('OP')];
  const order = (operator === '==' || operator === '!=') ?
      CPP.ORDER_EQUALITY :
      CPP.ORDER_RELATIONAL;
  const argument0 = CPP.valueToCode(block, 'A', order) || '0';
  const argument1 = CPP.valueToCode(block, 'B', order) || '0';
  const code = argument0 + ' ' + operator + ' ' + argument1;
  return [code, order];
};

CPP['logic_operation'] = function(block) {
  // Operations 'and', 'or'.
  const operator = (block.getFieldValue('OP') === 'AND') ? '&&' : '||';
  const order =
      (operator === '&&') ? CPP.ORDER_LOGICAL_AND : CPP.ORDER_LOGICAL_OR;
  let argument0 = CPP.valueToCode(block, 'A', order);
  let argument1 = CPP.valueToCode(block, 'B', order);
  if (!argument0 && !argument1) {
    // If there are no arguments, then the return value is false.
    argument0 = 'false';
    argument1 = 'false';
  } else {
    // Single missing arguments have no effect on the return value.
    const defaultArgument = (operator === '&&') ? 'true' : 'false';
    if (!argument0) {
      argument0 = defaultArgument;
    }
    if (!argument1) {
      argument1 = defaultArgument;
    }
  }
  const code = argument0 + ' ' + operator + ' ' + argument1;
  return [code, order];
};

CPP['logic_negate'] = function(block) {
  // Negation.
  const order = CPP.ORDER_UNARY_PREFIX;
  const argument0 = CPP.valueToCode(block, 'BOOL', order) || 'true';
  const code = '!' + argument0;
  return [code, order];
};

CPP['logic_boolean'] = function(block) {
  // Boolean values true and false.
  const code = (block.getFieldValue('BOOL') === 'TRUE') ? 'true' : 'false';
  return [code, CPP.ORDER_ATOMIC];
};

CPP['logic_null'] = function(block) {
  // Null data type.
  return ['NULL', CPP.ORDER_ATOMIC];
};

CPP['logic_ternary'] = function(block) {
  // Ternary operator.
  const value_if =
      CPP.valueToCode(block, 'IF', CPP.ORDER_CONDITIONAL) || 'false';
  const value_then =
      CPP.valueToCode(block, 'THEN', CPP.ORDER_CONDITIONAL) || 'NULL';
  const value_else =
      CPP.valueToCode(block, 'ELSE', CPP.ORDER_CONDITIONAL) || 'NULL';
  const code = value_if + ' ? ' + value_then + ' : ' + value_else;
  return [code, CPP.ORDER_CONDITIONAL];
};
