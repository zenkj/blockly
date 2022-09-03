/**
 * @license
 * Copyright 2014 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Generating CPP for list blocks.
 */
'use strict';

goog.module('Blockly.CPP.lists');

const CPP = goog.require('Blockly.CPP');
const {NameType} = goog.require('Blockly.Names');


CPP.addReservedWords('Math');

CPP['lists_create_empty'] = function(block) {
  // Create an empty list.
  return ['[]', CPP.ORDER_ATOMIC];
};

CPP['lists_create_with'] = function(block) {
  // Create a list with any number of elements of any type.
  const elements = new Array(block.itemCount_);
  for (let i = 0; i < block.itemCount_; i++) {
    elements[i] = CPP.valueToCode(block, 'ADD' + i, CPP.ORDER_NONE) || 'null';
  }
  const code = '[' + elements.join(', ') + ']';
  return [code, CPP.ORDER_ATOMIC];
};

CPP['lists_repeat'] = function(block) {
  // Create a list with one element repeated.
  const element = CPP.valueToCode(block, 'ITEM', CPP.ORDER_NONE) || 'null';
  const repeatCount = CPP.valueToCode(block, 'NUM', CPP.ORDER_NONE) || '0';
  const code = 'new List.filled(' + repeatCount + ', ' + element + ')';
  return [code, CPP.ORDER_UNARY_POSTFIX];
};

CPP['lists_length'] = function(block) {
  // String or array length.
  const list =
      CPP.valueToCode(block, 'VALUE', CPP.ORDER_UNARY_POSTFIX) || '[]';
  return [list + '.length', CPP.ORDER_UNARY_POSTFIX];
};

CPP['lists_isEmpty'] = function(block) {
  // Is the string null or array empty?
  const list =
      CPP.valueToCode(block, 'VALUE', CPP.ORDER_UNARY_POSTFIX) || '[]';
  return [list + '.isEmpty', CPP.ORDER_UNARY_POSTFIX];
};

CPP['lists_indexOf'] = function(block) {
  // Find an item in the list.
  const operator =
      block.getFieldValue('END') === 'FIRST' ? 'indexOf' : 'lastIndexOf';
  const item = CPP.valueToCode(block, 'FIND', CPP.ORDER_NONE) || "''";
  const list =
      CPP.valueToCode(block, 'VALUE', CPP.ORDER_UNARY_POSTFIX) || '[]';
  const code = list + '.' + operator + '(' + item + ')';
  if (block.workspace.options.oneBasedIndex) {
    return [code + ' + 1', CPP.ORDER_ADDITIVE];
  }
  return [code, CPP.ORDER_UNARY_POSTFIX];
};

