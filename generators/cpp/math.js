/**
 * @license
 * Copyright 2014 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Generating CPP for math blocks.
 */
'use strict';

goog.module('Blockly.CPP.math');

const CPP = goog.require('Blockly.CPP');
const {NameType} = goog.require('Blockly.Names');


CPP.addReservedWords('Math');

CPP['math_number'] = function(block) {
  // Numeric value.
  let code = Number(block.getFieldValue('NUM'));
  let order;
  if (code === Infinity) {
    code = 'INFINITY';
    order = CPP.ORDER_UNARY_POSTFIX;
  } else if (code === -Infinity) {
    code = '-INFINITY';
    order = CPP.ORDER_UNARY_PREFIX;
  } else {
    // -4.abs() returns -4 in CPP due to strange order of operation choices.
    // -4 is actually an operator and a number.  Reflect this in the order.
    order = code < 0 ? CPP.ORDER_UNARY_PREFIX : CPP.ORDER_ATOMIC;
  }
  return [code, order];
};

CPP['math_arithmetic'] = function(block) {
  // Basic arithmetic operators, and power.
  const OPERATORS = {
    'ADD': [' + ', CPP.ORDER_ADDITIVE],
    'MINUS': [' - ', CPP.ORDER_ADDITIVE],
    'MULTIPLY': [' * ', CPP.ORDER_MULTIPLICATIVE],
    'DIVIDE': [' / ', CPP.ORDER_MULTIPLICATIVE],
    'POWER': [null, CPP.ORDER_NONE],  // Handle power separately.
  };
  const tuple = OPERATORS[block.getFieldValue('OP')];
  const operator = tuple[0];
  const order = tuple[1];
  const argument0 = CPP.valueToCode(block, 'A', order) || '0';
  const argument1 = CPP.valueToCode(block, 'B', order) || '0';
  let code;
  // Power in CPP requires a special case since it has no operator.
  if (!operator) {
    CPP.definitions_['include_cpp_cmath'] = '#include <cmath>';
    code = 'pow(' + argument0 + ', ' + argument1 + ')';
    return [code, CPP.ORDER_UNARY_POSTFIX];
  }
  code = argument0 + operator + argument1;
  return [code, order];
};

CPP['math_single'] = function(block) {
  // Math operators with single operand.
  const operator = block.getFieldValue('OP');
  let code;
  let arg;
  if (operator === 'NEG') {
    // Negation is a special case given its different operator precedence.
    arg = CPP.valueToCode(block, 'NUM', CPP.ORDER_UNARY_PREFIX) || '0';
    if (arg[0] === '-') {
      // --3 is not legal in CPP.
      arg = ' ' + arg;
    }
    code = '-' + arg;
    return [code, CPP.ORDER_UNARY_PREFIX];
  }
  CPP.definitions_['include_cpp_cmath'] = '#include <cmath>';
  if (operator === 'SIN' || operator === 'COS' || operator === 'TAN') {
    arg = CPP.valueToCode(block, 'NUM', CPP.ORDER_MULTIPLICATIVE) || '0';
  } else {
    arg = CPP.valueToCode(block, 'NUM', CPP.ORDER_NONE) || '0';
  }
  // First, handle cases which generate values that don't need parentheses
  // wrapping the code.
  switch (operator) {
    case 'ABS':
      code = 'abs(' + arg + ')';
      break;
    case 'ROOT':
      code = 'sqrt(' + arg + ')';
      break;
    case 'LN':
      code = 'log(' + arg + ')';
      break;
    case 'EXP':
      code = 'exp(' + arg + ')';
      break;
    case 'POW10':
      code = 'pow(10, ' + arg + ')';
      break;
    case 'ROUND':
      code = 'round(' + arg + ')';
      break;
    case 'ROUNDUP':
      code = 'ceil(' + arg + ')';
      break;
    case 'ROUNDDOWN':
      code = 'floor(' + arg + ')';
      break;
    case 'SIN':
      code = 'sin(' + arg + ' / 180 * M_PI)';
      break;
    case 'COS':
      code = 'cos(' + arg + ' / 180 * M_PI)';
      break;
    case 'TAN':
      code = 'tan(' + arg + ' / 180 * M_PI)';
      break;
  }
  if (code) {
    return [code, CPP.ORDER_UNARY_POSTFIX];
  }
  // Second, handle cases which generate values that may need parentheses
  // wrapping the code.
  switch (operator) {
    case 'LOG10':
      code = 'log(' + arg + ') / log(10)';
      break;
    case 'ASIN':
      code = 'asin(' + arg + ') / M_PI * 180';
      break;
    case 'ACOS':
      code = 'acos(' + arg + ') / M_PI * 180';
      break;
    case 'ATAN':
      code = 'atan(' + arg + ') / M_PI * 180';
      break;
    default:
      throw Error('Unknown math operator: ' + operator);
  }
  return [code, CPP.ORDER_MULTIPLICATIVE];
};

