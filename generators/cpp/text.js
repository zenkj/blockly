/**
 * @license
 * Copyright 2014 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Generating CPP for text blocks.
 */
'use strict';

goog.module('Blockly.CPP.texts');

const CPP = goog.require('Blockly.CPP');
const {NameType} = goog.require('Blockly.Names');


CPP.addReservedWords('Html,Math');

CPP['text'] = function(block) {
  // Text value.
  const code = CPP.quote_(block.getFieldValue('TEXT'));
  return [code, CPP.ORDER_ATOMIC];
};

CPP['text_multiline'] = function(block) {
  // Text value.
  const code = CPP.multiline_quote_(block.getFieldValue('TEXT'));
  const order =
      code.indexOf('+') !== -1 ? CPP.ORDER_ADDITIVE : CPP.ORDER_ATOMIC;
  return [code, order];
};

CPP['text_join'] = function(block) {
  // Create a string made up of any number of elements of any type.
  switch (block.itemCount_) {
    case 0:
      return ["''", CPP.ORDER_ATOMIC];
    case 1: {
      const element =
          CPP.valueToCode(block, 'ADD0', CPP.ORDER_UNARY_POSTFIX) || "''";
      const code = element + '.toString()';
      return [code, CPP.ORDER_UNARY_POSTFIX];
    }
    default: {
      const elements = new Array(block.itemCount_);
      for (let i = 0; i < block.itemCount_; i++) {
        elements[i] =
            CPP.valueToCode(block, 'ADD' + i, CPP.ORDER_NONE) || "''";
      }
      const code = '[' + elements.join(',') + '].join()';
      return [code, CPP.ORDER_UNARY_POSTFIX];
    }
  }
};

CPP['text_append'] = function(block) {
  // Append to a variable in place.
  const varName =
      CPP.nameDB_.getName(block.getFieldValue('VAR'), NameType.VARIABLE);
  const value = CPP.valueToCode(block, 'TEXT', CPP.ORDER_NONE) || "''";
  return varName + ' = [' + varName + ', ' + value + '].join();\n';
};

CPP['text_length'] = function(block) {
  // String or array length.
  const text =
      CPP.valueToCode(block, 'VALUE', CPP.ORDER_UNARY_POSTFIX) || "''";
  return [text + '.length', CPP.ORDER_UNARY_POSTFIX];
};

CPP['text_isEmpty'] = function(block) {
  // Is the string null or array empty?
  const text =
      CPP.valueToCode(block, 'VALUE', CPP.ORDER_UNARY_POSTFIX) || "''";
  return [text + '.isEmpty', CPP.ORDER_UNARY_POSTFIX];
};

CPP['text_indexOf'] = function(block) {
  // Search the text for a substring.
  const operator =
      block.getFieldValue('END') === 'FIRST' ? 'indexOf' : 'lastIndexOf';
  const substring = CPP.valueToCode(block, 'FIND', CPP.ORDER_NONE) || "''";
  const text =
      CPP.valueToCode(block, 'VALUE', CPP.ORDER_UNARY_POSTFIX) || "''";
  const code = text + '.' + operator + '(' + substring + ')';
  if (block.workspace.options.oneBasedIndex) {
    return [code + ' + 1', CPP.ORDER_ADDITIVE];
  }
  return [code, CPP.ORDER_UNARY_POSTFIX];
};

CPP['text_charAt'] = function(block) {
  // Get letter at index.
  // Note: Until January 2013 this block did not have the WHERE input.
  const where = block.getFieldValue('WHERE') || 'FROM_START';
  const textOrder = (where === 'FIRST' || where === 'FROM_START') ?
      CPP.ORDER_UNARY_POSTFIX :
      CPP.ORDER_NONE;
  const text = CPP.valueToCode(block, 'VALUE', textOrder) || "''";
  let at;
  switch (where) {
    case 'FIRST': {
      const code = text + '[0]';
      return [code, CPP.ORDER_UNARY_POSTFIX];
    }
    case 'FROM_START': {
      at = CPP.getAdjusted(block, 'AT');
      const code = text + '[' + at + ']';
      return [code, CPP.ORDER_UNARY_POSTFIX];
    }
    case 'LAST':
      at = 1;
      // Fall through.
    case 'FROM_END': {
      at = CPP.getAdjusted(block, 'AT', 1);
      const functionName = CPP.provideFunction_('text_get_from_end', `
String ${CPP.FUNCTION_NAME_PLACEHOLDER_}(String text, num x) {
  return text[text.length - x];
}
`);
      const code = functionName + '(' + text + ', ' + at + ')';
      return [code, CPP.ORDER_UNARY_POSTFIX];
    }
    case 'RANDOM': {
      CPP.definitions_['import_dart_math'] = 'import \'dart:math\' as Math;';
      const functionName = CPP.provideFunction_('text_random_letter', `
String ${CPP.FUNCTION_NAME_PLACEHOLDER_}(String text) {
  int x = new Math.Random().nextInt(text.length);
  return text[x];
}
`);
      const code = functionName + '(' + text + ')';
      return [code, CPP.ORDER_UNARY_POSTFIX];
    }
  }
  throw Error('Unhandled option (text_charAt).');
};

