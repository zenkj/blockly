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
    code = 'double.infinity';
    order = CPP.ORDER_UNARY_POSTFIX;
  } else if (code === -Infinity) {
    code = '-double.infinity';
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
    CPP.definitions_['import_dart_math'] = 'import \'dart:math\' as Math;';
    code = 'Math.pow(' + argument0 + ', ' + argument1 + ')';
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
  CPP.definitions_['import_dart_math'] = 'import \'dart:math\' as Math;';
  if (operator === 'ABS' || operator.substring(0, 5) === 'ROUND') {
    arg = CPP.valueToCode(block, 'NUM', CPP.ORDER_UNARY_POSTFIX) || '0';
  } else if (operator === 'SIN' || operator === 'COS' || operator === 'TAN') {
    arg = CPP.valueToCode(block, 'NUM', CPP.ORDER_MULTIPLICATIVE) || '0';
  } else {
    arg = CPP.valueToCode(block, 'NUM', CPP.ORDER_NONE) || '0';
  }
  // First, handle cases which generate values that don't need parentheses
  // wrapping the code.
  switch (operator) {
    case 'ABS':
      code = arg + '.abs()';
      break;
    case 'ROOT':
      code = 'Math.sqrt(' + arg + ')';
      break;
    case 'LN':
      code = 'Math.log(' + arg + ')';
      break;
    case 'EXP':
      code = 'Math.exp(' + arg + ')';
      break;
    case 'POW10':
      code = 'Math.pow(10,' + arg + ')';
      break;
    case 'ROUND':
      code = arg + '.round()';
      break;
    case 'ROUNDUP':
      code = arg + '.ceil()';
      break;
    case 'ROUNDDOWN':
      code = arg + '.floor()';
      break;
    case 'SIN':
      code = 'Math.sin(' + arg + ' / 180 * Math.pi)';
      break;
    case 'COS':
      code = 'Math.cos(' + arg + ' / 180 * Math.pi)';
      break;
    case 'TAN':
      code = 'Math.tan(' + arg + ' / 180 * Math.pi)';
      break;
  }
  if (code) {
    return [code, CPP.ORDER_UNARY_POSTFIX];
  }
  // Second, handle cases which generate values that may need parentheses
  // wrapping the code.
  switch (operator) {
    case 'LOG10':
      code = 'Math.log(' + arg + ') / Math.log(10)';
      break;
    case 'ASIN':
      code = 'Math.asin(' + arg + ') / Math.pi * 180';
      break;
    case 'ACOS':
      code = 'Math.acos(' + arg + ') / Math.pi * 180';
      break;
    case 'ATAN':
      code = 'Math.atan(' + arg + ') / Math.pi * 180';
      break;
    default:
      throw Error('Unknown math operator: ' + operator);
  }
  return [code, CPP.ORDER_MULTIPLICATIVE];
};

