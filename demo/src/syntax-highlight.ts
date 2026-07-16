export type SyntaxTokenKind =
  | 'attribute'
  | 'comment'
  | 'function'
  | 'keyword'
  | 'literal'
  | 'number'
  | 'operator'
  | 'plain'
  | 'property'
  | 'punctuation'
  | 'string'
  | 'tag'
  | 'type'

export interface SyntaxToken {
  kind: SyntaxTokenKind
  value: string
}

const KEYWORDS = new Set([
  'as',
  'async',
  'await',
  'break',
  'case',
  'catch',
  'class',
  'const',
  'continue',
  'default',
  'delete',
  'do',
  'else',
  'export',
  'extends',
  'finally',
  'for',
  'from',
  'function',
  'if',
  'implements',
  'import',
  'in',
  'instanceof',
  'interface',
  'let',
  'new',
  'of',
  'return',
  'switch',
  'throw',
  'try',
  'type',
  'typeof',
  'var',
  'void',
  'while',
  'with',
  'yield',
])

const LITERALS = new Set(['false', 'null', 'true', 'undefined'])
const OPERATOR_CHARACTERS = new Set([
  '!',
  '%',
  '&',
  '*',
  '+',
  '-',
  '.',
  '/',
  ':',
  '<',
  '=',
  '>',
  '?',
  '|',
  '~',
])
const PUNCTUATION_CHARACTERS = new Set(['(', ')', '[', ']', '{', '}', ',', ';'])

function isIdentifierStart(character: string | undefined) {
  return character !== undefined && /[A-Za-z_$]/.test(character)
}

function isIdentifierPart(character: string | undefined, allowHyphen: boolean) {
  return character !== undefined && (/[\w$]/.test(character) || (allowHyphen && character === '-'))
}

function nextNonWhitespace(code: string, start: number) {
  let index = start
  while (/\s/.test(code[index] ?? '')) index += 1
  return code[index]
}

function previousNonWhitespace(code: string, start: number) {
  let index = start
  while (index >= 0 && /\s/.test(code[index] ?? '')) index -= 1
  return code[index]
}

function pushToken(tokens: SyntaxToken[], kind: SyntaxTokenKind, value: string) {
  if (!value) return

  const previous = tokens[tokens.length - 1]
  if (previous?.kind === kind) {
    previous.value += value
    return
  }

  tokens.push({ kind, value })
}

function readQuotedValue(code: string, start: number) {
  const quote = code[start]
  let index = start + 1

  while (index < code.length) {
    if (code[index] === '\\') {
      index += 2
      continue
    }

    index += 1
    if (code[index - 1] === quote) break
  }

  return index
}

function classifyIdentifier(
  code: string,
  value: string,
  start: number,
  end: number,
  insideJsxTag: boolean,
): SyntaxTokenKind {
  if (insideJsxTag && nextNonWhitespace(code, end) === '=') return 'attribute'
  if (KEYWORDS.has(value)) return 'keyword'
  if (LITERALS.has(value)) return 'literal'
  if (nextNonWhitespace(code, end) === '(') return 'function'
  if (previousNonWhitespace(code, start - 1) === '.') return 'property'
  if (/^[A-Z]/.test(value)) return 'type'
  return 'plain'
}

/**
 * Tokenizes the small TypeScript/JSX examples shown on the homepage. The returned
 * values always reconstruct the original source, so copy-to-clipboard can keep
 * using the untouched code string.
 */
export function highlightTsx(code: string): SyntaxToken[] {
  const tokens: SyntaxToken[] = []
  let index = 0
  let insideJsxTag = false
  let jsxExpressionDepth = 0

  while (index < code.length) {
    const character = code[index]
    const nextCharacter = code[index + 1]

    if (/\s/.test(character)) {
      const start = index
      while (index < code.length && /\s/.test(code[index])) index += 1
      pushToken(tokens, 'plain', code.slice(start, index))
      continue
    }

    if (character === '/' && nextCharacter === '/') {
      const start = index
      index = code.indexOf('\n', index)
      if (index === -1) index = code.length
      pushToken(tokens, 'comment', code.slice(start, index))
      continue
    }

    if (character === '/' && nextCharacter === '*') {
      const start = index
      const closingIndex = code.indexOf('*/', index + 2)
      index = closingIndex === -1 ? code.length : closingIndex + 2
      pushToken(tokens, 'comment', code.slice(start, index))
      continue
    }

    if (character === '"' || character === "'" || character === '`') {
      const end = readQuotedValue(code, index)
      pushToken(tokens, 'string', code.slice(index, end))
      index = end
      continue
    }

    const jsxTagMatch = code.slice(index).match(/^<\/?([A-Za-z_$][\w$.-]*)/)
    if (!insideJsxTag && jsxExpressionDepth === 0 && jsxTagMatch) {
      const prefixLength = jsxTagMatch[0].startsWith('</') ? 2 : 1
      pushToken(tokens, 'punctuation', code.slice(index, index + prefixLength))
      pushToken(tokens, 'tag', jsxTagMatch[1])
      index += jsxTagMatch[0].length
      insideJsxTag = true
      continue
    }

    if (insideJsxTag && (code.startsWith('/>', index) || character === '>')) {
      const value = code.startsWith('/>', index) ? '/>' : '>'
      pushToken(tokens, 'punctuation', value)
      index += value.length
      insideJsxTag = false
      continue
    }

    if (insideJsxTag && character === '{') {
      pushToken(tokens, 'punctuation', character)
      index += 1
      insideJsxTag = false
      jsxExpressionDepth = 1
      continue
    }

    if (jsxExpressionDepth > 0 && (character === '{' || character === '}')) {
      jsxExpressionDepth += character === '{' ? 1 : -1
      pushToken(tokens, 'punctuation', character)
      index += 1
      if (jsxExpressionDepth === 0) insideJsxTag = true
      continue
    }

    if (/\d/.test(character)) {
      const start = index
      while (index < code.length && /[\d._]/.test(code[index])) index += 1
      pushToken(tokens, 'number', code.slice(start, index))
      continue
    }

    if (isIdentifierStart(character)) {
      const start = index
      index += 1
      while (isIdentifierPart(code[index], insideJsxTag)) index += 1
      const value = code.slice(start, index)
      pushToken(tokens, classifyIdentifier(code, value, start, index, insideJsxTag), value)
      continue
    }

    if (OPERATOR_CHARACTERS.has(character)) {
      const start = index
      while (index < code.length && OPERATOR_CHARACTERS.has(code[index])) index += 1
      pushToken(tokens, 'operator', code.slice(start, index))
      continue
    }

    if (PUNCTUATION_CHARACTERS.has(character)) {
      pushToken(tokens, 'punctuation', character)
      index += 1
      continue
    }

    pushToken(tokens, 'plain', character)
    index += 1
  }

  return tokens
}