CPP['math_constant'] = function(block) {
  // Constants: PI, E, the Golden Ratio, sqrt(2), 1/sqrt(2), INFINITY.
  const CONSTANTS = {
    'PI': ['M_PI', CPP.ORDER_ATOMIC],
    'E': ['M_E', CPP.ORDER_ATOMIC],
    'GOLDEN_RATIO': ['(1 + sqrt(5)) / 2', CPP.ORDER_MULTIPLICATIVE],
    'SQRT2': ['M_SQRT2', CPP.ORDER_ATOMIC],
    'SQRT1_2': ['M_SQRT1_2', CPP.ORDER_ATOMIC],
    'INFINITY': ['INFINITY', CPP.ORDER_ATOMIC],
  };
  CPP.definitions_['include_cpp_cmath'] = '#include <cmath>';
  return CONSTANTS[constant];
};

CPP['math_number_property'] = function(block) {
  // Check if a number is even, odd, prime, whole, positive, or negative
  // or if it is divisible by certain number. Returns true or false.
  const PROPERTIES = {
    'EVEN': [' % 2 == 0', CPP.ORDER_MULTIPLICATIVE, CPP.ORDER_EQUALITY],
    'ODD': [' % 2 == 1', CPP.ORDER_MULTIPLICATIVE, CPP.ORDER_EQUALITY],
    'WHOLE': [' % 1 == 0', CPP.ORDER_MULTIPLICATIVE, CPP.ORDER_EQUALITY],
    'POSITIVE': [' > 0', CPP.ORDER_RELATIONAL, CPP.ORDER_RELATIONAL],
    'NEGATIVE': [' < 0', CPP.ORDER_RELATIONAL, CPP.ORDER_RELATIONAL],
    'DIVISIBLE_BY': [null, CPP.ORDER_MULTIPLICATIVE, CPP.ORDER_EQUALITY],
    'PRIME': [null, CPP.ORDER_NONE, CPP.ORDER_UNARY_POSTFIX],
  };
  const dropdownProperty = block.getFieldValue('PROPERTY');
  const [suffix, inputOrder, outputOrder] = PROPERTIES[dropdownProperty];
  const numberToCheck = CPP.valueToCode(block, 'NUMBER_TO_CHECK',
      inputOrder) || '0';
  let code;
  if (dropdownProperty === 'PRIME') {
    // Prime is a special case as it is not a one-liner test.
    CPP.definitions_['include_cpp_cmath'] = '#include <cmath>';
    const functionName = CPP.provideFunction_('math_isPrime', `
bool ${CPP.FUNCTION_NAME_PLACEHOLDER_}(int n) {
  // https://en.wikipedia.org/wiki/Primality_test#Naive_methods
  if (n == 2 || n == 3) {
    return true;
  }
  // False if n is negative, is 1, or not whole.
  // And false if n is divisible by 2 or 3.
  if (n <= 1 || n % 1 != 0 || n % 2 == 0 || n % 3 == 0) {
    return false;
  }
  // Check all the numbers of form 6k +/- 1, up to sqrt(n).
  for (int x = 6; x <= sqrt(n) + 1; x += 6) {
    if (n % (x - 1) == 0 || n % (x + 1) == 0) {
      return false;
    }
  }
  return true;
}
`);
    code = functionName + '(' + numberToCheck + ')';
  } else if (dropdownProperty === 'DIVISIBLE_BY') {
    const divisor = CPP.valueToCode(block, 'DIVISOR',
        CPP.ORDER_MULTIPLICATIVE) || '0';
    if (divisor === '0') {
      return ['false', CPP.ORDER_ATOMIC];
    }
    code = numberToCheck + ' % ' + divisor + ' == 0';
  } else {
    code = numberToCheck + suffix;
  }
  return [code, outputOrder];
};

CPP['math_change'] = function(block) {
  // Add to a variable in place.
  const argument0 =
      CPP.valueToCode(block, 'DELTA', CPP.ORDER_ADDITIVE) || '0';
  const varName =
      CPP.nameDB_.getName(block.getFieldValue('VAR'), NameType.VARIABLE);
  return varName + ' = (' + varName + ' is num ? ' + varName + ' : 0) + ' +
      argument0 + ';\n';
};

// Rounding functions have a single operand.
CPP['math_round'] = CPP['math_single'];
// Trigonometry functions have a single operand.
CPP['math_trig'] = CPP['math_single'];

