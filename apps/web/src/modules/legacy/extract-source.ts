import ts from 'typescript';
import type { LegacyDomNode } from './extract-rich-text';

/** Only the observed scalar/list frontmatter subset. No YAML tags, objects or execution. */
export function parseLegacyFrontmatter(input: string): { metadata: Record<string, string | string[]>; body: string } {
  if (Buffer.byteLength(input) > 2_000_000) throw new Error('Legacy source exceeds 2 MB');
  const normalized = input.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const match = /^---\n([\s\S]*?)\n---(?:\n|$)([\s\S]*)$/.exec(normalized);
  if (!match) throw new Error('Legacy frontmatter is missing');
  const metadata: Record<string, string | string[]> = {};
  let listKey: string | null = null;
  const scalar = (value: string): string => {
    if (value.startsWith('"')) {
      const parsed: unknown = JSON.parse(value);
      if (typeof parsed !== 'string') throw new Error('Expected a quoted string');
      return parsed;
    }
    if (value.startsWith("'")) {
      if (!value.endsWith("'")) throw new Error('Unterminated string');
      return value.slice(1, -1).replace(/''/g, "'");
    }
    if (/^[!&*{[>|]/.test(value)) throw new Error('Unsupported frontmatter structure');
    return value;
  };
  for (const line of match[1]!.split('\n')) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const item = /^\s+-\s+(.+)$/.exec(line);
    if (item) {
      if (!listKey) throw new Error('Unexpected frontmatter list item');
      (metadata[listKey] as string[]).push(scalar(item[1]!));
      continue;
    }
    const entry = /^([a-zA-Z][a-zA-Z0-9]*):\s*(.*)$/.exec(line);
    if (!entry || entry[1] === '__proto__' || Object.hasOwn(metadata, entry[1]!)) throw new Error('Unsupported or duplicate frontmatter field');
    if (entry[2]!.startsWith('[')) {
      const values: unknown = JSON.parse(entry[2]!);
      if (!Array.isArray(values) || values.length > 100 || values.some((value) => typeof value !== 'string')) throw new Error('Expected a bounded string list');
      metadata[entry[1]!] = values as string[]; listKey = null; continue;
    }
    listKey = entry[2] ? null : entry[1]!;
    metadata[entry[1]!] = entry[2] ? scalar(entry[2]) : [];
  }
  return { metadata, body: match[2]! };
}

/** The legacy accordion omits closed answer text from SSR. Read string literals, never eval TSX. */
export function extractLegacyFaq(source: string): Array<{ question: string; answer: string }> {
  if (Buffer.byteLength(source) > 100_000) throw new Error('FAQ source exceeds bounds');
  const file = ts.createSourceFile('legacy-faq.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let result: Array<{ question: string; answer: string }> | null = null;
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'faqs') {
      if (!node.initializer || !ts.isArrayLiteralExpression(node.initializer)) throw new Error('FAQ must be a literal array');
      result = node.initializer.elements.map((item) => {
        if (!ts.isObjectLiteralExpression(item)) throw new Error('FAQ must contain literal objects');
        const values: Record<string, string> = {};
        for (const property of item.properties) {
          if (!ts.isPropertyAssignment(property) || !ts.isIdentifier(property.name) || !ts.isStringLiteral(property.initializer)) throw new Error('FAQ expressions are not allowed');
          if (!['question', 'answer'].includes(property.name.text) || Object.hasOwn(values, property.name.text)) throw new Error('Unexpected FAQ property');
          values[property.name.text] = property.initializer.text;
        }
        if (!values.question || !values.answer) throw new Error('Incomplete FAQ');
        return { question: values.question, answer: values.answer };
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  if (!result || !(result as unknown[]).length) throw new Error('No literal FAQ found');
  return result;
}

/** Small archived announcements use paragraphs, bold links and hr only; unknown markup fails. */
export function announcementTree(body: string): LegacyDomNode {
  if (/<(?!hr\s*\/?\s*>)/i.test(body)) throw new Error('Unsupported announcement markup requires review');
  const inline = (value: string): LegacyDomNode[] => {
    const result: LegacyDomNode[] = [];
    const pattern = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)]+)\)/g;
    let end = 0;
    for (const match of value.matchAll(pattern)) {
      if (match.index! > end) result.push({ tag: '#text', text: value.slice(end, match.index) });
      result.push(match[1] ? { tag: 'strong', children: [{ tag: '#text', text: match[1] }] } : { tag: 'a', attrs: { href: match[3]! }, children: [{ tag: '#text', text: match[2]! }] });
      end = match.index! + match[0].length;
    }
    if (end < value.length) result.push({ tag: '#text', text: value.slice(end) });
    return result;
  };
  return { tag: 'root', children: body.trim().split(/(<hr\s*\/?\s*>|\n\s*\n)/i).filter((part) => part.trim()).map((part) => /^<hr/i.test(part) ? { tag: 'hr' } : { tag: 'p', children: inline(part) }) };
}