CPP['lists_getIndex'] = function(block) {
  // Get element at index.
  // Note: Until January 2013 this block did not have MODE or WHERE inputs.
  const mode = block.getFieldValue('MODE') || 'GET';
  const where = block.getFieldValue('WHERE') || 'FROM_START';
  const listOrder = (where === 'RANDOM' || where === 'FROM_END') ?
      CPP.ORDER_NONE :
      CPP.ORDER_UNARY_POSTFIX;
  let list = CPP.valueToCode(block, 'VALUE', listOrder) || '[]';
  // Cache non-trivial values to variables to prevent repeated look-ups.
  // Closure, which accesses and modifies 'list'.
  function cacheList() {
    const listVar = CPP.nameDB_.getDistinctName('tmp_list', NameType.VARIABLE);
    const code = 'List ' + listVar + ' = ' + list + ';\n';
    list = listVar;
    return code;
  }
  // If `list` would be evaluated more than once (which is the case for
  // RANDOM REMOVE and FROM_END) and is non-trivial, make sure to access it
  // only once.
  if (((where === 'RANDOM' && mode === 'REMOVE') || where === 'FROM_END') &&
      !list.match(/^\w+$/)) {
    // `list` is an expression, so we may not evaluate it more than once.
    if (where === 'RANDOM') {
      CPP.definitions_['import_dart_math'] = 'import \'dart:math\' as Math;';
      // We can use multiple statements.
      let code = cacheList();
      const xVar = CPP.nameDB_.getDistinctName('tmp_x', NameType.VARIABLE);
      code += 'int ' + xVar + ' = new Math.Random().nextInt(' + list +
          '.length);\n';
      code += list + '.removeAt(' + xVar + ');\n';
      return code;
    } else {  // where === 'FROM_END'
      if (mode === 'REMOVE') {
        // We can use multiple statements.
        const at = CPP.getAdjusted(block, 'AT', 1, false, CPP.ORDER_ADDITIVE);
        let code = cacheList();
        code += list + '.removeAt(' + list + '.length' +
            ' - ' + at + ');\n';
        return code;

      } else if (mode === 'GET') {
        const at = CPP.getAdjusted(block, 'AT', 1);
        // We need to create a procedure to avoid reevaluating values.
        const functionName = CPP.provideFunction_('lists_get_from_end', `
dynamic ${CPP.FUNCTION_NAME_PLACEHOLDER_}(List my_list, num x) {
  x = my_list.length - x;
  return my_list[x];
}
`);
        const code = functionName + '(' + list + ', ' + at + ')';
        return [code, CPP.ORDER_UNARY_POSTFIX];
      } else if (mode === 'GET_REMOVE') {
        const at = CPP.getAdjusted(block, 'AT', 1);
        // We need to create a procedure to avoid reevaluating values.
        const functionName = CPP.provideFunction_('lists_remove_from_end', `
dynamic ${CPP.FUNCTION_NAME_PLACEHOLDER_}(List my_list, num x) {
  x = my_list.length - x;
  return my_list.removeAt(x);
}
`);
        const code = functionName + '(' + list + ', ' + at + ')';
        return [code, CPP.ORDER_UNARY_POSTFIX];
      }
    }
  } else {
    // Either `list` is a simple variable, or we only need to refer to `list`
    // once.
    switch (where) {
      case 'FIRST':
        if (mode === 'GET') {
          const code = list + '.first';
          return [code, CPP.ORDER_UNARY_POSTFIX];
        } else if (mode === 'GET_REMOVE') {
          const code = list + '.removeAt(0)';
          return [code, CPP.ORDER_UNARY_POSTFIX];
        } else if (mode === 'REMOVE') {
          return list + '.removeAt(0);\n';
        }
        break;
      case 'LAST':
        if (mode === 'GET') {
          const code = list + '.last';
          return [code, CPP.ORDER_UNARY_POSTFIX];
        } else if (mode === 'GET_REMOVE') {
          const code = list + '.removeLast()';
          return [code, CPP.ORDER_UNARY_POSTFIX];
        } else if (mode === 'REMOVE') {
          return list + '.removeLast();\n';
        }
        break;
      case 'FROM_START': {
        const at = CPP.getAdjusted(block, 'AT');
        if (mode === 'GET') {
          const code = list + '[' + at + ']';
          return [code, CPP.ORDER_UNARY_POSTFIX];
        } else if (mode === 'GET_REMOVE') {
          const code = list + '.removeAt(' + at + ')';
          return [code, CPP.ORDER_UNARY_POSTFIX];
        } else if (mode === 'REMOVE') {
          return list + '.removeAt(' + at + ');\n';
        }
        break;
      }
      case 'FROM_END': {
        const at = CPP.getAdjusted(block, 'AT', 1, false, CPP.ORDER_ADDITIVE);
        if (mode === 'GET') {
          const code = list + '[' + list + '.length - ' + at + ']';
          return [code, CPP.ORDER_UNARY_POSTFIX];
        } else if (mode === 'GET_REMOVE' || mode === 'REMOVE') {
          const code = list + '.removeAt(' + list + '.length - ' + at + ')';
          if (mode === 'GET_REMOVE') {
            return [code, CPP.ORDER_UNARY_POSTFIX];
          } else if (mode === 'REMOVE') {
            return code + ';\n';
          }
        }
        break;
      }
      case 'RANDOM':
        CPP.definitions_['import_dart_math'] = 'import \'dart:math\' as Math;';
        if (mode === 'REMOVE') {
          // We can use multiple statements.
          const xVar = CPP.nameDB_.getDistinctName('tmp_x', NameType.VARIABLE);
          let code = 'int ' + xVar + ' = new Math.Random().nextInt(' + list +
              '.length);\n';
          code += list + '.removeAt(' + xVar + ');\n';
          return code;
        } else if (mode === 'GET') {
          const functionName = CPP.provideFunction_('lists_get_random_item', `
dynamic ${CPP.FUNCTION_NAME_PLACEHOLDER_}(List my_list) {
  int x = new Math.Random().nextInt(my_list.length);
  return my_list[x];
}
`);
          const code = functionName + '(' + list + ')';
          return [code, CPP.ORDER_UNARY_POSTFIX];
        } else if (mode === 'GET_REMOVE') {
          const functionName =
              CPP.provideFunction_('lists_remove_random_item', `
dynamic ${CPP.FUNCTION_NAME_PLACEHOLDER_}(List my_list) {
  int x = new Math.Random().nextInt(my_list.length);
  return my_list.removeAt(x);
}
`);
          const code = functionName + '(' + list + ')';
          return [code, CPP.ORDER_UNARY_POSTFIX];
        }
        break;
    }
  }
  throw Error('Unhandled combination (lists_getIndex).');
};