CPP['math_constant'] = function(block) {
  // Constants: PI, E, the Golden Ratio, sqrt(2), 1/sqrt(2), INFINITY.
  const CONSTANTS = {
    'PI': ['Math.pi', CPP.ORDER_UNARY_POSTFIX],
    'E': ['Math.e', CPP.ORDER_UNARY_POSTFIX],
    'GOLDEN_RATIO': ['(1 + Math.sqrt(5)) / 2', CPP.ORDER_MULTIPLICATIVE],
    'SQRT2': ['Math.sqrt2', CPP.ORDER_UNARY_POSTFIX],
    'SQRT1_2': ['Math.sqrt1_2', CPP.ORDER_UNARY_POSTFIX],
    'INFINITY': ['double.infinity', CPP.ORDER_ATOMIC],
  };
  const constant = block.getFieldValue('CONSTANT');
  if (constant !== 'INFINITY') {
    CPP.definitions_['import_dart_math'] = 'import \'dart:math\' as Math;';
  }
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
    CPP.definitions_['import_dart_math'] =
        'import \'dart:math\' as Math;';
    const functionName = CPP.provideFunction_('math_isPrime', `
bool ${CPP.FUNCTION_NAME_PLACEHOLDER_}(n) {
  // https://en.wikipedia.org/wiki/Primality_test#Naive_methods
  if (n == 2 || n == 3) {
    return true;
  }
  // False if n is null, negative, is 1, or not whole.
  // And false if n is divisible by 2 or 3.
  if (n == null || n <= 1 || n % 1 != 0 || n % 2 == 0 || n % 3 == 0) {
    return false;
  }
  // Check all the numbers of form 6k +/- 1, up to sqrt(n).
  for (var x = 6; x <= Math.sqrt(n) + 1; x += 6) {
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
      const functionName = CPP.provideFunction_('math_sum', `
num ${CPP.FUNCTION_NAME_PLACEHOLDER_}(List<num> myList) {
  num sumVal = 0;
  myList.forEach((num entry) {sumVal += entry;});
  return sumVal;
}
`);
      code = functionName + '(' + list + ')';
      break;
    }
    case 'MIN': {
      CPP.definitions_['import_dart_math'] = 'import \'dart:math\' as Math;';
      const functionName = CPP.provideFunction_('math_min', `
num ${CPP.FUNCTION_NAME_PLACEHOLDER_}(List<num> myList) {
  if (myList.isEmpty) return null;
  num minVal = myList[0];
  myList.forEach((num entry) {minVal = Math.min(minVal, entry);});
  return minVal;
}
`);
      code = functionName + '(' + list + ')';
      break;
    }
    case 'MAX': {
      CPP.definitions_['import_dart_math'] = 'import \'dart:math\' as Math;';
      const functionName = CPP.provideFunction_('math_max', `
num ${CPP.FUNCTION_NAME_PLACEHOLDER_}(List<num> myList) {
  if (myList.isEmpty) return null;
  num maxVal = myList[0];
  myList.forEach((num entry) {maxVal = Math.max(maxVal, entry);});
  return maxVal;
}
`);
      code = functionName + '(' + list + ')';
      break;
    }
    case 'AVERAGE': {
      // This operation exclude null and values that are not int or float:
      //   math_mean([null,null,"aString",1,9]) -> 5.0
      const functionName = CPP.provideFunction_('math_mean', `
num ${CPP.FUNCTION_NAME_PLACEHOLDER_}(List myList) {
  // First filter list for numbers only.
  List localList = new List.from(myList);
  localList.removeWhere((a) => a is! num);
  if (localList.isEmpty) return null;
  num sumVal = 0;
  localList.forEach((var entry) {sumVal += entry;});
  return sumVal / localList.length;
}
`);
      code = functionName + '(' + list + ')';
      break;
    }
    case 'MEDIAN': {
      const functionName = CPP.provideFunction_('math_median', `
num ${CPP.FUNCTION_NAME_PLACEHOLDER_}(List myList) {
  // First filter list for numbers only, then sort, then return middle value
  // or the average of two middle values if list has an even number of elements.
  List localList = new List.from(myList);
  localList.removeWhere((a) => a is! num);
  if (localList.isEmpty) return null;
  localList.sort((a, b) => (a - b));
  int index = localList.length ~/ 2;
  if (localList.length % 2 == 1) {
    return localList[index];
  } else {
    return (localList[index - 1] + localList[index]) / 2;
  }
}
`);
      code = functionName + '(' + list + ')';
      break;
    }
    case 'MODE': {
      CPP.definitions_['import_dart_math'] = 'import \'dart:math\' as Math;';
      // As a list of numbers can contain more than one mode,
      // the returned result is provided as an array.
      // Mode of [3, 'x', 'x', 1, 1, 2, '3'] -> ['x', 1]
      const functionName = CPP.provideFunction_('math_modes', `
List ${CPP.FUNCTION_NAME_PLACEHOLDER_}(List values) {
  List modes = [];
  List counts = [];
  int maxCount = 0;
  for (int i = 0; i < values.length; i++) {
    var value = values[i];
    bool found = false;
    int thisCount;
    for (int j = 0; j < counts.length; j++) {
      if (counts[j][0] == value) {
        thisCount = ++counts[j][1];
        found = true;
        break;
      }
    }
    if (!found) {
      counts.add([value, 1]);
      thisCount = 1;
    }
    maxCount = Math.max(thisCount, maxCount);
  }
  for (int j = 0; j < counts.length; j++) {
    if (counts[j][1] == maxCount) {
        modes.add(counts[j][0]);
    }
  }
  return modes;
}
`);
      code = functionName + '(' + list + ')';
      break;
    }
    case 'STD_DEV': {
      CPP.definitions_['import_dart_math'] = 'import \'dart:math\' as Math;';
      const functionName = CPP.provideFunction_('math_standard_deviation', `
num ${CPP.FUNCTION_NAME_PLACEHOLDER_}(List myList) {
  // First filter list for numbers only.
  List numbers = new List.from(myList);
  numbers.removeWhere((a) => a is! num);
  if (numbers.isEmpty) return null;
  num n = numbers.length;
  num sum = 0;
  numbers.forEach((x) => sum += x);
  num mean = sum / n;
  num sumSquare = 0;
  numbers.forEach((x) => sumSquare += Math.pow(x - mean, 2));
  return Math.sqrt(sumSquare / n);
}
`);
      code = functionName + '(' + list + ')';
      break;
    }
    case 'RANDOM': {
      CPP.definitions_['import_dart_math'] = 'import \'dart:math\' as Math;';
      const functionName = CPP.provideFunction_('math_random_item', `
dynamic ${CPP.FUNCTION_NAME_PLACEHOLDER_}(List myList) {
  int x = new Math.Random().nextInt(myList.length);
  return myList[x];
}
`);
      code = functionName + '(' + list + ')';
      break;
    }
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
  CPP.definitions_['import_dart_math'] = 'import \'dart:math\' as Math;';
  const argument0 = CPP.valueToCode(block, 'VALUE', CPP.ORDER_NONE) || '0';
  const argument1 = CPP.valueToCode(block, 'LOW', CPP.ORDER_NONE) || '0';
  const argument2 =
      CPP.valueToCode(block, 'HIGH', CPP.ORDER_NONE) || 'double.infinity';
  const code = 'Math.min(Math.max(' + argument0 + ', ' + argument1 + '), ' +
      argument2 + ')';
  return [code, CPP.ORDER_UNARY_POSTFIX];
};

CPP['math_random_int'] = function(block) {
  // Random integer between [X] and [Y].
  CPP.definitions_['import_dart_math'] = 'import \'dart:math\' as Math;';
  const argument0 = CPP.valueToCode(block, 'FROM', CPP.ORDER_NONE) || '0';
  const argument1 = CPP.valueToCode(block, 'TO', CPP.ORDER_NONE) || '0';
  const functionName = CPP.provideFunction_('math_random_int', `
int ${CPP.FUNCTION_NAME_PLACEHOLDER_}(num a, num b) {
  if (a > b) {
    // Swap a and b to ensure a is smaller.
    num c = a;
    a = b;
    b = c;
  }
  return new Math.Random().nextInt(b - a + 1) + a;
}
`);
  const code = functionName + '(' + argument0 + ', ' + argument1 + ')';
  return [code, CPP.ORDER_UNARY_POSTFIX];
};

CPP['math_random_float'] = function(block) {
  // Random fraction between 0 and 1.
  CPP.definitions_['import_dart_math'] = 'import \'dart:math\' as Math;';
  return ['new Math.Random().nextDouble()', CPP.ORDER_UNARY_POSTFIX];
};

CPP['math_atan2'] = function(block) {
  // Arctangent of point (X, Y) in degrees from -180 to 180.
  CPP.definitions_['import_dart_math'] = 'import \'dart:math\' as Math;';
  const argument0 = CPP.valueToCode(block, 'X', CPP.ORDER_NONE) || '0';
  const argument1 = CPP.valueToCode(block, 'Y', CPP.ORDER_NONE) || '0';
  return [
    'Math.atan2(' + argument1 + ', ' + argument0 + ') / Math.pi * 180',
    CPP.ORDER_MULTIPLICATIVE
  ];
};
