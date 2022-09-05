/**
 * @license
 * Copyright 2014 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Generating CPP for procedure blocks.
 */
'use strict';

goog.module('Blockly.CPP.procedures');

const CPP = goog.require('Blockly.CPP');
const {NameType} = goog.require('Blockly.Names');


CPP['procedures_defreturn'] = function(block) {
  // Define a procedure with a return value.
  const funcName =
      CPP.nameDB_.getName(block.getFieldValue('NAME'), NameType.PROCEDURE);
  let xfix1 = '';
  if (CPP.STATEMENT_PREFIX) {
    xfix1 += CPP.injectId(CPP.STATEMENT_PREFIX, block);
  }
  if (CPP.STATEMENT_SUFFIX) {
    xfix1 += CPP.injectId(CPP.STATEMENT_SUFFIX, block);
  }
  if (xfix1) {
    xfix1 = CPP.prefixLines(xfix1, CPP.INDENT);
  }
  let loopTrap = '';
  if (CPP.INFINITE_LOOP_TRAP) {
    loopTrap = CPP.prefixLines(
        CPP.injectId(CPP.INFINITE_LOOP_TRAP, block), CPP.INDENT);
  }
  const branch = CPP.statementToCode(block, 'STACK');
  let returnValue = CPP.valueToCode(block, 'RETURN', CPP.ORDER_NONE) || '';
  let xfix2 = '';
  if (branch && returnValue) {
    // After executing the function body, revisit this block for the return.
    xfix2 = xfix1;
  }
  if (returnValue) {
    returnValue = CPP.INDENT + 'return ' + returnValue + ';\n';
  }
  const returnType = returnValue ? 'int' : 'void';
  const args = [];
  const variables = block.getVars();
  for (let i = 0; i < variables.length; i++) {
    args[i] = CPP.nameDB_.getName(variables[i], NameType.VARIABLE);
  }
  let code = returnType + ' ' + funcName + '(' + args.join(', ') + ') {\n' +
      xfix1 + loopTrap + branch + xfix2 + returnValue + '}';
  code = CPP.scrub_(block, code);
  // Add % so as not to collide with helper functions in definitions list.
  CPP.definitions_['%' + funcName] = code;
  return null;
};

// Defining a procedure without a return value uses the same generator as
// a procedure with a return value.
CPP['procedures_defnoreturn'] = CPP['procedures_defreturn'];

CPP['procedures_callreturn'] = function(block) {
  // Call a procedure with a return value.
  const funcName =
      CPP.nameDB_.getName(block.getFieldValue('NAME'), NameType.PROCEDURE);
  const args = [];
  const variables = block.getVars();
  for (let i = 0; i < variables.length; i++) {
    args[i] = CPP.valueToCode(block, 'ARG' + i, CPP.ORDER_NONE) || 'null';
  }
  let code = funcName + '(' + args.join(', ') + ')';
  return [code, CPP.ORDER_UNARY_POSTFIX];
};

CPP['procedures_callnoreturn'] = function(block) {
  // Call a procedure with no return value.
  // Generated code is for a function call as a statement is the same as a
  // function call as a value, with the addition of line ending.
  const tuple = CPP['procedures_callreturn'](block);
  return tuple[0] + ';\n';
};

CPP['procedures_ifreturn'] = function(block) {
  // Conditionally return value from a procedure.
  const condition =
      CPP.valueToCode(block, 'CONDITION', CPP.ORDER_NONE) || 'false';
  let code = 'if (' + condition + ') {\n';
  if (CPP.STATEMENT_SUFFIX) {
    // Inject any statement suffix here since the regular one at the end
    // will not get executed if the return is triggered.
    code += CPP.prefixLines(
        CPP.injectId(CPP.STATEMENT_SUFFIX, block), CPP.INDENT);
  }
  if (block.hasReturnValue_) {
    const value = CPP.valueToCode(block, 'VALUE', CPP.ORDER_NONE) || 'null';
    code += CPP.INDENT + 'return ' + value + ';\n';
  } else {
    code += CPP.INDENT + 'return;\n';
  }
  code += '}\n';
  return code;
};