CPP['math_on_list'] = function(block) {
  // Math functions for lists.
  const func = block.getFieldValue('OP');
  const list = CPP.valueToCode(block, 'LIST', CPP.ORDER_NONE) || '[]';
  let code;
  switch (func) {
    case 'SUM': {
      CPP.definitions_['include_cpp_numeric'] = '#include <numeric>';
      const functionName = CPP.provideFunction_('math_sum', `
int ${CPP.FUNCTION_NAME_PLACEHOLDER_}(list<int> myList) {
  return accumulate(begin(myList), end(myList), 0);
}
`);
      code = functionName + '(' + list + ')';
      break;
    }
    case 'MIN': {
      const functionName = CPP.provideFunction_('math_min', `
int ${CPP.FUNCTION_NAME_PLACEHOLDER_}(list<int> mylist) {
  int min=0;
  for (list<double>::iterator it=mylist.begin(); it != mylist.end(); ++it){
    if (min >= *it)
      min = *it;
  }
  return min;
}
`);
      code = functionName + '(' + list + ')';
      break;
    }
    case 'MAX': {
      const functionName = CPP.provideFunction_('math_max', `
int ${CPP.FUNCTION_NAME_PLACEHOLDER_}(list<int> mylist) {
  int max=0;
  for (list<double>::iterator it=mylist.begin(); it != mylist.end(); ++it){
    if (max <= *it)
      max = *it;
  }
  return max;
}
`);
      code = functionName + '(' + list + ')';
      break;
    }
    case 'AVERAGE': {
      CPP.definitions_['include_cpp_numeric'] = '#include <numeric>';
      const functionName = CPP.provideFunction_('math_mean', `
int ${CPP.FUNCTION_NAME_PLACEHOLDER_}(list<int> myList) {
  return accumulate(begin(myList), end(myList), 0) / myList.size();
}
`);
      code = functionName + '(' + list + ')';
      break;
    }
    case 'MEDIAN':
    case 'MODE':
    case 'STD_DEV':
    case 'RANDOM':
    default:
      throw Error('Unknown operator: ' + func);
  }
  return [code, CPP.ORDER_UNARY_POSTFIX];
};

CPP['math_modulo'] = function(block) {
  // Remainder computation.
  const argument0 =
      CPP.valueToCode(block, 'DIVIDEND', CPP.ORDER_MULTIPLICATIVE) || '0';
  const argument1 =
      CPP.valueToCode(block, 'DIVISOR', CPP.ORDER_MULTIPLICATIVE) || '0';
  const code = argument0 + ' % ' + argument1;
  return [code, CPP.ORDER_MULTIPLICATIVE];
};

CPP['math_constrain'] = function(block) {
  // Constrain a number between two limits.
  CPP.definitions_['include_cpp_algorithm'] = '#include <algorithm>';
  CPP.definitions_['include_cpp_cmath'] = '#include <cmath>';
  const argument0 = CPP.valueToCode(block, 'VALUE', CPP.ORDER_NONE) || '0';
  const argument1 = CPP.valueToCode(block, 'LOW', CPP.ORDER_NONE) || '0';
  const argument2 =
      CPP.valueToCode(block, 'HIGH', CPP.ORDER_NONE) || 'INFINITY';
  const code = 'min(max(' + argument0 + ', ' + argument1 + '), ' +
      argument2 + ')';
  return [code, CPP.ORDER_UNARY_POSTFIX];
};

CPP['math_random_int'] = function(block) {
  // Random integer between [X] and [Y].
  CPP.definitions_['include_cpp_cstdlib'] = '#include <cstdlib>';
  const argument0 = CPP.valueToCode(block, 'FROM', CPP.ORDER_NONE) || '0';
  const argument1 = CPP.valueToCode(block, 'TO', CPP.ORDER_NONE) || '0';
  const functionName = CPP.provideFunction_('math_random_int', `
int ${CPP.FUNCTION_NAME_PLACEHOLDER_}(int a, int b) {
  if (a > b) {
    // Swap a and b to ensure a is smaller.
    int c = a;
    a = b;
    b = c;
  }
  return a + rand() % (b-a+1);
}
`);
  const code = functionName + '(' + argument0 + ', ' + argument1 + ')';
  return [code, CPP.ORDER_UNARY_POSTFIX];
};

CPP['math_random_float'] = function(block) {
  // Random fraction between 0 and 1.
  CPP.definitions_['include_cpp_cstdlib'] = '#include <cstdlib>';
  return ['rand() % 100 / 100.0', CPP.ORDER_MULTIPLICATIVE];
};

CPP['math_atan2'] = function(block) {
  // Arctangent of point (X, Y) in degrees from -180 to 180.
  CPP.definitions_['include_cpp_cmath'] = '#include <cmath>';
  const argument0 = CPP.valueToCode(block, 'X', CPP.ORDER_NONE) || '0';
  const argument1 = CPP.valueToCode(block, 'Y', CPP.ORDER_NONE) || '0';
  return [
    'atan2(' + argument1 + ', ' + argument0 + ') / M_PI * 180',
    CPP.ORDER_MULTIPLICATIVE
  ];
};