CPP['lists_setIndex'] = function(block) {
  // Set element at index.
  // Note: Until February 2013 this block did not have MODE or WHERE inputs.
  const mode = block.getFieldValue('MODE') || 'GET';
  const where = block.getFieldValue('WHERE') || 'FROM_START';
  let list = CPP.valueToCode(block, 'LIST', CPP.ORDER_UNARY_POSTFIX) || '[]';
  const value = CPP.valueToCode(block, 'TO', CPP.ORDER_ASSIGNMENT) || 'null';
  // Cache non-trivial values to variables to prevent repeated look-ups.
  // Closure, which accesses and modifies 'list'.
  function cacheList() {
    if (list.match(/^\w+$/)) {
      return '';
    }
    const listVar = CPP.nameDB_.getDistinctName('tmp_list', NameType.VARIABLE);
    const code = 'List ' + listVar + ' = ' + list + ';\n';
    list = listVar;
    return code;
  }
  switch (where) {
    case 'FIRST':
      if (mode === 'SET') {
        return list + '[0] = ' + value + ';\n';
      } else if (mode === 'INSERT') {
        return list + '.insert(0, ' + value + ');\n';
      }
      break;
    case 'LAST':
      if (mode === 'SET') {
        let code = cacheList();
        code += list + '[' + list + '.length - 1] = ' + value + ';\n';
        return code;
      } else if (mode === 'INSERT') {
        return list + '.add(' + value + ');\n';
      }
      break;
    case 'FROM_START': {
      const at = CPP.getAdjusted(block, 'AT');
      if (mode === 'SET') {
        return list + '[' + at + '] = ' + value + ';\n';
      } else if (mode === 'INSERT') {
        return list + '.insert(' + at + ', ' + value + ');\n';
      }
      break;
    }
    case 'FROM_END': {
      const at = CPP.getAdjusted(block, 'AT', 1, false, CPP.ORDER_ADDITIVE);
      let code = cacheList();
      if (mode === 'SET') {
        code += list + '[' + list + '.length - ' + at + '] = ' + value + ';\n';
        return code;
      } else if (mode === 'INSERT') {
        code += list + '.insert(' + list + '.length - ' + at + ', ' + value +
            ');\n';
        return code;
      }
      break;
    }
    case 'RANDOM': {
      CPP.definitions_['import_dart_math'] = 'import \'dart:math\' as Math;';
      let code = cacheList();
      const xVar = CPP.nameDB_.getDistinctName('tmp_x', NameType.VARIABLE);
      code += 'int ' + xVar + ' = new Math.Random().nextInt(' + list +
          '.length);\n';
      if (mode === 'SET') {
        code += list + '[' + xVar + '] = ' + value + ';\n';
        return code;
      } else if (mode === 'INSERT') {
        code += list + '.insert(' + xVar + ', ' + value + ');\n';
        return code;
      }
      break;
    }
  }
  throw Error('Unhandled combination (lists_setIndex).');
};