CPP['text_getSubstring'] = function(block) {
  // Get substring.
  const where1 = block.getFieldValue('WHERE1');
  const where2 = block.getFieldValue('WHERE2');
  const requiresLengthCall = (where1 !== 'FROM_END' && where2 === 'FROM_START');
  const textOrder =
      requiresLengthCall ? CPP.ORDER_UNARY_POSTFIX : CPP.ORDER_NONE;
  const text = CPP.valueToCode(block, 'STRING', textOrder) || "''";
  let code;
  if (where1 === 'FIRST' && where2 === 'LAST') {
    code = text;
    return [code, CPP.ORDER_NONE];
  } else if (text.match(/^'?\w+'?$/) || requiresLengthCall) {
    // If the text is a variable or literal or doesn't require a call for
    // length, don't generate a helper function.
    let at1;
    switch (where1) {
      case 'FROM_START':
        at1 = CPP.getAdjusted(block, 'AT1');
        break;
      case 'FROM_END':
        at1 = CPP.getAdjusted(block, 'AT1', 1, false, CPP.ORDER_ADDITIVE);
        at1 = text + '.length - ' + at1;
        break;
      case 'FIRST':
        at1 = '0';
        break;
      default:
        throw Error('Unhandled option (text_getSubstring).');
    }
    let at2;
    switch (where2) {
      case 'FROM_START':
        at2 = CPP.getAdjusted(block, 'AT2', 1);
        break;
      case 'FROM_END':
        at2 = CPP.getAdjusted(block, 'AT2', 0, false, CPP.ORDER_ADDITIVE);
        at2 = text + '.length - ' + at2;
        break;
      case 'LAST':
        break;
      default:
        throw Error('Unhandled option (text_getSubstring).');
    }

    if (where2 === 'LAST') {
      code = text + '.substring(' + at1 + ')';
    } else {
      code = text + '.substring(' + at1 + ', ' + at2 + ')';
    }
  } else {
    const at1 = CPP.getAdjusted(block, 'AT1');
    const at2 = CPP.getAdjusted(block, 'AT2');
    const functionName = CPP.provideFunction_('text_get_substring', `
String ${CPP.FUNCTION_NAME_PLACEHOLDER_}(String text, String where1, num at1, String where2, num at2) {
  int getAt(String where, num at) {
    if (where == 'FROM_END') {
      at = text.length - 1 - at;
    } else if (where == 'FIRST') {
      at = 0;
    } else if (where == 'LAST') {
      at = text.length - 1;
    } else if (where != 'FROM_START') {
      throw 'Unhandled option (text_getSubstring).';
    }
    return at;
  }
  at1 = getAt(where1, at1);
  at2 = getAt(where2, at2) + 1;
  return text.substring(at1, at2);
}
`);
    code = functionName + '(' + text + ', \'' + where1 + '\', ' + at1 + ', \'' +
        where2 + '\', ' + at2 + ')';
  }
  return [code, CPP.ORDER_UNARY_POSTFIX];
};