CPP['lists_getSublist'] = function(block) {
  // Get sublist.
  const list =
      CPP.valueToCode(block, 'LIST', CPP.ORDER_UNARY_POSTFIX) || '[]';
  const where1 = block.getFieldValue('WHERE1');
  const where2 = block.getFieldValue('WHERE2');
  let code;
  if (list.match(/^\w+$/) ||
      (where1 !== 'FROM_END' && where2 === 'FROM_START')) {
    // If the list is a is a variable or doesn't require a call for length,
    // don't generate a helper function.
    let at1;
    switch (where1) {
      case 'FROM_START':
        at1 = CPP.getAdjusted(block, 'AT1');
        break;
      case 'FROM_END':
        at1 = CPP.getAdjusted(block, 'AT1', 1, false, CPP.ORDER_ADDITIVE);
        at1 = list + '.length - ' + at1;
        break;
      case 'FIRST':
        at1 = '0';
        break;
      default:
        throw Error('Unhandled option (lists_getSublist).');
    }
    let at2;
    switch (where2) {
      case 'FROM_START':
        at2 = CPP.getAdjusted(block, 'AT2', 1);
        break;
      case 'FROM_END':
        at2 = CPP.getAdjusted(block, 'AT2', 0, false, CPP.ORDER_ADDITIVE);
        at2 = list + '.length - ' + at2;
        break;
      case 'LAST':
        // There is no second index if LAST option is chosen.
        break;
      default:
        throw Error('Unhandled option (lists_getSublist).');
    }
    if (where2 === 'LAST') {
      code = list + '.sublist(' + at1 + ')';
    } else {
      code = list + '.sublist(' + at1 + ', ' + at2 + ')';
    }
  } else {
    const at1 = CPP.getAdjusted(block, 'AT1');
    const at2 = CPP.getAdjusted(block, 'AT2');
    const functionName = CPP.provideFunction_('lists_get_sublist', `
List ${CPP.FUNCTION_NAME_PLACEHOLDER_}(List list, String where1, num at1, String where2, num at2) {
  int getAt(String where, num at) {
    if (where == 'FROM_END') {
      at = list.length - 1 - at;
    } else if (where == 'FIRST') {
      at = 0;
    } else if (where == 'LAST') {
      at = list.length - 1;
    } else if (where != 'FROM_START') {
      throw 'Unhandled option (lists_getSublist).';
    }
    return at;
  }
  at1 = getAt(where1, at1);
  at2 = getAt(where2, at2) + 1;
  return list.sublist(at1, at2);
}
`);
    code = functionName + '(' + list + ', \'' + where1 + '\', ' + at1 + ', \'' +
        where2 + '\', ' + at2 + ')';
  }
  return [code, CPP.ORDER_UNARY_POSTFIX];
};

CPP['lists_sort'] = function(block) {
  // Block for sorting a list.
  const list = CPP.valueToCode(block, 'LIST', CPP.ORDER_NONE) || '[]';
  const direction = block.getFieldValue('DIRECTION') === '1' ? 1 : -1;
  const type = block.getFieldValue('TYPE');
  const sortFunctionName = CPP.provideFunction_('lists_sort', `
List ${CPP.FUNCTION_NAME_PLACEHOLDER_}(List list, String type, int direction) {
  var compareFuncs = {
    'NUMERIC': (a, b) => (direction * a.compareTo(b)).toInt(),
    'TEXT': (a, b) => direction * a.toString().compareTo(b.toString()),
    'IGNORE_CASE':
      (a, b) => direction *
      a.toString().toLowerCase().compareTo(b.toString().toLowerCase())
  };
  list = new List.from(list);
  var compare = compareFuncs[type];
  list.sort(compare);
  return list;
}
`);
  return [
    sortFunctionName + '(' + list + ', ' +
        '"' + type + '", ' + direction + ')',
    CPP.ORDER_UNARY_POSTFIX
  ];
};

CPP['lists_split'] = function(block) {
  // Block for splitting text into a list, or joining a list into text.
  let input = CPP.valueToCode(block, 'INPUT', CPP.ORDER_UNARY_POSTFIX);
  const delimiter = CPP.valueToCode(block, 'DELIM', CPP.ORDER_NONE) || "''";
  const mode = block.getFieldValue('MODE');
  let functionName;
  if (mode === 'SPLIT') {
    if (!input) {
      input = "''";
    }
    functionName = 'split';
  } else if (mode === 'JOIN') {
    if (!input) {
      input = '[]';
    }
    functionName = 'join';
  } else {
    throw Error('Unknown mode: ' + mode);
  }
  const code = input + '.' + functionName + '(' + delimiter + ')';
  return [code, CPP.ORDER_UNARY_POSTFIX];
};

CPP['lists_reverse'] = function(block) {
  // Block for reversing a list.
  const list = CPP.valueToCode(block, 'LIST', CPP.ORDER_NONE) || '[]';
  // XXX What should the operator precedence be for a `new`?
  const code = 'new List.from(' + list + '.reversed)';
  return [code, CPP.ORDER_UNARY_POSTFIX];
};