CPP['text_changeCase'] = function(block) {
  // Change capitalization.
  const OPERATORS = {
    'UPPERCASE': '.toUpperCase()',
    'LOWERCASE': '.toLowerCase()',
    'TITLECASE': null
  };
  const operator = OPERATORS[block.getFieldValue('CASE')];
  const textOrder = operator ? CPP.ORDER_UNARY_POSTFIX : CPP.ORDER_NONE;
  const text = CPP.valueToCode(block, 'TEXT', textOrder) || "''";
  let code;
  if (operator) {
    // Upper and lower case are functions built into CPP.
    code = text + operator;
  } else {
    // Title case is not a native CPP function.  Define one.
    const functionName = CPP.provideFunction_('text_toTitleCase', `
String ${CPP.FUNCTION_NAME_PLACEHOLDER_}(String str) {
  RegExp exp = new RegExp(r'\\b');
  List<String> list = str.split(exp);
  final title = new StringBuffer();
  for (String part in list) {
    if (part.length > 0) {
      title.write(part[0].toUpperCase());
      if (part.length > 0) {
        title.write(part.substring(1).toLowerCase());
      }
    }
  }
  return title.toString();
}
`);
    code = functionName + '(' + text + ')';
  }
  return [code, CPP.ORDER_UNARY_POSTFIX];
};

CPP['text_trim'] = function(block) {
  // Trim spaces.
  const OPERATORS = {
    'LEFT': '.replaceFirst(new RegExp(r\'^\\s+\'), \'\')',
    'RIGHT': '.replaceFirst(new RegExp(r\'\\s+$\'), \'\')',
    'BOTH': '.trim()'
  };
  const operator = OPERATORS[block.getFieldValue('MODE')];
  const text =
      CPP.valueToCode(block, 'TEXT', CPP.ORDER_UNARY_POSTFIX) || "''";
  return [text + operator, CPP.ORDER_UNARY_POSTFIX];
};

CPP['text_print'] = function(block) {
  // Print statement.
  const msg = CPP.valueToCode(block, 'TEXT', CPP.ORDER_NONE) || "''";
  return 'print(' + msg + ');\n';
};

CPP['text_prompt_ext'] = function(block) {
  // Prompt function.
  CPP.definitions_['import_dart_html'] = 'import \'dart:html\' as Html;';
  let msg;
  if (block.getField('TEXT')) {
    // Internal message.
    msg = CPP.quote_(block.getFieldValue('TEXT'));
  } else {
    // External message.
    msg = CPP.valueToCode(block, 'TEXT', CPP.ORDER_NONE) || "''";
  }
  let code = 'Html.window.prompt(' + msg + ', \'\')';
  const toNumber = block.getFieldValue('TYPE') === 'NUMBER';
  if (toNumber) {
    CPP.definitions_['import_dart_math'] = 'import \'dart:math\' as Math;';
    code = 'Math.parseDouble(' + code + ')';
  }
  return [code, CPP.ORDER_UNARY_POSTFIX];
};

CPP['text_prompt'] = CPP['text_prompt_ext'];

CPP['text_count'] = function(block) {
  const text = CPP.valueToCode(block, 'TEXT', CPP.ORDER_NONE) || "''";
  const sub = CPP.valueToCode(block, 'SUB', CPP.ORDER_NONE) || "''";
  // Substring count is not a native CPP function.  Define one.
  const functionName = CPP.provideFunction_('text_count', `
int ${CPP.FUNCTION_NAME_PLACEHOLDER_}(String haystack, String needle) {
  if (needle.length == 0) {
    return haystack.length + 1;
  }
  int index = 0;
  int count = 0;
  while (index != -1) {
    index = haystack.indexOf(needle, index);
    if (index != -1) {
      count++;
     index += needle.length;
    }
  }
  return count;
}
`);
  const code = functionName + '(' + text + ', ' + sub + ')';
  return [code, CPP.ORDER_UNARY_POSTFIX];
};

CPP['text_replace'] = function(block) {
  const text =
      CPP.valueToCode(block, 'TEXT', CPP.ORDER_UNARY_POSTFIX) || "''";
  const from = CPP.valueToCode(block, 'FROM', CPP.ORDER_NONE) || "''";
  const to = CPP.valueToCode(block, 'TO', CPP.ORDER_NONE) || "''";
  const code = text + '.replaceAll(' + from + ', ' + to + ')';
  return [code, CPP.ORDER_UNARY_POSTFIX];
};

CPP['text_reverse'] = function(block) {
  // There isn't a sensible way to do this in CPP. See:
  // http://stackoverflow.com/a/21613700/3529104
  // Implementing something is possibly better than not implementing anything?
  const text =
      CPP.valueToCode(block, 'TEXT', CPP.ORDER_UNARY_POSTFIX) || "''";
  const code = 'new String.fromCharCodes(' + text + '.runes.toList().reversed)';
  return [code, CPP.ORDER_UNARY_PREFIX];
};
